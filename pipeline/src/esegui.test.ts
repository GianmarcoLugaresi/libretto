// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { FETTE, PAGINE_PER_CORSO, fettaDelGiorno, fettaDi, leggiArgomenti, predefinite, selezione, stima, urlCoorte } from './esegui'
import type { Corso } from './tipi'

const corso = (codice: string): Corso => ({ codice, nome: `Corso ${codice}`, coorti: [] })

describe('argomenti', () => {
  it('senza argomenti usa le impostazioni base', () => {
    expect(leggiArgomenti([])).toEqual(predefinite)
  })

  it('legge compiti, corsi e radice', () => {
    const o = leggiArgomenti(['--compiti', 'appelli,piani', '--solo', '33426,31807', '--radice', '/tmp/x'])
    expect(o.compiti).toEqual(['appelli', 'piani'])
    expect(o.solo).toEqual(['33426', '31807'])
    expect(o.radice).toBe('/tmp/x')
  })

  it('un compito inventato si rifiuta subito', () => {
    expect(() => leggiArgomenti(['--compiti', 'appelli,pizza'])).toThrow(/pizza/)
  })

  it('un argomento sconosciuto si rifiuta', () => {
    expect(() => leggiArgomenti(['--turbo'])).toThrow(/turbo/)
  })

  it('--fetta oggi sceglie da sé, ma in modo ripetibile', () => {
    const g = new Date('2026-09-22T03:00:00Z')
    const a = leggiArgomenti(['--fetta', 'oggi'], g)
    const b = leggiArgomenti(['--fetta', 'oggi'], g)
    expect(a.fetta).toBe(b.fetta)
    expect(a.fetta).toBeGreaterThanOrEqual(0)
    expect(a.fetta).toBeLessThan(FETTE)
  })

  it('una fetta fuori scala si rifiuta', () => {
    expect(() => leggiArgomenti(['--fetta', '9'])).toThrow(/fra 0 e/)
    expect(() => leggiArgomenti(['--fetta', 'tanto'])).toThrow()
  })
})

describe('rotazione delle fette', () => {
  it('in sette giorni passano tutte', () => {
    const base = Date.parse('2026-09-22T00:00:00Z')
    const viste = new Set(Array.from({ length: FETTE }, (_, i) => fettaDelGiorno(new Date(base + i * 86_400_000))))
    expect(viste.size).toBe(FETTE)
  })

  it('un corso cade sempre nella stessa fetta', () => {
    expect(fettaDi('33426')).toBe(fettaDi('33426'))
  })

  it('in una settimana ogni corso passa una volta sola', () => {
    const corsi = Array.from({ length: 318 }, (_, i) => corso(String(30000 + i)))
    const totale = Array.from({ length: FETTE }, (_, f) =>
      selezione(corsi, { ...predefinite, fetta: f }).length)
    expect(totale.reduce((a, b) => a + b, 0)).toBe(318)
    // Le fette devono essere vagamente pari: nessuna oltre il doppio della media
    expect(Math.max(...totale)).toBeLessThan((318 / FETTE) * 2)
  })

  it('--solo restringe anche senza fetta', () => {
    const corsi = [corso('a'), corso('b'), corso('c')]
    expect(selezione(corsi, { ...predefinite, solo: ['b'] }).map(c => c.codice)).toEqual(['b'])
  })

  it('--solo e --fetta insieme: prima i corsi scelti, poi la fetta', () => {
    const corsi = [corso('a'), corso('b'), corso('c')]
    const f = fettaDi('b')
    expect(selezione(corsi, { ...predefinite, solo: ['b'], fetta: f }).map(c => c.codice)).toEqual(['b'])
    const altra = (f + 1) % FETTE
    expect(selezione(corsi, { ...predefinite, solo: ['b'], fetta: altra })).toEqual([])
  })
})

describe('stima del costo', () => {
  it('i soli appelli su tutto il catalogo stanno sotto l\'ora', () => {
    expect(stima(318, ['appelli']).minuti).toBeLessThan(60)
  })

  it('una fetta di piani sta in pochi minuti', () => {
    expect(stima(Math.ceil(318 / FETTE), ['piani']).minuti).toBeLessThan(20)
  })

  it('tutto il catalogo in un colpo non ci starebbe: per questo ci sono le fette', () => {
    expect(stima(318, ['appelli', 'piani', 'orari']).minuti).toBeGreaterThan(120)
  })
})

describe('la fetta non tocca gli appelli', () => {
  it('con una fetta, gli appelli restano su tutti i corsi chiesti', async () => {
    const { richiesti } = await import('./esegui')
    const corsi = Array.from({ length: 50 }, (_, i) => corso(String(30000 + i)))
    const o = { ...predefinite, fetta: 3 }
    expect(richiesti(corsi, o)).toHaveLength(50)
    expect(selezione(corsi, o).length).toBeLessThan(50)
  })

  it('--solo vale anche per gli appelli', async () => {
    const { richiesti } = await import('./esegui')
    const corsi = [corso('a'), corso('b')]
    expect(richiesti(corsi, { ...predefinite, solo: ['b'], fetta: 0 }).map(c => c.codice)).toEqual(['b'])
  })

  it('la stima conta gli appelli su tutti e i piani sulla fetta', () => {
    const conFetta = stima(46, ['appelli', 'piani'], 318)
    expect(conFetta.richieste).toBe(1 + 318 + Math.round(46 * PAGINE_PER_CORSO))
  })
})

describe('pagina di una coorte', () => {
  it('è l\'indirizzo a cui rimanda il form del sito', () => {
    expect(urlCoorte('33426', { anno: 2024, codiceCorso: '31807' }))
      .toBe('https://corsidilaurea.uniroma1.it/it/course/33426/attendance/lessons-plan?year=2024&code=31807')
  })
})
