// @vitest-environment node
/* Un giro completo sulle pagine vere di Sapienza salvate in
   fixture: dall'indice ai file che l'app scaricherà. Serve a
   vedere che i pezzi combacino, non solo che funzionino da soli. */
import { describe, it, expect, beforeEach } from 'vitest'
import { readFile, mkdtemp } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { esegui, predefinite, type Opzioni } from './esegui'
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
  if (u.includes('/attendance/lessons-plan')) return risposta(await fixture('design-piano.html'))
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

  it('visita anche il codice corso delle coorti vecchie', async () => {
    await esegui(opzioni({ compiti: ['piani'] }))
    expect(chiamate.some(u => u.includes('/course/31807/attendance/lessons-plan'))).toBe(true)
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
})
