import { describe, it, expect, beforeEach } from 'vitest'
import { apriCatalogo, ARCHIVI, type DepositoCatalogo } from './deposito'
import { CatalogoRemoto } from './catalogoRemoto'
import {
  appelliDellaCoorte, cercaCorsi, codiceDellaCoorte, disponibilita, serveControllare,
  type Appelli, type Indice, type Piano,
} from './dati'
import { normalizza } from './chiavi'

const BASE = 'https://esempio.test/data/v1/'
const quando = '2026-09-23T04:30:00.000Z'
const comune = { schemaVersion: 1 as const, sources: ['https://corsidilaurea.uniroma1.it/it'], fetchedAt: quando }

const indice = (hash: Record<string, string>): Indice => ({
  ...comune, generatedAt: quando, hash,
  corsi: [
    { codice: '33426', nome: 'Design', classe: 'L-4', coorti: [
      { anno: 2026, etichetta: '2026/2027', codiceCorso: '33426' },
      { anno: 2024, etichetta: '2024/2025', codiceCorso: '31807' },
    ] },
    { codice: '30000', nome: 'Architettura', classe: 'LM-4', coorti: [] },
  ],
})

const piano: Piano = {
  ...comune, codiceCorso: '33426', nomeCorso: 'Design', coorte: 2026, curricula: [], gruppi: [],
  insegnamenti: [{ codice: '10589128', nome: 'DISEGNO E MODELLO', anno: 2, semestre: 1, cfu: 9, tipo: 'graded', moduli: [] }],
}

const appelli: Appelli = {
  ...comune, codiceCorso: '33426', alias: {},
  appelli: [
    { codice: '10589128', nome: 'DISEGNO E MODELLO', codiceCorso: '33426', data: '2027-01-18', docenti: [] },
    { codice: '10589128', nome: 'DISEGNO E MODELLO', codiceCorso: '31807', data: '2027-01-19', docenti: [] },
    { codice: '1', nome: 'SENZA CODICE CORSO', data: '2027-02-01', docenti: [] },
  ],
}

/** Un server finto: tiene i file e conta le richieste. */
function server(file: Record<string, unknown>) {
  const chieste: string[] = []
  let giu = false
  const f = (async (url: string | URL | Request) => {
    const u = String(url)
    chieste.push(u.replace(BASE, ''))
    if (giu) throw new TypeError('Failed to fetch')
    const p = u.replace(BASE, '')
    if (!(p in file)) return new Response('', { status: 404 })
    const v = file[p]
    return new Response(typeof v === 'string' ? v : JSON.stringify(v), { status: 200 })
  }) as typeof fetch
  return { f, chieste, spegni: () => { giu = true }, file }
}

let dep: DepositoCatalogo
beforeEach(async () => {
  dep = await apriCatalogo()
  for (const a of ARCHIVI) await dep.svuota(a)
})

const cat = (f: typeof fetch) => new CatalogoRemoto(dep, BASE, f, () => new Date(quando))

describe('indice', () => {
  it('lo scarica, lo valida e lo tiene', async () => {
    const s = server({ 'index.json': indice({}) })
    const c = cat(s.f)
    expect(await c.aggiornaIndice()).toBe('aggiornato')
    expect((await c.indice())?.corsi).toHaveLength(2)
    expect(await c.aggiornatoIl()).toBe(quando)
  })

  it('senza rete tiene quello che ha, e non esplode', async () => {
    const s = server({ 'index.json': indice({}) })
    const c = cat(s.f)
    await c.aggiornaIndice()
    s.spegni()
    expect(await c.aggiornaIndice()).toBe('offline')
    expect((await c.indice())?.corsi).toHaveLength(2)
  })

  it('un file che non passa lo schema non sostituisce quello buono', async () => {
    const s = server({ 'index.json': indice({}) })
    const c = cat(s.f)
    await c.aggiornaIndice()
    s.file['index.json'] = { ...indice({}), schemaVersion: 99 }
    expect(await c.aggiornaIndice()).toBe('non-valido')
    expect((await c.indice())?.schemaVersion).toBe(1)
  })

  it('un JSON rotto è non valido, non un crash', async () => {
    const s = server({ 'index.json': '{ rotto' })
    expect(await cat(s.f).aggiornaIndice()).toBe('non-valido')
  })

  it('un errore del server vale come rete assente', async () => {
    const f = (async () => new Response('', { status: 503 })) as unknown as typeof fetch
    expect(await cat(f).aggiornaIndice()).toBe('offline')
  })
})

describe('file di un corso', () => {
  const hash = {
    'courses/33426/2026/plan.json': 'aaaa',
    'courses/33426/exams.json': 'bbbb',
  }

  it('scarica ciò che l\'indice elenca', async () => {
    const s = server({ 'index.json': indice(hash), 'courses/33426/2026/plan.json': piano, 'courses/33426/exams.json': appelli })
    const c = cat(s.f)
    await c.aggiornaIndice()
    expect(await c.aggiornaCorso('33426', 2026)).toEqual({ piano: 'aggiornato', appelli: 'aggiornato', orario: 'assente' })
    expect((await c.piano('33426', 2026))?.insegnamenti[0].codice).toBe('10589128')
  })

  it('non chiede un file che l\'indice non elenca', async () => {
    const s = server({ 'index.json': indice(hash), 'courses/33426/2026/plan.json': piano, 'courses/33426/exams.json': appelli })
    const c = cat(s.f)
    await c.aggiornaIndice()
    await c.aggiornaCorso('33426', 2026)
    expect(s.chieste).not.toContain('courses/33426/2026/timetable.json')
  })

  it('con la stessa impronta non riscarica', async () => {
    const s = server({ 'index.json': indice(hash), 'courses/33426/2026/plan.json': piano, 'courses/33426/exams.json': appelli })
    const c = cat(s.f)
    await c.aggiornaIndice()
    await c.aggiornaCorso('33426', 2026)
    s.chieste.length = 0
    expect(await c.aggiornaCorso('33426', 2026)).toEqual({ piano: 'invariato', appelli: 'invariato', orario: 'assente' })
    expect(s.chieste).toEqual([])
  })

  it('con un\'impronta nuova riscarica solo quel file', async () => {
    const s = server({ 'index.json': indice(hash), 'courses/33426/2026/plan.json': piano, 'courses/33426/exams.json': appelli })
    const c = cat(s.f)
    await c.aggiornaIndice()
    await c.aggiornaCorso('33426', 2026)
    s.file['index.json'] = indice({ ...hash, 'courses/33426/exams.json': 'cccc' })
    await c.aggiornaIndice()
    s.chieste.length = 0
    await c.aggiornaCorso('33426', 2026)
    expect(s.chieste).toEqual(['courses/33426/exams.json'])
  })

  it('offline, i file già scaricati restano leggibili', async () => {
    const s = server({ 'index.json': indice(hash), 'courses/33426/2026/plan.json': piano, 'courses/33426/exams.json': appelli })
    const c = cat(s.f)
    await c.aggiornaIndice()
    await c.aggiornaCorso('33426', 2026)
    s.spegni()
    const nuovo = cat(s.f)
    expect((await nuovo.piano('33426', 2026))?.nomeCorso).toBe('Design')
    expect((await nuovo.appelli('33426'))?.appelli).toHaveLength(3)
  })
})

describe('letture sull\'indice', () => {
  it('disponibilità: piani anche delle coorti col codice vecchio', () => {
    const d = disponibilita(indice({
      'courses/33426/2026/plan.json': 'a', 'courses/31807/2024/plan.json': 'b',
      'courses/33426/exams.json': 'c', 'courses/33426/2026/timetable.json': 'd',
      'courses/30000/2026/plan.json': 'e',
    }), '33426')
    expect(d).toEqual({ piani: [2026, 2024], orari: [2026], appelli: true })
  })

  it('senza indice non c\'è niente', () => {
    expect(disponibilita(undefined, '33426')).toEqual({ piani: [], orari: [], appelli: false })
  })

  it('il codice di una coorte vecchia è il suo, non quello del corso', () => {
    const design = indice({}).corsi[0]
    expect(codiceDellaCoorte(design, 2024)).toBe('31807')
    expect(codiceDellaCoorte(design, 2026)).toBe('33426')
  })

  it('appelli della coorte: le righe senza codice corso valgono per tutti', () => {
    expect(appelliDellaCoorte(appelli, '31807').map(a => a.data)).toEqual(['2027-01-19', '2027-02-01'])
  })

  it('ricerca senza accenti, e prima chi comincia con la parola', () => {
    const corsi = [
      { codice: '1', nome: 'Architettura e design', coorti: [] },
      { codice: '2', nome: 'Design', coorti: [] },
      { codice: '3', nome: 'Ingegneria', coorti: [] },
    ]
    expect(cercaCorsi(corsi, 'désign', normalizza).map(c => c.codice)).toEqual(['2', '1'])
    expect(cercaCorsi(corsi, '3', normalizza).map(c => c.codice)).toEqual(['3'])
  })

  it('si ricontrolla dopo sei ore, non prima', () => {
    const t = new Date('2026-09-23T12:00:00Z')
    expect(serveControllare(undefined, t)).toBe(true)
    expect(serveControllare('2026-09-23T08:00:00Z', t)).toBe(false)
    expect(serveControllare('2026-09-23T05:59:00Z', t)).toBe(true)
    expect(serveControllare('non una data', t)).toBe(true)
  })
})

describe('coorte con un codice suo', () => {
  it('piano sul codice della coorte, appelli su quello del corso', async () => {
    const hash = { 'courses/31807/2024/plan.json': 'p', 'courses/33426/exams.json': 'e' }
    const s = server({
      'index.json': indice(hash),
      'courses/31807/2024/plan.json': { ...piano, codiceCorso: '31807', coorte: 2024 },
      'courses/33426/exams.json': appelli,
    })
    const c = cat(s.f)
    await c.aggiornaIndice()
    expect(await c.aggiornaCorso('31807', 2024, '33426')).toEqual({ piano: 'aggiornato', appelli: 'aggiornato', orario: 'assente' })
    expect((await c.piano('31807', 2024))?.coorte).toBe(2024)
    expect(appelliDellaCoorte(await c.appelli('33426'), '31807')).toHaveLength(2)
  })
})

describe('alias negli appelli', () => {
  it('lo stesso esame con due codici alias si mostra una volta, col codice canonico', () => {
    const a: Appelli = {
      ...comune, codiceCorso: '33452', alias: { '10622113': '10630886' },
      appelli: [
        { codice: '10622113', nome: 'ISTOLOGIA', codiceCorso: '33452', data: '2027-02-11', docenti: ['VICINI ELENA'] },
        { codice: '10630886', nome: 'ISTOLOGIA', codiceCorso: '33452', data: '2027-02-11', docenti: ['VICINI ELENA', 'ALTRA'] },
        { codice: '10630886', nome: 'ISTOLOGIA', codiceCorso: '33452', data: '2027-06-11', docenti: [] },
      ],
    }
    const r = appelliDellaCoorte(a, '33452')
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({ codice: '10630886', data: '2027-02-11', docenti: ['VICINI ELENA', 'ALTRA'] })
  })
})

describe('istanti', () => {
  it('nell\'ora del telefono, non in UTC', async () => {
    const { fmtIstante } = await import('./date')
    const d = new Date(2026, 8, 23, 15, 58)
    expect(fmtIstante(d.toISOString())).toBe('23 set 2026 alle 15:58')
    expect(fmtIstante('non una data')).toBe('')
  })
})
