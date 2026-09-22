import { describe, it, expect } from 'vitest'
import {
  normalizza, slug, chiaveDaCodice, chiaveDaPiano, chiaveManuale,
  eManuale, eProvvisoria, abbina, type Abbinabile,
} from './chiavi'

describe('normalizzazione', () => {
  it('rende confrontabili le scritture diverse dello stesso nome', () => {
    expect(normalizza("Storia dell'industria")).toBe('storia dell industria')
    expect(normalizza('STORIA DELL’INDUSTRIA')).toBe('storia dell industria')
    expect(normalizza('Tecnologie per la sostenibilità')).toBe('tecnologie per la sostenibilita')
    expect(normalizza('  Disegno   e  modello ')).toBe('disegno e modello')
  })

  it('lo slug è compatto e senza spazi', () => {
    expect(slug('Laboratorio di basic design per il prodotto'))
      .toBe('laboratorio-di-basic-design-per-il-prodotto')
    expect(slug('Analisi matematica I', 10)).toBe('analisi-ma')
  })
})

describe('chiavi', () => {
  it('sono deterministiche: stesso dato, stessa chiave', () => {
    expect(chiaveDaCodice('10600096')).toBe('cat:10600096')
    expect(chiaveDaCodice(' 10600096 ')).toBe('cat:10600096')
    expect(chiaveDaPiano('33426', 'Teoria della forma'))
      .toBe(chiaveDaPiano('33426', 'Teoria della forma'))
  })

  it('lo stesso nome in corsi diversi resta distinto', () => {
    expect(chiaveDaPiano('33426', 'Fisica')).not.toBe(chiaveDaPiano('31807', 'Fisica'))
  })

  it('riconosce provenienza e provvisorietà', () => {
    expect(eManuale(chiaveManuale('Il mio esame', () => 'x1'))).toBe(true)
    expect(eProvvisoria(chiaveDaPiano('33426', 'Fisica'))).toBe(true)
    expect(eProvvisoria(chiaveDaCodice('123'))).toBe(false)
    expect(eManuale(chiaveDaCodice('123'))).toBe(false)
  })

  it('due inserimenti a mano con lo stesso nome non si sovrappongono', () => {
    let n = 0
    const a = chiaveManuale('Esame', () => `k${++n}`)
    const b = chiaveManuale('Esame', () => `k${++n}`)
    expect(a).not.toBe(b)
  })
})

describe('abbinamento', () => {
  const voci: Abbinabile[] = [
    { chiave: 'cat:1', nome: 'Teoria della forma', cfu: 6, codice: '10600096' },
    { chiave: 'cat:2', nome: 'Disegno e modello', cfu: 9, codice: '10622530' },
    { chiave: 'cat:3', nome: 'Laboratorio', cfu: 6, codice: '111' },
    { chiave: 'cat:4', nome: 'Laboratorio', cfu: 12, codice: '222' },
  ]

  it('il codice ha la precedenza', () => {
    const r = abbina({ nome: 'nome diverso', codice: '10600096' }, voci)
    expect(r).toEqual({ esito: 'codice', voce: voci[0] })
  })

  it('gli alias riconoscono lo stesso esame fra ordinamenti', () => {
    // 10622522 è lo stesso esame di 10600096 in un altro ordinamento
    const alias = { '10622522': '10600096' }
    const r = abbina({ nome: 'x', codice: '10622522' }, voci, alias)
    expect(r).toEqual({ esito: 'codice', voce: voci[0] })
  })

  it('senza codice usa nome normalizzato e CFU', () => {
    const r = abbina({ nome: 'TEORIA DELLA FORMA' }, voci)
    expect(r).toEqual({ esito: 'nome_cfu', voce: voci[0] })
  })

  it('i CFU sciolgono i nomi uguali', () => {
    const r = abbina({ nome: 'Laboratorio', cfu: 12 }, voci)
    expect(r).toEqual({ esito: 'nome_cfu', voce: voci[3] })
  })

  it('se resta ambiguo non sceglie: lo dichiara', () => {
    const r = abbina({ nome: 'Laboratorio' }, voci)
    expect(r.esito).toBe('ambiguo')
    if (r.esito === 'ambiguo') expect(r.candidati).toHaveLength(2)
  })

  it('non inventa somiglianze', () => {
    expect(abbina({ nome: 'Teoria della forme' }, voci)).toEqual({ esito: 'nessuno' })
    expect(abbina({ nome: 'Chimica' }, voci)).toEqual({ esito: 'nessuno' })
  })
})
