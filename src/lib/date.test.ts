/* ============================================================
   Le date sono stringhe "yyyy-mm-dd" interpretate in ora locale.
   Il rischio vero è lo scivolamento di un giorno dovuto a UTC:
   questi test lo sorvegliano.
   ============================================================ */

import { describe, it, expect } from 'vitest'
import {
  daISO, aISO, addGiorni, giorniTra, giornoSettimana, lunediDi,
  fmtData, meseAnno, quando, minuti, durata, annoAccademico,
  sessione, semestreCorrente, settimana, grigliaMese,
} from './date'

describe('conversioni', () => {
  it('non slittano di un giorno per il fuso', () => {
    // new Date('2026-01-01') sarebbe UTC e a Roma diventerebbe 31 dicembre
    const d = daISO('2026-01-01')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(0)
    expect(d.getDate()).toBe(1)
    expect(aISO(d)).toBe('2026-01-01')
  })

  it('aISO mette lo zero davanti a mesi e giorni', () => {
    expect(aISO(new Date(2026, 8, 5))).toBe('2026-09-05')
  })
})

describe('aritmetica dei giorni', () => {
  it('attraversa i confini di mese e anno', () => {
    expect(addGiorni('2026-01-31', 1)).toBe('2026-02-01')
    expect(addGiorni('2026-12-31', 1)).toBe('2027-01-01')
    expect(addGiorni('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('regge il 29 febbraio degli anni bisestili', () => {
    expect(addGiorni('2028-02-28', 1)).toBe('2028-02-29')
    expect(addGiorni('2026-02-28', 1)).toBe('2026-03-01')
  })

  it('giorniTra conta i giorni di calendario, con segno', () => {
    expect(giorniTra('2026-01-01', '2026-01-08')).toBe(7)
    expect(giorniTra('2026-01-08', '2026-01-01')).toBe(-7)
    expect(giorniTra('2026-01-01', '2026-01-01')).toBe(0)
  })

  it('non sbaglia il conteggio al cambio dell\'ora legale', () => {
    // in Italia l'ora legale finisce l'ultima domenica di ottobre:
    // quel giorno ha 25 ore, e una divisione per 86.400.000 sbaglierebbe
    expect(giorniTra('2026-10-24', '2026-10-26')).toBe(2)
    expect(giorniTra('2026-03-28', '2026-03-30')).toBe(2)
  })
})

describe('settimana', () => {
  it('usa la numerazione ISO: lunedì = 1, domenica = 7', () => {
    expect(giornoSettimana('2026-09-14')).toBe(1)   // lunedì
    expect(giornoSettimana('2026-09-20')).toBe(7)   // domenica
  })

  it('lunediDi riporta al lunedì, anche di domenica', () => {
    expect(lunediDi('2026-09-16')).toBe('2026-09-14')
    expect(lunediDi('2026-09-20')).toBe('2026-09-14')
    expect(lunediDi('2026-09-14')).toBe('2026-09-14')
  })

  it('settimana dà sette date da lunedì a domenica', () => {
    const s = settimana('2026-09-16')
    expect(s).toHaveLength(7)
    expect(s[0]).toBe('2026-09-14')
    expect(s[6]).toBe('2026-09-20')
  })
})

describe('formattazione', () => {
  it('scrive le date in italiano', () => {
    expect(fmtData('2026-09-15', 'lungo')).toBe('15 settembre 2026')
    expect(fmtData('2026-09-15', 'medio')).toBe('15 set 2026')
    expect(fmtData('2026-09-15', 'breve')).toBe('15 set')
    expect(fmtData('2026-09-15', 'giorno')).toBe('martedì 15 set')
    expect(meseAnno('2026-09-15')).toBe('settembre 2026')
  })

  it('quando parla come una persona', () => {
    const o = '2026-09-15'
    expect(quando(o, o)).toBe('oggi')
    expect(quando('2026-09-16', o)).toBe('domani')
    expect(quando('2026-09-17', o)).toBe('dopodomani')
    expect(quando('2026-09-14', o)).toBe('ieri')
    expect(quando('2026-09-19', o)).toBe('fra 4 giorni')
    expect(quando('2026-09-22', o)).toBe('fra una settimana')
    expect(quando('2026-09-29', o)).toBe('fra 2 settimane')
    expect(quando('2026-09-10', o)).toBe('5 giorni fa')
  })
})

describe('orari', () => {
  it('minuti conta dall\'inizio del giorno', () => {
    expect(minuti('00:00')).toBe(0)
    expect(minuti('09:30')).toBe(570)
    expect(minuti('23:59')).toBe(1439)
  })

  it('durata si legge in ore e minuti', () => {
    expect(durata('09:00', '11:00')).toBe('2h')
    expect(durata('09:00', '11:30')).toBe('2h 30m')
    expect(durata('09:00', '09:45')).toBe('45m')
  })
})

describe('calendario accademico', () => {
  it('l\'anno accademico gira a settembre', () => {
    expect(annoAccademico('2026-08-31')).toBe('2025/26')
    expect(annoAccademico('2026-09-01')).toBe('2026/27')
    expect(annoAccademico('2027-01-15')).toBe('2026/27')
  })

  it('le sessioni seguono il calendario Sapienza', () => {
    expect(sessione('2027-01-20').chiave).toBe('invernale')
    expect(sessione('2026-06-15').chiave).toBe('estiva')
    expect(sessione('2026-09-10').chiave).toBe('autunnale')
    expect(sessione('2026-04-10').chiave).toBe('straordinaria')
  })

  it('il semestre in corso è 0 fuori dai periodi di lezione', () => {
    expect(semestreCorrente('2026-10-15')).toBe(1)
    expect(semestreCorrente('2026-04-15')).toBe(2)
    expect(semestreCorrente('2026-07-15')).toBe(0)
  })
})

describe('griglia mensile', () => {
  it('sono 42 caselle che partono da un lunedì', () => {
    const g = grigliaMese(2026, 8)   // settembre 2026
    expect(g).toHaveLength(42)
    expect(giornoSettimana(g[0])).toBe(1)
    expect(g).toContain('2026-09-01')
    expect(g).toContain('2026-09-30')
  })
})
