import { describe, it, expect } from 'vitest'
import {
  EsitoNegativo, FormatoCambiato, apriBusta, dataInfostud, mappaEsame, mappaEsami, mappaPrenotazioni,
} from './mapper'
import { collega, testoRiepilogo, togliUfficiale, unisci } from './unisci'
import { esamiFinti, esamiVuoti, prenotazioniFinte, prenotazioniVuote } from './fixture'
import { statoIniziale } from '../seed'
import { esameDi } from '../query'
import { riepilogo } from '../stats'
import type { Insegnamento, RecordUfficiale, Stato } from '../types'

const QUANDO = '2027-02-20T10:00:00.000Z'

/* ---------------- Mapper ---------------- */

describe('busta', () => {
  it('null e [] dicono entrambi «niente»', () => {
    expect(apriBusta(esamiVuoti, 'esami')).toEqual([])
    expect(apriBusta({ esito: { flagEsito: 0 }, ritorno: { esami: null } }, 'esami')).toEqual([])
  })

  it('un flagEsito diverso da 0 è un errore di Infostud, con la sua nota', () => {
    const e = (() => { try { apriBusta({ esito: { flagEsito: 1, nota: 'Sessione scaduta' }, ritorno: {} }, 'esami') } catch (x) { return x } })()
    expect(e).toBeInstanceOf(EsitoNegativo)
    expect((e as EsitoNegativo).nota).toBe('Sessione scaduta')
  })

  it('una forma diversa è un formato cambiato, non un elenco vuoto', () => {
    expect(() => apriBusta('<html>', 'esami')).toThrow(FormatoCambiato)
    expect(() => apriBusta({ ritorno: {} }, 'esami')).toThrow(FormatoCambiato)
    expect(() => apriBusta({ esito: { flagEsito: 0 } }, 'esami')).toThrow(FormatoCambiato)
    expect(() => apriBusta({ esito: { flagEsito: 0 }, ritorno: { esami: {} } }, 'esami')).toThrow(FormatoCambiato)
  })
})

describe('esami', () => {
  it('legge voto, data, CFU decimali e idoneità', () => {
    const r = mappaEsami(esamiFinti, QUANDO)
    expect(r).toHaveLength(4)
    expect(r[0]).toMatchObject({ codice: '10622516', cfu: 12, voto: 28, lode: false, idoneita: false, data: '2027-01-20' })
    expect(r[2]).toMatchObject({ codice: 'AAF1101', idoneita: true })
    expect(r[2].voto).toBeUndefined()
  })

  it('le varianti note fra le fonti: cfu intero o testo, annoAcca numero o stringa', () => {
    const base = { codiceInsegnamento: '1', descrizione: 'X', data: '', esito: { valoreNominale: '27', valoreNonNominale: 27 } }
    expect(mappaEsame({ ...base, cfu: 9, annoAcca: 2026 }, QUANDO)).toMatchObject({ cfu: 9, annoAccademico: '2026' })
    expect(mappaEsame({ ...base, cfu: '9', annoAcca: '2026/2027' }, QUANDO)).toMatchObject({ cfu: 9, annoAccademico: '2026/2027' })
    expect(mappaEsame({ ...base, cfu: 9, data: null }, QUANDO)?.data).toBeUndefined()
  })

  it('la lode si riconosce solo se il testo la nomina', () => {
    const e = (nominale: string) => mappaEsame({
      codiceInsegnamento: '1', descrizione: 'X', cfu: 6, esito: { valoreNominale: nominale, valoreNonNominale: 30 },
    }, QUANDO)!
    expect(e('30 e lode').lode).toBe(true)
    expect(e('30').lode).toBe(false)
  })

  it('un voto che non sa leggere lo tiene come testo, senza inventare', () => {
    const e = mappaEsame({ codiceInsegnamento: '1', descrizione: 'X', cfu: 6, esito: { valoreNominale: '30L', valoreNonNominale: 31 } }, QUANDO)!
    expect(e.voto).toBeUndefined()
    expect(e.votoTesto).toBe('30L')
    expect(e.idoneita).toBe(false)
  })

  it('un esame dichiarato non superato non entra', () => {
    expect(mappaEsame({ codiceInsegnamento: '1', descrizione: 'X', cfu: 6, superamento: false, esito: { valoreNominale: '', valoreNonNominale: null } }, QUANDO)).toBeNull()
  })

  it('un campo che manca o una data strana fermano tutto', () => {
    expect(() => mappaEsame({ descrizione: 'X', cfu: 6, esito: {} }, QUANDO)).toThrow(FormatoCambiato)
    expect(() => mappaEsame({ codiceInsegnamento: '1', descrizione: 'X', cfu: 'sei', esito: {} }, QUANDO)).toThrow(FormatoCambiato)
    expect(() => dataInfostud('Jan 20, 2027')).toThrow(FormatoCambiato)
    expect(dataInfostud('5/2/2027')).toBe('2027-02-05')
  })
})

describe('prenotazioni', () => {
  it('nome, data e docente', () => {
    expect(mappaPrenotazioni(prenotazioniFinte, QUANDO)[0]).toMatchObject({
      nome: 'TEORIA DELLA FORMA', data: '2027-02-10', docente: 'DOCENTE DI PROVA', numero: 3,
    })
    expect(mappaPrenotazioni(prenotazioniVuote, QUANDO)).toEqual([])
  })
})

/* ---------------- Merge ---------------- */

const ins = (id: string, nome: string, cfu: number, codice?: string): Insegnamento =>
  ({ id, nome, cfu, codice, anno: 1, semestre: 1, tipo: 'obbligatorio', tinta: 0 })

function libretto(): Stato {
  const s = statoIniziale()
  return {
    ...s,
    onboarding: false,
    insegnamenti: [
      ins('cat:10622516', 'Fondamenti di disegno', 12, '10622516'),
      ins('cat:10622518', 'Storia delle arti applicate', 6, '10622518'),
      ins('cat:aaf1101', 'Lingua inglese', 3, 'AAF1101'),
      ins('cat:10622522', 'Teoria della forma', 6, '10622522'),
      // nato a mano, senza codice: si aggancia per nome e CFU
      ins('man:istituzioni:1', 'Istituzioni di matematica', 6),
    ],
    esami: {
      // scritto a mano prima che arrivasse Infostud
      'cat:10622516': { insegnamentoId: 'cat:10622516', stato: 'superato', voto: 27, data: '2027-01-20', note: 'orale lungo' },
    },
  }
}

const rec = (codice: string, nome: string, cfu: number, voto?: number): RecordUfficiale =>
  ({ codice, nome, cfu, voto, lode: false, idoneita: voto == null, fetchedAt: QUANDO })

describe('merge', () => {
  it('aggancia per codice, lascia da collegare chi non c\'è nel libretto', () => {
    const { stato, riepilogo: r } = unisci(libretto(), mappaEsami(esamiFinti, QUANDO), mappaPrenotazioni(prenotazioniFinte, QUANDO))
    expect(Object.keys(stato.infostud.esami).sort()).toEqual(['cat:10622516', 'cat:10622518', 'cat:aaf1101'])
    expect(stato.infostud.daCollegare.map(x => x.record.codice)).toEqual(['99999999'])
    expect(r.nuovi).toHaveLength(3)
    expect(r.daCollegare).toBe(1)
    expect(r.prenotazioni).toBe(1)
    expect(testoRiepilogo(r)).toBe('3 nuovi esami, 1 da collegare, 1 prenotazione')
  })

  it('non tocca niente di ciò che hai scritto a mano', () => {
    const prima = libretto()
    const { stato } = unisci(prima, mappaEsami(esamiFinti, QUANDO), [])
    expect(stato.esami).toEqual(prima.esami)
    expect(stato.insegnamenti).toEqual(prima.insegnamenti)
    expect(stato.appelli).toEqual(prima.appelli)
    expect(stato.profilo).toEqual(prima.profilo)
  })

  it('nelle statistiche vince il record ufficiale; il manuale resta com\'era', () => {
    const { stato } = unisci(libretto(), mappaEsami(esamiFinti, QUANDO), [])
    expect(esameDi(stato, 'cat:10622516')).toMatchObject({ stato: 'superato', voto: 28, ufficiale: true, note: 'orale lungo' })
    expect(stato.esami['cat:10622516'].voto).toBe(27)
    expect(esameDi(stato, 'cat:aaf1101')).toMatchObject({ stato: 'idoneo', ufficiale: true })
    // 12×28 + 6×30 = 516 su 18 CFU; l'idoneità porta CFU ma non media
    const r = riepilogo(stato)
    expect(r.cfuAcquisiti).toBe(21)
    expect(r.mediaPonderata).toBeCloseTo(516 / 18, 5)
  })

  it('per nome e CFU se il libretto non ha il codice; CFU diversi non bastano', () => {
    const s = libretto()
    const a = unisci(s, [rec('777', 'ISTITUZIONI DI MATEMATICA', 6, 24)], [])
    expect(a.stato.infostud.esami['man:istituzioni:1']?.voto).toBe(24)
    const b = unisci(s, [rec('777', 'ISTITUZIONI DI MATEMATICA', 9, 24)], [])
    expect(b.stato.infostud.daCollegare).toHaveLength(1)
  })

  it('con gli alias, un codice di un altro ordinamento trova lo stesso esame', () => {
    const { stato } = unisci(libretto(), [rec('55555', 'TEORIA DELLA FORMA', 6, 26)], [], { '55555': '10622522' })
    expect(stato.infostud.esami['cat:10622522']?.voto).toBe(26)
  })

  it('omonimi ambigui non si scelgono: da collegare, coi candidati', () => {
    const s = libretto()
    s.insegnamenti.push(ins('man:istituzioni:2', 'Istituzioni di matematica', 6))
    const { stato } = unisci(s, [rec('777', 'ISTITUZIONI DI MATEMATICA', 6, 24)], [])
    expect(stato.infostud.daCollegare[0].candidati.sort()).toEqual(['man:istituzioni:1', 'man:istituzioni:2'])
  })

  it('rifarla con gli stessi dati non cambia niente', () => {
    const una = unisci(libretto(), mappaEsami(esamiFinti, QUANDO), []).stato
    const due = unisci(una, mappaEsami(esamiFinti, '2027-02-21T10:00:00.000Z'), [])
    expect(due.riepilogo).toMatchObject({ nuovi: [], aggiornati: [], invariati: 3, nonPiuPresenti: [] })
    expect(Object.keys(due.stato.infostud.esami)).toEqual(Object.keys(una.infostud.esami))
  })

  it('un voto cambiato su Infostud è un aggiornamento', () => {
    const una = unisci(libretto(), [rec('10622518', 'STORIA DELLE ARTI APPLICATE', 6, 29)], []).stato
    const due = unisci(una, [rec('10622518', 'STORIA DELLE ARTI APPLICATE', 6, 30)], [])
    expect(due.riepilogo.aggiornati).toEqual(['STORIA DELLE ARTI APPLICATE'])
    expect(due.stato.infostud.esami['cat:10622518'].voto).toBe(30)
  })

  it('chi sparisce da Infostud non si cancella: si segna, e continua a contare', () => {
    const una = unisci(libretto(), mappaEsami(esamiFinti, QUANDO), []).stato
    const due = unisci(una, mappaEsami(esamiVuoti, QUANDO), [])
    expect(due.riepilogo.nonPiuPresenti).toHaveLength(3)
    expect(due.stato.infostud.esami['cat:10622518']).toMatchObject({ voto: 30, nonPiuPresente: true })
    expect(esameDi(due.stato, 'cat:10622518').voto).toBe(30)
    // La volta dopo non lo si riannuncia
    expect(unisci(due.stato, [], []).riepilogo.nonPiuPresenti).toEqual([])
  })

  it('togliere un record sparito lascia il manuale', () => {
    const una = unisci(libretto(), mappaEsami(esamiFinti, QUANDO), []).stato
    const tolto = togliUfficiale(una, 'cat:10622516')
    const e = esameDi(tolto, 'cat:10622516')
    expect(e.voto).toBe(27)
    expect(e.ufficiale).toBeUndefined()
  })

  it('un collegamento fatto a mano resta alle sincronizzazioni successive', () => {
    const una = unisci(libretto(), mappaEsami(esamiFinti, QUANDO), []).stato
    const collegato = collega(una, '99999999', 'cat:10622522')
    expect(collegato.infostud.esami['cat:10622522'].codice).toBe('99999999')
    expect(collegato.infostud.daCollegare).toEqual([])
    const dopo = unisci(collegato, mappaEsami(esamiFinti, QUANDO), [])
    expect(dopo.stato.infostud.esami['cat:10622522'].codice).toBe('99999999')
    expect(dopo.stato.infostud.daCollegare).toEqual([])
  })

  it('una carriera vuota, come quella vera di oggi, dice «nessuna novità»', () => {
    const { riepilogo: r } = unisci(libretto(), mappaEsami(esamiVuoti, QUANDO), mappaPrenotazioni(prenotazioniVuote, QUANDO))
    expect(testoRiepilogo(r)).toBe('Nessuna novità')
  })

  it('la prenotazione si aggancia all\'insegnamento per nome', () => {
    const { stato } = unisci(libretto(), [], mappaPrenotazioni(prenotazioniFinte, QUANDO))
    expect(stato.infostud.prenotazioni[0].insegnamentoId).toBe('cat:10622522')
  })
})

/* ---------------- Sincronizzazione completa, col provider di prova ---------------- */

describe('sincronizzazione con il provider di prova', () => {
  const opzioni = () => ({ segnale: new AbortController().signal, fase: () => {} })

  it('il flusso intero: estrazione, mapper, merge, riepilogo', async () => {
    const { MockInfostudProvider } = await import('./provider')
    const { sincronizza } = await import('./sync')
    const fasi: string[] = []
    const r = await sincronizza(new MockInfostudProvider('esami', 0), libretto(), {}, { ...opzioni(), fase: f => fasi.push(f) })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(fasi).toEqual(['accesso', 'lettura'])
    expect(testoRiepilogo(r.riepilogo)).toBe('3 nuovi esami, 1 da collegare, 1 prenotazione')
    // Niente della sessione arriva nello stato
    expect(JSON.stringify(r.infostud)).not.toContain('00000000-0000-4000')
  })

  it('un formato cambiato è un errore, e lo stato non cambia', async () => {
    const { MockInfostudProvider } = await import('./provider')
    const { sincronizza, messaggioErrore } = await import('./sync')
    const s = libretto()
    const prima = JSON.stringify(s)
    const r = await sincronizza(new MockInfostudProvider('formato-cambiato', 0), s, {}, opzioni())
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errore).toBeInstanceOf(FormatoCambiato)
    expect(messaggioErrore(r.errore).titolo).toBe('Infostud è cambiato')
    expect(JSON.stringify(s)).toBe(prima)
  })

  it('accesso fallito e Infostud irraggiungibile hanno messaggi loro', async () => {
    const { MockInfostudProvider } = await import('./provider')
    const { sincronizza, messaggioErrore } = await import('./sync')
    const a = await sincronizza(new MockInfostudProvider('accesso-fallito', 0), libretto(), {}, opzioni())
    const b = await sincronizza(new MockInfostudProvider('irraggiungibile', 0), libretto(), {}, opzioni())
    expect(!a.ok && messaggioErrore(a.errore).titolo).toBe('Accesso non riuscito')
    expect(!b.ok && messaggioErrore(b.errore).titolo).toBe('Infostud non raggiungibile')
  })

  it('annullare ferma tutto subito', async () => {
    const { MockInfostudProvider, SyncAnnullata } = await import('./provider')
    const { sincronizza } = await import('./sync')
    const c = new AbortController()
    const p = sincronizza(new MockInfostudProvider('esami', 5_000), libretto(), {}, { segnale: c.signal, fase: () => {} })
    c.abort()
    const r = await p
    expect(!r.ok && r.errore).toBeInstanceOf(SyncAnnullata)
  })
})
