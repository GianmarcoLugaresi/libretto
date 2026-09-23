/* ============================================================
   Selettori derivati: quali lezioni valgono oggi, quali appelli
   sono ancora aperti, cosa resta da registrare.
   ============================================================ */

import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  insegnamento, esameDi, lezioniDel, lezioneInCorso, prossimaLezione,
  appelliFuturi, prenotazioni, daRegistrare, perAnno,
} from './query'
import type { Stato, Insegnamento, Lezione, Appello, Esame } from './types'
import { IMPOSTAZIONI_DEFAULT, profiloDefault } from './seed'

/** Congela l'orologio: i selettori dipendono da "adesso". */
function adesso(iso: string, ora = '10:00') {
  vi.useFakeTimers()
  const [y, m, d] = iso.split('-').map(Number)
  const [h, mi] = ora.split(':').map(Number)
  vi.setSystemTime(new Date(y, m - 1, d, h, mi))
}
afterEach(() => vi.useRealTimers())

const ins = (id: string, nome = id): Insegnamento =>
  ({ id, nome, cfu: 6, anno: 1, semestre: 1, tipo: 'obbligatorio', tinta: 0 })

function stato(p: {
  insegnamenti?: Insegnamento[]; lezioni?: Lezione[]
  appelli?: Appello[]; esami?: Record<string, Esame>
} = {}): Stato {
  return {
    versione: 1,
    profilo: profiloDefault(),
    impostazioni: { ...IMPOSTAZIONI_DEFAULT },
    insegnamenti: p.insegnamenti ?? [],
    esami: p.esami ?? {},
    appelli: p.appelli ?? [],
    lezioni: p.lezioni ?? [],
    sync: {},
    infostud: { esami: {}, daCollegare: [], prenotazioni: [] },
    onboarding: false,
  }
}

/* ---------------- Lezioni del giorno ---------------- */

describe('lezioni del giorno', () => {
  const base = (extra: Partial<Lezione> = {}): Lezione =>
    ({ id: 'l1', insegnamentoId: 'a', giorno: 2, inizio: '09:00', fine: '11:00', ...extra })

  it('prende solo quelle del giorno giusto della settimana', () => {
    const s = stato({ insegnamenti: [ins('a')], lezioni: [base()] })
    expect(lezioniDel(s, '2026-09-15')).toHaveLength(1)   // martedì
    expect(lezioniDel(s, '2026-09-16')).toHaveLength(0)   // mercoledì
  })

  it('rispetta il periodo di validità', () => {
    const s = stato({
      insegnamenti: [ins('a')],
      lezioni: [base({ dal: '2026-09-28', al: '2027-01-13' })],
    })
    expect(lezioniDel(s, '2026-09-15')).toHaveLength(0)   // prima dell'inizio
    expect(lezioniDel(s, '2026-09-29')).toHaveLength(1)   // dentro
    expect(lezioniDel(s, '2027-01-19')).toHaveLength(0)   // dopo la fine
  })

  it('salta le date sospese', () => {
    const s = stato({
      insegnamenti: [ins('a')],
      lezioni: [base({ saltate: ['2026-09-15'] })],
    })
    expect(lezioniDel(s, '2026-09-15')).toHaveLength(0)
    expect(lezioniDel(s, '2026-09-22')).toHaveLength(1)
  })

  it('ignora le lezioni di insegnamenti cancellati', () => {
    const s = stato({ insegnamenti: [], lezioni: [base()] })
    expect(lezioniDel(s, '2026-09-15')).toHaveLength(0)
  })

  it('le ordina per ora di inizio', () => {
    const s = stato({
      insegnamenti: [ins('a'), ins('b')],
      lezioni: [
        base({ id: 'tardi', inizio: '14:00', fine: '16:00' }),
        base({ id: 'presto', insegnamentoId: 'b', inizio: '09:00', fine: '11:00' }),
      ],
    })
    expect(lezioniDel(s, '2026-09-15').map(r => r.lezione.id)).toEqual(['presto', 'tardi'])
  })
})

/* ---------------- Adesso e dopo ---------------- */

describe('lezione in corso', () => {
  it('è quella che contiene l\'ora attuale, estremi esclusi in coda', () => {
    const s = stato({
      insegnamenti: [ins('a')],
      lezioni: [{ id: 'l1', insegnamentoId: 'a', giorno: 2, inizio: '09:00', fine: '11:00' }],
    })
    adesso('2026-09-15', '10:00')
    expect(lezioneInCorso(s)?.lezione.id).toBe('l1')

    adesso('2026-09-15', '11:00')   // finita adesso: non è più in corso
    expect(lezioneInCorso(s)).toBeNull()

    adesso('2026-09-15', '08:59')
    expect(lezioneInCorso(s)).toBeNull()
  })
})

describe('prossima lezione', () => {
  it('salta quelle già cominciate e passa ai giorni seguenti', () => {
    const s = stato({
      insegnamenti: [ins('a'), ins('b')],
      lezioni: [
        { id: 'mattina', insegnamentoId: 'a', giorno: 2, inizio: '09:00', fine: '11:00' },
        { id: 'domani', insegnamentoId: 'b', giorno: 3, inizio: '09:00', fine: '11:00' },
      ],
    })
    adesso('2026-09-15', '08:00')
    expect(prossimaLezione(s)?.r.lezione.id).toBe('mattina')

    adesso('2026-09-15', '12:00')
    const p = prossimaLezione(s)
    expect(p?.r.lezione.id).toBe('domani')
    expect(p?.data).toBe('2026-09-16')
  })

  it('è null se non c\'è nulla entro una settimana', () => {
    adesso('2026-09-15', '12:00')
    expect(prossimaLezione(stato())).toBeNull()
  })
})

/* ---------------- Appelli ---------------- */

describe('appelli', () => {
  const app = (id: string, data: string, insId = 'a'): Appello =>
    ({ id, insegnamentoId: insId, data, tipo: 'scritto' })

  it('i futuri partono da oggi compreso, in ordine di data', () => {
    const s = stato({
      insegnamenti: [ins('a')],
      appelli: [app('tardi', '2026-10-01'), app('ieri', '2026-09-14'), app('oggi', '2026-09-15')],
    })
    adesso('2026-09-15')
    expect(appelliFuturi(s).map(x => x.appello.id)).toEqual(['oggi', 'tardi'])
  })

  it('prenotazioni tiene solo quelli collegati a un esame prenotato', () => {
    const s = stato({
      insegnamenti: [ins('a'), ins('b')],
      appelli: [app('p1', '2026-10-01'), app('p2', '2026-10-02', 'b')],
      esami: { a: { insegnamentoId: 'a', stato: 'prenotato', appelloId: 'p1' } },
    })
    adesso('2026-09-15')
    expect(prenotazioni(s).map(x => x.appello.id)).toEqual(['p1'])
  })

  it('daRegistrare trova le prenotazioni scadute senza esito', () => {
    const s = stato({
      insegnamenti: [ins('a'), ins('b')],
      appelli: [app('scaduto', '2026-09-10'), app('futuro', '2026-10-01', 'b')],
      esami: {
        a: { insegnamentoId: 'a', stato: 'prenotato', appelloId: 'scaduto' },
        b: { insegnamentoId: 'b', stato: 'prenotato', appelloId: 'futuro' },
      },
    })
    adesso('2026-09-15')
    expect(daRegistrare(s).map(x => x.appello.id)).toEqual(['scaduto'])
  })

  it('un esame già superato non resta da registrare', () => {
    const s = stato({
      insegnamenti: [ins('a')],
      appelli: [app('scaduto', '2026-09-10')],
      esami: { a: { insegnamentoId: 'a', stato: 'superato', voto: 28, data: '2026-09-10' } },
    })
    adesso('2026-09-15')
    expect(daRegistrare(s)).toHaveLength(0)
  })
})

/* ---------------- Raggruppamenti e default ---------------- */

describe('raggruppamento per anno', () => {
  it('ordina per anno, poi semestre (gli annuali in fondo), poi nome', () => {
    const v: Insegnamento[] = [
      { ...ins('c', 'Cosa'), anno: 2, semestre: 1 },
      { ...ins('b', 'Beta'), anno: 1, semestre: 0 },
      { ...ins('a', 'Alfa'), anno: 1, semestre: 2 },
      { ...ins('d', 'Delta'), anno: 1, semestre: 1 },
    ]
    const g = perAnno(v)
    expect(g.map(x => x.anno)).toEqual([1, 2])
    expect(g[0].voci.map(x => x.nome)).toEqual(['Delta', 'Alfa', 'Beta'])
  })
})

describe('accessi di base', () => {
  it('esameDi restituisce "da sostenere" per un esame mai toccato', () => {
    const s = stato({ insegnamenti: [ins('a')] })
    expect(esameDi(s, 'a')).toEqual({ insegnamentoId: 'a', stato: 'da_sostenere' })
  })

  it('insegnamento restituisce undefined se non c\'è', () => {
    expect(insegnamento(stato(), 'x')).toBeUndefined()
  })
})
