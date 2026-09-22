// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { leggiCsv, curatedAdapter } from './curato'

const intestazione = 'corso,anno,canale,nome,giorno,inizio,fine,aula,edificio,dal,al,saltate\n'

describe('lettura del CSV', () => {
  it('legge una riga completa', () => {
    const { righe, errori } = leggiCsv(intestazione +
      '33426,2,2º canale,Teoria e storia del design,mar,14:30,18:30,Aula 9,RM064,2026-09-28,2027-01-13,2026-12-08;2026-12-29')
    expect(errori).toEqual([])
    expect(righe[0]).toMatchObject({
      corso: '33426', anno: 2, canale: '2º canale',
      nome: 'Teoria e storia del design', giorno: 2,
      inizio: '14:30', fine: '18:30', aula: 'Aula 9', edificio: 'RM064',
      dal: '2026-09-28', al: '2027-01-13',
      saltate: ['2026-12-08', '2026-12-29'],
    })
  })

  it('accetta i giorni per nome o per numero', () => {
    const { righe } = leggiCsv(intestazione +
      '1,1,,A,lun,09:00,11:00,,,,,\n1,1,,B,giovedì,09:00,11:00,,,,,\n1,1,,C,5,09:00,11:00,,,,,')
    expect(righe.map(r => r.giorno)).toEqual([1, 4, 5])
  })

  it('salta righe vuote e commenti', () => {
    const { righe, errori } = leggiCsv(intestazione +
      '\n# questa è una nota\n33426,1,,A,lun,09:00,11:00,,,,,\n')
    expect(righe).toHaveLength(1)
    expect(errori).toEqual([])
  })

  it('normalizza gli orari a cinque caratteri', () => {
    const { righe } = leggiCsv(intestazione + '1,1,,A,lun,9:00,11:00,,,,,')
    expect(righe[0].inizio).toBe('09:00')
  })
})

describe('errori: si dice quale riga e perché', () => {
  it('rifiuta un giorno inventato', () => {
    const { righe, errori } = leggiCsv(intestazione + '1,1,,A,mercoldì,09:00,11:00,,,,,')
    expect(righe).toHaveLength(0)
    expect(errori[0]).toContain('giorno non valido')
    expect(errori[0]).toContain(':2')
  })

  it('rifiuta un orario che finisce prima di cominciare', () => {
    const { errori } = leggiCsv(intestazione + '1,1,,A,lun,14:00,09:00,,,,,')
    expect(errori[0]).toMatch(/non viene dopo/)
  })

  it('rifiuta un anno fuori scala', () => {
    const { errori } = leggiCsv(intestazione + '1,9,,A,lun,09:00,11:00,,,,,')
    expect(errori[0]).toContain('anno non valido')
  })

  it('una riga sbagliata non butta via le altre', () => {
    const { righe, errori } = leggiCsv(intestazione +
      '1,1,,Buona,lun,09:00,11:00,,,,,\n1,1,,Rotta,xxx,09:00,11:00,,,,,\n1,1,,Buona2,mar,09:00,11:00,,,,,')
    expect(righe.map(r => r.nome)).toEqual(['Buona', 'Buona2'])
    expect(errori).toHaveLength(1)
  })

  it('segnala il codice corso mancante', () => {
    const { errori } = leggiCsv(intestazione + ',1,,A,lun,09:00,11:00,,,,,')
    expect(errori[0]).toContain('codice del corso')
  })
})

describe('adattatore', () => {
  it('senza cartella non esplode e non dichiara corsi', async () => {
    const a = curatedAdapter('/percorso/che/non/esiste')
    expect(a.enabled).toBe(true)
    expect(a.supports('33426')).toBe(false)
    expect(a.errori).toEqual([])
  })

  it('una lezione senza anno resta non attribuita', () => {
    const { righe } = leggiCsv(intestazione + '1,,,Senza anno,lun,09:00,11:00,,,,,')
    expect(righe[0].anno).toBeUndefined()
  })
})
