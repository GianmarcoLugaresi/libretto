// @vitest-environment node
/* Questi test valgono più degli altri: un difetto qui non fa
   sbagliare un numero, fa finire dati personali veri in un
   repository pubblico. Perciò l'asserzione principale non è «ha
   redatto le chiavi che mi aspettavo» ma «nel risultato non
   compare nessuno dei valori segreti», cercandoli tutti a tappeto. */
import { describe, it, expect } from 'vitest'
import { anonimizzaHar, anonimizzaValore, rapportoVuoto, ripulisciUrl, soloDati } from './har'

/* Dati finti che hanno la forma di quelli veri. Nessuno di questi
   valori appartiene a una persona reale. */
const SEGRETI = [
  '1234567',                               // matricola
  'RSSMRA02A01H501Z',                      // codice fiscale
  'mario.rossi@studenti.uniroma1.it',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3In0.abcdefghijklmnop',
  'JSESSIONID=9F2A4B6C8D0E1F3A5B7C9D1E3F5A7B9C',
  '3401234567',
  'Rossi',
]

const risposta = {
  matricola: 1234567,
  nome: 'Mario',
  cognome: 'Rossi',
  codiceFiscale: 'RSSMRA02A01H501Z',
  email: 'mario.rossi@studenti.uniroma1.it',
  dataNascita: '2002-01-01',
  esami: [
    { codice: '1055957', nomeInsegnamento: 'DISEGNO E MODELLO', cfu: 6, voto: 28, lode: false, data: '2026-01-20' },
    { codice: 'AAF1152', nomeInsegnamento: 'PROVA FINALE', cfu: 6, voto: null, lode: false, data: null },
    { codice: '1055958', nomeInsegnamento: 'TEORIA DELLA FORMA', cfu: 12, voto: 30, lode: true, data: '2026-02-11' },
  ],
  mediaPonderata: 27.45,
}

const har = {
  log: {
    entries: [
      {
        startedDateTime: '2026-09-22T10:00:00.000Z',
        request: {
          method: 'GET',
          url: 'https://esempio.uniroma1.it/api/studenti/1234567/carriera?anno=2026&token=abc',
          headers: [
            { name: 'Cookie', value: 'JSESSIONID=9F2A4B6C8D0E1F3A5B7C9D1E3F5A7B9C' },
            { name: 'Authorization', value: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3In0.abcdefghijklmnop' },
            { name: 'Accept', value: 'application/json' },
          ],
          cookies: [{ name: 'JSESSIONID', value: '9F2A4B6C8D0E1F3A5B7C9D1E3F5A7B9C' }],
          queryString: [{ name: 'anno', value: '2026' }, { name: 'token', value: 'abc' }],
        },
        response: {
          status: 200,
          headers: [
            { name: 'Set-Cookie', value: 'JSESSIONID=9F2A4B6C8D0E1F3A5B7C9D1E3F5A7B9C; HttpOnly' },
            { name: 'Content-Type', value: 'application/json' },
          ],
          cookies: [{ name: 'JSESSIONID', value: '9F2A4B6C8D0E1F3A5B7C9D1E3F5A7B9C' }],
          content: { mimeType: 'application/json', size: 900, text: JSON.stringify(risposta) },
        },
      },
    ],
  },
}

describe('quel che conta: niente di segreto sopravvive', () => {
  it('nessun valore segreto compare nel risultato', () => {
    const testo = JSON.stringify(anonimizzaHar(har).har)
    for (const s of SEGRETI) expect(testo).not.toContain(s)
  })

  it('nemmeno il numero di telefono dentro a una frase qualsiasi', () => {
    const r = rapportoVuoto()
    const fuori = anonimizzaValore(
      { note: 'chiamami al 340 1234567 o scrivi a mario.rossi@studenti.uniroma1.it' }, 'radice', r,
    )
    expect(JSON.stringify(fuori)).not.toMatch(/1234567|mario\.rossi/)
  })

  it('un campo mai visto prima viene redatto, non tenuto per sbaglio', () => {
    const r = rapportoVuoto()
    const out = anonimizzaValore({ campoNuovoDiZecca: 'Mario Rossi' }, 'radice', r) as Record<string, string>
    expect(out.campoNuovoDiZecca).not.toContain('Rossi')
    expect(r.redatte.campoNuovoDiZecca).toBe(1)
  })

  it('i cookie non vengono redatti: spariscono', () => {
    const out = anonimizzaHar(har).har as { log: { entries: { request: { cookies: unknown[] }; response: { cookies: unknown[] } }[] } }
    expect(out.log.entries[0].request.cookies).toEqual([])
    expect(out.log.entries[0].response.cookies).toEqual([])
  })
})

describe('quel che resta: la forma', () => {
  it('i codici degli insegnamenti si tengono, sono la chiave di aggancio', () => {
    const out = anonimizzaValore(risposta, 'radice', rapportoVuoto()) as typeof risposta
    expect(out.esami.map(e => e.codice)).toEqual(['1055957', 'AAF1152', '1055958'])
    expect(out.esami[0].nomeInsegnamento).toBe('DISEGNO E MODELLO')
    expect(out.esami.map(e => e.cfu)).toEqual([6, 6, 12])
  })

  it('i voti cambiano ma restano voti, e il tipo si conserva', () => {
    const out = anonimizzaValore(risposta, 'radice', rapportoVuoto()) as typeof risposta
    const voti = out.esami.map(e => e.voto)
    expect(voti[1]).toBeNull()                       // un null resta null
    expect(typeof voti[0]).toBe('number')
    expect(voti[0]).toBeGreaterThanOrEqual(18)
    expect(voti[0]).toBeLessThanOrEqual(30)
    expect(voti[0]).not.toBe(28)
    expect(out.esami[2].lode).toBe(true)             // la lode è struttura
  })

  it('lo stesso valore dà sempre lo stesso segnaposto', () => {
    const r = rapportoVuoto()
    const out = anonimizzaValore(
      { a: { cognome: 'Rossi' }, b: { cognome: 'Rossi' }, c: { cognome: 'Bianchi' } }, 'radice', r,
    ) as Record<string, { cognome: string }>
    expect(out.a.cognome).toBe(out.b.cognome)
    expect(out.a.cognome).not.toBe(out.c.cognome)
  })

  it('il metodo, lo stato e i nomi degli header restano leggibili', () => {
    const out = anonimizzaHar(har).har as { log: { entries: { request: { method: string; headers: { name: string; value: string }[] }; response: { status: number } }[] } }
    const e = out.log.entries[0]
    expect(e.request.method).toBe('GET')
    expect(e.response.status).toBe(200)
    // Sapere CHE c'era un Authorization è il dato che serve per
    // capire come funziona l'autenticazione.
    expect(e.request.headers.find(h => h.name === 'Authorization')?.value).toBe('«tolto»')
    expect(e.request.headers.find(h => h.name === 'Accept')?.value).toBe('application/json')
  })

  it('l\'URL tiene il percorso ma non l\'identificatore né i valori', () => {
    const r = rapportoVuoto()
    const u = ripulisciUrl('https://esempio.uniroma1.it/api/studenti/1234567/carriera?anno=2026&token=abc', r)
    expect(u).toContain('/api/studenti/')
    expect(u).toContain('/carriera')
    expect(u).not.toContain('1234567')
    expect(u).toContain('anno=«valore»')
    expect(u).toContain('token=«valore»')
  })

  it('un url illeggibile non fa saltare tutto', () => {
    expect(ripulisciUrl('mica un url', rapportoVuoto())).toBe('«url-illeggibile»')
  })
})

describe('robustezza', () => {
  it('una risposta che non è JSON si riduce alla sua dimensione', () => {
    const conHtml = { log: { entries: [{ request: { url: 'https://x.it/a', headers: [] }, response: { status: 200, content: { mimeType: 'text/html', text: '<html>Mario Rossi</html>' } } }] } }
    const testo = JSON.stringify(anonimizzaHar(conHtml).har)
    expect(testo).not.toContain('Rossi')
    expect(testo).toContain('non-json')
  })

  it('immagini e font si buttano via', () => {
    const misto = { log: { entries: [
      { request: { url: 'https://x.it/logo.png' }, response: { content: { mimeType: 'image/png' } } },
      { request: { url: 'https://x.it/api/dati' }, response: { content: { mimeType: 'application/json' } } },
    ] } }
    const out = soloDati(misto) as { log: { entries: { request: { url: string } }[] } }
    expect(out.log.entries).toHaveLength(1)
    expect(out.log.entries[0].request.url).toContain('/api/dati')
  })

  it('un har vuoto o malformato non fa eccezioni', () => {
    expect(() => anonimizzaHar({})).not.toThrow()
    expect(() => anonimizzaHar(null)).not.toThrow()
    expect(() => soloDati({})).not.toThrow()
  })

  it('una struttura che si annida all\'infinito si ferma', () => {
    const ciclico: Record<string, unknown> = { a: 1 }
    ciclico.se = ciclico
    expect(() => anonimizzaValore(ciclico, 'radice', rapportoVuoto())).not.toThrow()
  })

  it('il rapporto conta ma non mostra mai i valori', () => {
    const { rapporto } = anonimizzaHar(har)
    const testo = JSON.stringify(rapporto)
    for (const s of SEGRETI) expect(testo).not.toContain(s)
    expect(rapporto.headerTolti.cookie).toBeGreaterThan(0)
  })
})

describe('i numeri redatti conservano la forma', () => {
  it('una matricola a sette cifre resta a sette cifre, ma è un\'altra', () => {
    const out = anonimizzaValore({ matricola: 1234567 }, 'radice', rapportoVuoto()) as { matricola: number }
    expect(String(out.matricola)).toHaveLength(7)
    expect(out.matricola).not.toBe(1234567)
  })

  it('numeri diversi restano diversi, uguali restano uguali', () => {
    const r = rapportoVuoto()
    const out = anonimizzaValore(
      { a: { matricola: 1234567 }, b: { matricola: 1234567 }, c: { matricola: 7654321 } }, 'radice', r,
    ) as Record<string, { matricola: number }>
    expect(out.a.matricola).toBe(out.b.matricola)
    expect(out.a.matricola).not.toBe(out.c.matricola)
  })
})

describe('la busta vera di Infostud', () => {
  // La forma è quella delle risposte di /phoenixws/ viste il
  // 23/09/2026; i valori sono finti.
  const busta = {
    esito: { flagEsito: 0, id: 0, nota: 'Prenotazioni recuperate con successo.', ritorno: null },
    output: '11111111-2222-4333-8444-555555555555',
    ritorno: { appelli: [] },
    sessioniErasmus: null,
    pdSApprovato: false,
  }

  it('toglie output, che potrebbe essere la sessione rimandata indietro', () => {
    expect(JSON.stringify(anonimizzaValore(busta, 'radice', rapportoVuoto()))).not.toContain('11111111-2222')
  })

  it('tiene la struttura: esito, ritorno, i null e i booleani', () => {
    const out = anonimizzaValore(busta, 'radice', rapportoVuoto()) as typeof busta
    expect(out.esito.flagEsito).toBe(0)
    expect(out.ritorno).toEqual({ appelli: [] })
    expect(out.sessioniErasmus).toBeNull()
    expect(out.pdSApprovato).toBe(false)
  })

  it('un UUID non passa nemmeno sotto una chiave che di solito si tiene', () => {
    const out = JSON.stringify(anonimizzaValore(
      { id: '11111111-2222-4333-8444-555555555555', uuid: 'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE' },
      'radice', rapportoVuoto(),
    ))
    expect(out).not.toMatch(/11111111-2222|AAAAAAAA-BBBB/)
  })
})
