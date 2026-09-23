// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { controllaIndice, controllaPiano, controllaAppelli } from './controlli'
import type { Appelli, Indice, Piano } from './tipi'

const comune = { schemaVersion: 1 as const, sources: ['https://x.it/a'], fetchedAt: new Date().toISOString() }

const indice = (n: number): Indice => ({
  ...comune, generatedAt: comune.fetchedAt, hash: {},
  corsi: Array.from({ length: n }, (_, i) => ({ codice: String(i), nome: `Corso ${i}`, coorti: [] })),
})

const ins = (codice: string, cfu = 6, extra = {}) => ({
  codice, nome: `Esame ${codice}`, anno: 1, semestre: 1, cfu,
  tipo: 'graded' as const, moduli: [], ...extra,
})
const piano = (n: number, extra: Partial<Piano> = {}): Piano => ({
  ...comune, codiceCorso: '33426', nomeCorso: 'Design', coorte: 2026, curricula: [],
  insegnamenti: Array.from({ length: n }, (_, i) => ins(String(i), 10)), gruppi: [], ...extra,
})
const appelli = (n: number, extra: Partial<Appelli> = {}): Appelli => ({
  ...comune, codiceCorso: '33426', alias: {},
  appelli: Array.from({ length: n }, (_, i) => ({
    codice: String(i), nome: `Esame ${i}`, data: '2099-01-10', docenti: [],
  })), ...extra,
})

describe('crollo del numero di voci', () => {
  it('zero voci dove prima ce n\'erano: si blocca', () => {
    const e = controllaPiano(piano(0), piano(20))
    expect(e.ok).toBe(false)
    expect(e.errori.join(' ')).toContain('parser')
  })

  it('meno della metà: si blocca', () => {
    expect(controllaIndice(indice(100), indice(318)).ok).toBe(false)
  })

  it('un calo lieve avvisa ma non blocca', () => {
    const e = controllaIndice(indice(240), indice(318))
    expect(e.ok).toBe(true)
    expect(e.avvisi.length).toBe(1)
  })

  it('una crescita non è mai un problema', () => {
    const e = controllaIndice(indice(340), indice(318))
    expect(e.ok).toBe(true)
    expect(e.avvisi).toEqual([])
  })

  it('senza un termine di confronto non si blocca nulla', () => {
    expect(controllaIndice(indice(5)).ok).toBe(true)
  })
})

describe('coerenza interna', () => {
  it('codici duplicati bloccano', () => {
    const p = piano(0, { insegnamenti: [ins('a'), ins('a')] })
    expect(controllaPiano(p).ok).toBe(false)
  })

  it('un indice vuoto blocca', () => {
    expect(controllaIndice(indice(0)).ok).toBe(false)
  })

  it('i CFU fuori scala avvisano', () => {
    const p = piano(0, { insegnamenti: [ins('a', 5)] })
    expect(controllaPiano(p).avvisi.join(' ')).toContain('fuori scala')
  })

  it('i CFU del piano si contano una alternativa per gruppo', () => {
    const p = piano(0, {
      insegnamenti: [
        ins('base', 156),
        ins('x', 12, { gruppo: '1° gruppo opzionale' }),
        ins('y', 12, { gruppo: '1° gruppo opzionale' }),
        ins('z', 12, { gruppo: '1° gruppo opzionale' }),
      ],
      gruppi: [{ nome: '1° gruppo opzionale', cfuRichiesti: 12, codici: ['x', 'y', 'z'] }],
    })
    // 156 + 12 = 168, dentro scala: nessun avviso sui CFU
    expect(controllaPiano(p).avvisi.filter(a => a.includes('CFU del piano'))).toEqual([])
  })

  it('moduli che non tornano col padre avvisano', () => {
    const p = piano(0, {
      insegnamenti: [ins('a', 12, { moduli: [{ nome: 'M1', cfu: 6 }] })],
    })
    expect(controllaPiano(p).avvisi.join(' ')).toContain('moduli fanno 6')
  })
})

describe('appelli', () => {
  it('prenotazioni che chiudono prima di aprire: avviso', () => {
    const a = appelli(0, {
      appelli: [{ codice: '1', nome: 'X', data: '2099-02-01', docenti: [], prenotazioniDal: '2099-01-20', prenotazioniAl: '2099-01-10' }],
    })
    expect(controllaAppelli(a).avvisi.join(' ')).toContain('chiudono prima di aprire')
  })

  it('prenotazioni che chiudono dopo l\'appello: avviso', () => {
    const a = appelli(0, {
      appelli: [{ codice: '1', nome: 'X', data: '2099-02-01', docenti: [], prenotazioniAl: '2099-03-01' }],
    })
    expect(controllaAppelli(a).avvisi.join(' ')).toContain('dopo')
  })

  it('un alias circolare blocca', () => {
    expect(controllaAppelli(appelli(1, { alias: { a: 'a' } })).ok).toBe(false)
  })

  it('una catena di alias blocca', () => {
    expect(controllaAppelli(appelli(1, { alias: { a: 'b', b: 'c' } })).ok).toBe(false)
  })

  it('solo appelli passati: avviso, la pagina forse non è aggiornata', () => {
    const a = appelli(0, { appelli: [{ codice: '1', nome: 'X', data: '2020-01-01', docenti: [] }] })
    expect(controllaAppelli(a).avvisi.join(' ')).toContain('non essere ancora aggiornata')
  })
})

describe('gruppi che si contraddicono', () => {
  it('chiedere 6 CFU fra esami da 12 è un avviso, non un blocco', () => {
    const p = piano(0, {
      insegnamenti: [ins('base', 156), ins('x', 12, { gruppo: 'g1' }), ins('y', 12, { gruppo: 'g1' })],
      gruppi: [{ nome: 'g1', cfuRichiesti: 6, codici: ['x', 'y'] }],
    })
    const e = controllaPiano(p)
    expect(e.ok).toBe(true)
    expect(e.avvisi.join(' ')).toContain('chiede 6 CFU ma ogni esame ne vale almeno 12')
  })
})
