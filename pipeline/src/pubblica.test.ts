// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Pubblicatore, impronta, percorsi } from './pubblica'
import { controllaIndice, controllaPiano } from './controlli'
import { Piano } from './tipi'

const comune = { schemaVersion: 1 as const, sources: ['https://corsidilaurea.uniroma1.it/it/course/33426'], fetchedAt: '2026-09-22T08:00:00.000Z' }
const piano = (n: number, fetchedAt = comune.fetchedAt): Piano => ({
  ...comune, fetchedAt,
  codiceCorso: '33426', nomeCorso: 'Design', coorte: 2026, curricula: [], gruppi: [],
  insegnamenti: Array.from({ length: n }, (_, i) => ({
    codice: `100${i}`, nome: `Esame ${i}`, anno: 1, semestre: 1, cfu: 12,
    tipo: 'graded' as const, moduli: [],
  })),
})

let radice: string
beforeEach(async () => { radice = await mkdtemp(join(tmpdir(), 'pub-')) })

const leggi = async (p: string) => JSON.parse(await readFile(join(radice, p), 'utf8'))

describe('scrittura', () => {
  it('scrive il file e lo registra nell\'indice', async () => {
    const p = new Pubblicatore(radice)
    await p.caricaHashPrecedenti()
    await p.scrivi(percorsi.piano('33426', 2026), piano(15), Piano)
    await p.scriviIndice([{ codice: '33426', nome: 'Design', coorti: [] }], ['https://corsidilaurea.uniroma1.it/it'])

    const salvato = await leggi('courses/33426/2026/plan.json')
    expect(salvato.insegnamenti).toHaveLength(15)
    const indice = await leggi('index.json')
    expect(indice.hash['courses/33426/2026/plan.json']).toMatch(/^[0-9a-f]{16}$/)
  })

  it('un dato che non passa lo schema non tocca il disco', async () => {
    const p = new Pubblicatore(radice)
    const rotto = { ...piano(2), coorte: 'duemilaventisei' } as unknown as Piano
    expect(await p.scrivi('x.json', rotto, Piano)).toBeUndefined()
    await expect(readFile(join(radice, 'x.json'), 'utf8')).rejects.toThrow()
    expect(p.rapporto.bloccati).toEqual(['x.json'])
  })
})

describe('ultima versione buona', () => {
  it('un crollo di voci non sovrascrive il file di ieri', async () => {
    const via = percorsi.piano('33426', 2026)
    await mkdir(join(radice, 'courses/33426/2026'), { recursive: true })
    await writeFile(join(radice, via), JSON.stringify(piano(15)), 'utf8')

    const p = new Pubblicatore(radice)
    await p.caricaHashPrecedenti()
    const esito = await p.scrivi(via, piano(0), Piano, controllaPiano)

    expect(esito).toBeUndefined()
    expect((await leggi(via)).insegnamenti).toHaveLength(15)
    expect(p.rapporto.bloccati).toEqual([via])
  })

  it('l\'indice tiene l\'hash di ieri per un file bloccato', async () => {
    const via = percorsi.piano('33426', 2026)
    await mkdir(join(radice, 'courses/33426/2026'), { recursive: true })
    await writeFile(join(radice, via), JSON.stringify(piano(15)), 'utf8')
    await writeFile(join(radice, 'index.json'), JSON.stringify({
      ...comune, generatedAt: comune.fetchedAt, corsi: [], hash: { [via]: 'abc123' },
    }), 'utf8')

    const p = new Pubblicatore(radice)
    await p.caricaHashPrecedenti()
    await p.scrivi(via, piano(0), Piano, controllaPiano)
    await p.scriviIndice([], ['https://corsidilaurea.uniroma1.it/it'])

    expect((await leggi('index.json')).hash[via]).toBe('abc123')
  })

  it('un file precedente illeggibile non fa fallire la scrittura', async () => {
    const via = percorsi.piano('33426', 2026)
    await mkdir(join(radice, 'courses/33426/2026'), { recursive: true })
    await writeFile(join(radice, via), '{ non json', 'utf8')

    const p = new Pubblicatore(radice)
    await p.caricaHashPrecedenti()
    expect(await p.scrivi(via, piano(15), Piano, controllaPiano)).toBeDefined()
  })
})

describe('impronta', () => {
  it('ignora il momento in cui abbiamo guardato', () => {
    expect(impronta(piano(3, '2026-01-01T00:00:00.000Z')))
      .toBe(impronta(piano(3, '2026-09-22T08:00:00.000Z')))
  })

  it('cambia se cambia il contenuto', () => {
    expect(impronta(piano(3))).not.toBe(impronta(piano(4)))
  })

  it('non dipende dall\'ordine delle chiavi', () => {
    expect(impronta({ a: 1, b: [{ x: 1, y: 2 }] })).toBe(impronta({ b: [{ y: 2, x: 1 }], a: 1 }))
  })

  it('segna invariato un contenuto uguale a quello pubblicato', async () => {
    const via = percorsi.piano('33426', 2026)
    const p1 = new Pubblicatore(radice)
    await p1.caricaHashPrecedenti()
    await p1.scrivi(via, piano(15), Piano)
    await p1.scriviIndice([], ['https://corsidilaurea.uniroma1.it/it'])

    const p2 = new Pubblicatore(radice)
    await p2.caricaHashPrecedenti()
    const oggi = await p2.scrivi(via, piano(15, '2026-09-23T08:00:00.000Z'), Piano)
    expect(oggi?.invariato).toBe(true)

    const p3 = new Pubblicatore(radice)
    await p3.caricaHashPrecedenti()
    expect((await p3.scrivi(via, piano(16), Piano))?.invariato).toBe(false)
  })
})

describe('percorsi', () => {
  it('sono quelli attesi dall\'app', () => {
    expect(percorsi.piano('33426', 2026)).toBe('courses/33426/2026/plan.json')
    expect(percorsi.appelli('33426')).toBe('courses/33426/exams.json')
    expect(percorsi.orario('33426', 2026)).toBe('courses/33426/2026/timetable.json')
    expect(percorsi.programma('33426', '1055957', 'A')).toBe('courses/33426/syllabi/1055957-A.json')
    expect(percorsi.programma('33426', '1055957')).toBe('courses/33426/syllabi/1055957.json')
  })
})

describe('anche l\'indice passa dal controllo', () => {
  it('un indice dimezzato non sostituisce quello di ieri', async () => {
    const molti = Array.from({ length: 318 }, (_, i) => ({ codice: String(i), nome: `Corso ${i}`, coorti: [] }))
    const p1 = new Pubblicatore(radice)
    await p1.caricaHashPrecedenti()
    await p1.scriviIndice(molti, ['https://corsidilaurea.uniroma1.it/it'], controllaIndice)
    expect((await leggi('index.json')).corsi).toHaveLength(318)

    const p2 = new Pubblicatore(radice)
    await p2.caricaHashPrecedenti()
    await p2.scriviIndice(molti.slice(0, 20), ['https://corsidilaurea.uniroma1.it/it'], controllaIndice)

    expect((await leggi('index.json')).corsi).toHaveLength(318)
    expect(p2.rapporto.bloccati).toEqual(['index.json'])
  })
})

describe('scritture inutili', () => {
  it('un file identico non viene riscritto', async () => {
    const via = percorsi.piano('33426', 2026)
    const p1 = new Pubblicatore(radice)
    await p1.caricaHashPrecedenti()
    await p1.scrivi(via, piano(15), Piano)
    await p1.scriviIndice([], ['https://corsidilaurea.uniroma1.it/it'])
    const prima = (await stat(join(radice, via))).mtimeMs

    await new Promise(r => setTimeout(r, 10))
    const p2 = new Pubblicatore(radice)
    await p2.caricaHashPrecedenti()
    await p2.scrivi(via, piano(15, '2026-09-23T08:00:00.000Z'), Piano)

    expect((await stat(join(radice, via))).mtimeMs).toBe(prima)
  })

  it('se il file è sparito si riscrive anche a hash uguale', async () => {
    const via = percorsi.piano('33426', 2026)
    const p1 = new Pubblicatore(radice)
    await p1.caricaHashPrecedenti()
    await p1.scrivi(via, piano(15), Piano)
    await p1.scriviIndice([], ['https://corsidilaurea.uniroma1.it/it'])
    await rm(join(radice, via))

    const p2 = new Pubblicatore(radice)
    await p2.caricaHashPrecedenti()
    expect((await p2.scrivi(via, piano(15), Piano))?.invariato).toBe(false)
    expect((await leggi(via)).insegnamenti).toHaveLength(15)
  })
})
