/* ============================================================
   Il deposito: carriera in localStorage, catalogo in IndexedDB.
   ============================================================ */

import { describe, it, expect, beforeEach } from 'vitest'
import { depositoCarriera, apriCatalogo, CHIAVE_V1, VERSIONE_SCHEMA, type Carriera } from './deposito'
import { carrieraVuota } from './migrazione'

/* ---------------- Carriera ---------------- */

function finto() {
  const m = new Map<string, string>()
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v) },
    removeItem: (k: string) => { m.delete(k) },
  }
}

describe('carriera su localStorage', () => {
  it('scrive e rilegge lo stato', () => {
    const s = finto()
    const d = depositoCarriera(s)
    const c: Carriera = { ...carrieraVuota(), onboarding: false }
    d.scrivi(c)
    expect(d.leggiGrezzo()).toEqual(c)
  })

  it('trova i dati del vecchio schema quando il nuovo non c\'è ancora', () => {
    const s = finto()
    s.setItem(CHIAVE_V1, JSON.stringify({ versione: 1, insegnamenti: [] }))
    expect(depositoCarriera(s).leggiGrezzo()).toEqual({ versione: 1, insegnamenti: [] })
  })

  it('una volta migrato preferisce il nuovo e ignora il vecchio', () => {
    const s = finto()
    s.setItem(CHIAVE_V1, JSON.stringify({ versione: 1, nota: 'vecchio' }))
    depositoCarriera(s).scrivi({ ...carrieraVuota(), onboarding: false })
    expect((depositoCarriera(s).leggiGrezzo() as Carriera).versione).toBe(VERSIONE_SCHEMA)
  })

  it('con dati corrotti restituisce null invece di far esplodere l\'app', () => {
    const s = finto()
    s.setItem('mysapienza:carriera', '{rotto')
    expect(depositoCarriera(s).leggiGrezzo()).toBeNull()
  })

  it('se lo storage è negato (Safari privato) non solleva errori', () => {
    const negato = {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('denied') },
      removeItem: () => { throw new Error('denied') },
    }
    const d = depositoCarriera(negato)
    expect(d.leggiGrezzo()).toBeNull()
    expect(() => d.scrivi(carrieraVuota())).not.toThrow()
    expect(() => d.cancella()).not.toThrow()
  })

  it('cancella toglie sia il nuovo sia il vecchio', () => {
    const s = finto()
    s.setItem(CHIAVE_V1, '{}')
    const d = depositoCarriera(s)
    d.scrivi(carrieraVuota())
    d.cancella()
    expect(s.m.size).toBe(0)
  })
})

/* ---------------- Catalogo ---------------- */

describe('catalogo su IndexedDB', () => {
  beforeEach(async () => {
    const db = await apriCatalogo()
    for (const a of ['corsi', 'piani', 'appelli', 'orari', 'programmi', 'meta'] as const) await db.svuota(a)
    db.chiudi()
  })

  it('scrive e rilegge un piano', async () => {
    const db = await apriCatalogo()
    await db.metti('piani', '33426:2026', { insegnamenti: [{ codice: '10600096', nome: 'Teoria della forma' }] })
    expect(await db.prendi('piani', '33426:2026')).toEqual({
      insegnamenti: [{ codice: '10600096', nome: 'Teoria della forma' }],
    })
    expect(await db.prendi('piani', 'inesistente')).toBeUndefined()
    db.chiudi()
  })

  it('mettiMolti scrive tutto in una transazione sola', async () => {
    const db = await apriCatalogo()
    await db.mettiMolti('corsi', Array.from({ length: 318 }, (_, i) => ({
      chiave: String(30000 + i), valore: { codice: String(30000 + i), nome: `Corso ${i}` },
    })))
    expect(await db.chiavi('corsi')).toHaveLength(318)
    expect((await db.tutti<{ nome: string }>('corsi')).some(c => c.nome === 'Corso 317')).toBe(true)
    db.chiudi()
  })

  it('regge un catalogo grande, dove localStorage non arriverebbe', async () => {
    const db = await apriCatalogo()
    // ~6 MB: oltre il soffitto dei 5 MB di localStorage
    const grosso = { righe: Array.from({ length: 20000 }, (_, i) => ({ i, testo: 'x'.repeat(300) })) }
    await db.metti('programmi', 'grosso', grosso)
    const riletto = await db.prendi<typeof grosso>('programmi', 'grosso')
    expect(riletto!.righe).toHaveLength(20000)
    db.chiudi()
  })

  it('togli e svuota fanno pulizia', async () => {
    const db = await apriCatalogo()
    await db.mettiMolti('appelli', [
      { chiave: 'a', valore: 1 }, { chiave: 'b', valore: 2 },
    ])
    await db.togli('appelli', 'a')
    expect(await db.chiavi('appelli')).toEqual(['b'])
    await db.svuota('appelli')
    expect(await db.chiavi('appelli')).toEqual([])
    db.chiudi()
  })

  it('gli archivi non si mescolano fra loro', async () => {
    const db = await apriCatalogo()
    await db.metti('corsi', 'k', 'sono-un-corso')
    await db.metti('appelli', 'k', 'sono-un-appello')
    expect(await db.prendi('corsi', 'k')).toBe('sono-un-corso')
    expect(await db.prendi('appelli', 'k')).toBe('sono-un-appello')
    db.chiudi()
  })

  it('riaprendolo i dati sono ancora lì', async () => {
    const uno = await apriCatalogo()
    await uno.metti('meta', 'sync', { pubblicaIl: '2026-09-22T10:00:00Z' })
    uno.chiudi()
    const due = await apriCatalogo()
    expect(await due.prendi('meta', 'sync')).toEqual({ pubblicaIl: '2026-09-22T10:00:00Z' })
    due.chiudi()
  })
})
