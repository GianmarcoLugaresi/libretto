/* ============================================================
   La migrazione tocca i dati veri dello studente: questi test
   esistono perché un voto registrato mesi fa non sparisca in un
   cambio di schema.
   ============================================================ */

import { describe, it, expect } from 'vitest'
import { migra, carrieraVuota } from './migrazione'
import { VERSIONE_SCHEMA } from './deposito'
import { chiaveDaPiano, eManuale } from './chiavi'

let n = 0
const casuale = () => `r${++n}`

/** Uno stato v1 come quello che c'è oggi sui telefoni. */
function v1(extra: Record<string, unknown> = {}) {
  return {
    versione: 1,
    profilo: {
      nome: 'Giamma', catalogoId: 'design', corsoDiLaurea: 'Design',
      tipo: 'triennale', cfuTotali: 180, immatricolazione: 2025,
      annoCorrente: 2, durataAnni: 3,
    },
    impostazioni: { valoreLode: 30, puntiTesi: 6, tema: 'scuro', preavvisoGiorni: 7 },
    insegnamenti: [
      { id: 'a1b2c3', nome: 'Teoria della forma', cfu: 6, anno: 1, semestre: 2, tipo: 'caratterizzante', tinta: 3 },
      { id: 'd4e5f6', nome: 'Disegno e modello', cfu: 9, anno: 2, semestre: 1, tipo: 'caratterizzante', tinta: 5 },
    ],
    esami: {
      a1b2c3: { insegnamentoId: 'a1b2c3', stato: 'superato', voto: 28, lode: false, data: '2026-02-10', note: 'andata bene' },
      d4e5f6: { insegnamentoId: 'd4e5f6', stato: 'prenotato', appelloId: 'app1' },
    },
    appelli: [{ id: 'app1', insegnamentoId: 'd4e5f6', data: '2026-10-01', ora: '09:00', tipo: 'orale' }],
    lezioni: [{ id: 'lez1', insegnamentoId: 'd4e5f6', giorno: 2, inizio: '09:30', fine: '11:30', aula: 'Aula F3' }],
    onboarding: false,
    ...extra,
  }
}

describe('v1 → v2', () => {
  it('non perde nulla: voti, note, prenotazioni, appelli, lezioni', () => {
    const { carriera, passaggi } = migra(v1(), casuale)
    expect(passaggi).toBe(1)
    expect(carriera.versione).toBe(VERSIONE_SCHEMA)
    expect(carriera.insegnamenti).toHaveLength(2)
    expect(Object.keys(carriera.esami)).toHaveLength(2)
    expect(carriera.appelli).toHaveLength(1)
    expect(carriera.lezioni).toHaveLength(1)

    const teoria = carriera.insegnamenti.find(i => i.nome === 'Teoria della forma')!
    const esame = carriera.esami[teoria.id]
    expect(esame.voto).toBe(28)
    expect(esame.data).toBe('2026-02-10')
    expect(esame.note).toBe('andata bene')          // anche le note personali
    expect(carriera.profilo.nome).toBe('Giamma')
    expect(carriera.impostazioni.puntiTesi).toBe(6)
  })

  it('sostituisce gli id casuali con chiavi derivate dal piano', () => {
    const { carriera } = migra(v1(), casuale)
    const teoria = carriera.insegnamenti.find(i => i.nome === 'Teoria della forma')!
    expect(teoria.id).toBe(chiaveDaPiano('design', 'Teoria della forma'))
    expect(teoria.id).not.toBe('a1b2c3')
  })

  it('riscrive tutti i riferimenti, senza lasciare puntatori rotti', () => {
    const { carriera } = migra(v1(), casuale)
    const noti = new Set(carriera.insegnamenti.map(i => i.id))
    for (const a of carriera.appelli) expect(noti.has(a.insegnamentoId)).toBe(true)
    for (const l of carriera.lezioni) expect(noti.has(l.insegnamentoId)).toBe(true)
    for (const [k, e] of Object.entries(carriera.esami)) {
      expect(noti.has(k)).toBe(true)
      expect(e.insegnamentoId).toBe(k)
    }
    // la prenotazione punta ancora al suo appello
    const disegno = carriera.insegnamenti.find(i => i.nome === 'Disegno e modello')!
    expect(carriera.esami[disegno.id].appelloId).toBe('app1')
  })

  it('senza corso del catalogo gli insegnamenti restano personali', () => {
    const senzaCorso = v1({ profilo: { nome: 'X', corsoDiLaurea: 'Il mio corso', tipo: 'triennale', cfuTotali: 180, immatricolazione: 2025, annoCorrente: 1, durataAnni: 3 } })
    const { carriera } = migra(senzaCorso, casuale)
    for (const i of carriera.insegnamenti) expect(eManuale(i.id)).toBe(true)
    expect(Object.keys(carriera.esami)).toHaveLength(2)   // i voti ci sono comunque
  })

  it('due insegnamenti omonimi non si fondono: nessun voto viene sovrascritto', () => {
    const doppio = v1({
      insegnamenti: [
        { id: 'x1', nome: 'Laboratorio', cfu: 6, anno: 1, semestre: 1, tipo: 'caratterizzante', tinta: 0 },
        { id: 'x2', nome: 'Laboratorio', cfu: 12, anno: 2, semestre: 1, tipo: 'caratterizzante', tinta: 1 },
      ],
      esami: {
        x1: { insegnamentoId: 'x1', stato: 'superato', voto: 24 },
        x2: { insegnamentoId: 'x2', stato: 'superato', voto: 30 },
      },
      appelli: [], lezioni: [],
    })
    const { carriera, note } = migra(doppio, casuale)
    expect(carriera.insegnamenti).toHaveLength(2)
    const voti = Object.values(carriera.esami).map(e => e.voto).sort()
    expect(voti).toEqual([24, 30])                        // tutti e due salvi
    expect(note.join(' ')).toContain('più volte')
  })

  it('è idempotente: rifarla non cambia nulla', () => {
    const a = migra(v1(), casuale).carriera
    const b = migra(a, casuale)
    expect(b.passaggi).toBe(0)
    expect(b.carriera).toEqual(a)
  })
})

describe('difese', () => {
  it('da niente nasce uno stato pulito in onboarding', () => {
    for (const x of [null, undefined, 'stringa', 42, []]) {
      const { carriera } = migra(x, casuale)
      expect(carriera.onboarding).toBe(true)
      expect(carriera.insegnamenti).toHaveLength(0)
    }
  })

  it('scarta le voci illeggibili e lo dice, invece di rompersi', () => {
    const sporco = v1({
      insegnamenti: [
        { id: 'buono', nome: 'Valido', cfu: 6, anno: 1, semestre: 1, tipo: 'obbligatorio', tinta: 0 },
        { nome: 'Senza id', cfu: 6 },
        null,
      ],
      esami: {}, appelli: [], lezioni: [],
    })
    const { carriera, note } = migra(sporco, casuale)
    expect(carriera.insegnamenti).toHaveLength(1)
    expect(note.join(' ')).toContain('illeggibili')
  })

  it('un esame orfano non lascia un riferimento rotto', () => {
    const orfano = v1({
      insegnamenti: [{ id: 'solo', nome: 'Solo', cfu: 6, anno: 1, semestre: 1, tipo: 'obbligatorio', tinta: 0 }],
      esami: {
        solo: { insegnamentoId: 'solo', stato: 'superato', voto: 27 },
        sparito: { insegnamentoId: 'sparito', stato: 'superato', voto: 18 },
      },
      appelli: [], lezioni: [],
    })
    const { carriera, note } = migra(orfano, casuale)
    expect(Object.keys(carriera.esami)).toHaveLength(1)
    expect(note.join(' ')).toContain('non più nel piano')
  })

  it('appelli e lezioni che puntano nel vuoto non passano', () => {
    const rotto = v1({
      insegnamenti: [{ id: 'solo', nome: 'Solo', cfu: 6, anno: 1, semestre: 1, tipo: 'obbligatorio', tinta: 0 }],
      esami: {},
      appelli: [{ id: 'a', insegnamentoId: 'fantasma', data: '2026-10-01', tipo: 'scritto' }],
      lezioni: [{ id: 'l', insegnamentoId: 'fantasma', giorno: 1, inizio: '09:00', fine: '11:00' }],
    })
    const { carriera } = migra(rotto, casuale)
    expect(carriera.appelli).toHaveLength(0)
    expect(carriera.lezioni).toHaveLength(0)
  })

  it('carrieraVuota parte in onboarding con le impostazioni di base', () => {
    const c = carrieraVuota()
    expect(c.onboarding).toBe(true)
    expect(c.versione).toBe(VERSIONE_SCHEMA)
    expect(c.impostazioni.valoreLode).toBe(30)
    expect(c.sync).toEqual({})
  })
})
