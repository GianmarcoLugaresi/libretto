// @vitest-environment node
/* Un giro completo sulle pagine vere di Sapienza salvate in
   fixture: dall'indice ai file che l'app scaricherà. Serve a
   vedere che i pezzi combacino, non solo che funzionino da soli. */
import { describe, it, expect, beforeEach } from 'vitest'
import { readFile, mkdtemp } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { FETTE, esegui, fettaDi, predefinite, type Opzioni } from './esegui'
import { azzeraRitmo } from './http'

const qui = dirname(fileURLToPath(import.meta.url))
const fixture = (n: string) => readFile(join(qui, '..', 'fixture', n), 'utf8')

let radice: string
let chiamate: string[]

const risposta = (corpo: string, tipo = 'text/html') =>
  new Response(corpo, { status: 200, headers: { 'content-type': tipo, etag: 'W/"1"' } })

/** Il costruttore Response rifiuta 304 (stato senza corpo): per il
 *  finto basta un oggetto con la stessa forma. */
const nonCambiato = () =>
  ({ status: 304, ok: false, headers: new Headers(), text: async () => '' }) as unknown as Response

async function finto(url: string | URL | Request): Promise<Response> {
  const u = String(url)
  chiamate.push(u)
  if (u.endsWith('/it')) return risposta(await fixture('catalogo-indice.html'))
  if (u.includes('/33426/attendance/exams')) return risposta(await fixture('design-appelli.html'))
  if (u.includes('/attendance/lessons-plan')) {
    // Il sito risponde per coorte: la pagina nuda è la più recente.
    if (u.includes('year=2025&code=33426')) return risposta(await fixture('design-piano-2025.html'))
    if (u.includes('year=2024&code=31807')) return risposta(await fixture('design-piano-2024.html'))
    return risposta(await fixture('design-piano.html'))
  }
  if (u.includes('/timetable-data/')) {
    // Il feed risponde per mese: un mese pieno, gli altri vuoti.
    const corpo = u.includes('start=2026-10') ? await fixture('design-orario-2026-10.json') : '{"events":[]}'
    return risposta(corpo, 'application/json')
  }
  return new Response('', { status: 404 })
}

beforeEach(async () => {
  radice = await mkdtemp(join(tmpdir(), 'giro-'))
  chiamate = []
  azzeraRitmo()
})

const opzioni = (extra: Partial<Opzioni> = {}): Opzioni => ({
  ...predefinite,
  solo: ['33426'],
  radice: join(radice, 'data'),
  cache: join(radice, 'cache.json'),
  curati: join(radice, 'curati-che-non-esistono'),
  fetchImpl: finto as unknown as typeof fetch,
  attesaMs: 0,
  ...extra,
})

const leggi = async (p: string) => JSON.parse(await readFile(join(radice, 'data', p), 'utf8'))

describe('un giro completo su Design', () => {
  it('pubblica indice, piano, appelli e orario', async () => {
    const d = await esegui(opzioni())
    expect(d.errori).toEqual([])

    const indice = await leggi('index.json')
    expect(indice.corsi.length).toBeGreaterThan(300)
    expect(indice.corsi.find((c: { codice: string }) => c.codice === '33426').nome).toMatch(/Design/i)

    const piano = await leggi('courses/33426/2026/plan.json')
    expect(piano.insegnamenti.length).toBeGreaterThan(15)
    expect(piano.nomeCorso).toMatch(/Design/i)

    const appelli = await leggi('courses/33426/exams.json')
    expect(appelli.appelli.length).toBeGreaterThan(0)

    // L'orario esiste e non attribuisce nulla da sé
    const orario = await leggi('courses/33426/2026/timetable.json')
    expect(orario.adattatore).toBe('gomp-catalogo')
    expect(orario.lezioni.every((l: { anno?: number }) => l.anno != null)).toBe(true)
  })

  it('l\'indice registra l\'hash di ogni file pubblicato', async () => {
    await esegui(opzioni())
    const indice = await leggi('index.json')
    expect(Object.keys(indice.hash)).toEqual(
      expect.arrayContaining(['courses/33426/exams.json', 'courses/33426/2026/plan.json']),
    )
  })

  it('le coorti scoperte finiscono nell\'indice', async () => {
    await esegui(opzioni())
    const indice = await leggi('index.json')
    const design = indice.corsi.find((c: { codice: string }) => c.codice === '33426')
    expect(design.coorti.length).toBeGreaterThan(1)
    expect(design.coorti.map((k: { codiceCorso: string }) => k.codiceCorso)).toContain('31807')
  })

  it('pubblica un piano per ogni coorte, ognuno sotto il suo codice', async () => {
    const d = await esegui(opzioni({ compiti: ['indice', 'piani'] }))
    expect(d.errori).toEqual([])
    expect((await leggi('courses/33426/2026/plan.json')).insegnamenti).toHaveLength(27)
    expect((await leggi('courses/33426/2025/plan.json')).insegnamenti).toHaveLength(26)
    expect((await leggi('courses/31807/2024/plan.json')).insegnamenti).toHaveLength(25)
  })

  it('la pagina nuda di un codice vecchio non si visita: mostra un piano vuoto', async () => {
    await esegui(opzioni({ compiti: ['piani'] }))
    expect(chiamate.some(u => /\/course\/31807\/attendance\/lessons-plan$/.test(u))).toBe(false)
    expect(chiamate.some(u => u.includes('?year=2024&code=31807'))).toBe(true)
  })

  it('se il sito ignora la coorte chiesta, quel piano non si pubblica', async () => {
    const d = await esegui(opzioni({
      compiti: ['indice', 'piani'],
      fetchImpl: (async (u: string | URL | Request) => {
        const s = String(u)
        // Ogni coorte risponde con la pagina di sempre
        if (s.includes('lessons-plan')) return risposta(await fixture('design-piano.html'))
        return finto(u)
      }) as unknown as typeof fetch,
    }))
    expect(d.righe.join('\n')).toMatch(/coorte 2025: la pagina risponde con 33426\/2026, non pubblicato/)
    await expect(leggi('courses/33426/2025/plan.json')).rejects.toThrow()
  })

  it('il secondo giro non riscarica: gli etag bastano', async () => {
    await esegui(opzioni())
    const primo = chiamate.length
    chiamate = []
    azzeraRitmo()
    await esegui(opzioni({
      fetchImpl: (async (u: string | URL | Request) => {
        chiamate.push(String(u))
        return nonCambiato()
      }) as unknown as typeof fetch,
    }))
    // Stesse pagine chieste, ma nessuna riparsata: i file restano
    expect(chiamate.length).toBeLessThanOrEqual(primo)
    expect((await leggi('courses/33426/2026/plan.json')).insegnamenti.length).toBeGreaterThan(15)
  })

  it('--limite ferma il giro senza rompere nulla', async () => {
    const d = await esegui(opzioni({ limite: 2 }))
    expect(d.richieste).toBe(2)
    expect(d.errori).toEqual([])
  })

  it('--secco non scrive niente ma dice quanto costerebbe', async () => {
    const d = await esegui(opzioni({ secco: true }))
    expect(d.righe.join(' ')).toMatch(/a secco/)
    await expect(leggi('index.json')).rejects.toThrow()
  })

  it('una pagina che non risponde non ferma le altre', async () => {
    const d = await esegui(opzioni({
      solo: ['33426'],
      fetchImpl: (async (u: string | URL | Request) => {
        const s = String(u)
        if (s.includes('exams')) return new Response('', { status: 500 })
        return finto(u)
      }) as unknown as typeof fetch,
      compiti: ['indice', 'appelli', 'piani'],
    }))
    expect(d.errori.some(e => e.includes('appelli'))).toBe(true)
    expect((await leggi('courses/33426/2026/plan.json')).insegnamenti.length).toBeGreaterThan(15)
  })

  it('con una fetta che esclude Design, i suoi appelli escono lo stesso', async () => {
    const altra = (fettaDi('33426') + 1) % FETTE
    await esegui(opzioni({ fetta: altra }))
    expect((await leggi('courses/33426/exams.json')).appelli.length).toBeGreaterThan(0)
    await expect(leggi('courses/33426/2026/plan.json')).rejects.toThrow()
  })

  it('gli appelli delle coorti vecchie non si buttano: ognuno col suo codice corso', async () => {
    await esegui(opzioni({ compiti: ['indice', 'appelli'] }))
    const codici = new Set((await leggi('courses/33426/exams.json')).appelli.map((a: { codiceCorso?: string }) => a.codiceCorso))
    expect([...codici].sort()).toEqual(['31807', '33426'])
  })
})
