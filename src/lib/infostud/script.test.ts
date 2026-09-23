/* Lo script si prova come lo usa la WebView: come testo, eseguito in
   una pagina finta. Le chiamate di rete sono intercettate. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { scriptDiEstrazione } from './script'
import { esamiFinti, prenotazioniFinte } from './fixture'

const OPZIONI = {
  hostConsentiti: ['www.studenti.uniroma1.it'],
  canale: 'mysapienza',
  risorse: { esami: 'esamiall', prenotazioni: 'prenotazioni' },
  suggerimentoMs: 50,
}
const SESSIONE = '11111111-2222-4333-8444-555555555555'

type W = Window & typeof globalThis & {
  __mysapienza?: boolean
  webkit?: unknown
  happyDOM: { setURL(u: string): void }
}
const w = window as W

let messaggi: Record<string, unknown>[]
let chieste: string[]
const xhrOpen = XMLHttpRequest.prototype.open
const fetchVero = window.fetch

beforeEach(() => {
  messaggi = []
  chieste = []
  delete w.__mysapienza
  XMLHttpRequest.prototype.open = xhrOpen
  w.webkit = { messageHandlers: { mysapienza: { postMessage: (m: Record<string, unknown>) => messaggi.push(m) } } }
  w.fetch = (async (u: RequestInfo | URL) => {
    const s = String(u)
    chieste.push(s)
    const corpo = s.includes('/esamiall') ? esamiFinti : s.includes('/prenotazioni') ? prenotazioniFinte : {}
    return new Response(JSON.stringify(corpo), { status: 200 })
  }) as typeof fetch
})

afterEach(() => {
  XMLHttpRequest.prototype.open = xhrOpen
  w.fetch = fetchVero
  delete w.webkit
})

const esegui = () => new Function(scriptDiEstrazione(OPZIONI))()
const attendi = (ms = 20) => new Promise(r => setTimeout(r, ms))

/** La pagina di Infostud che fa da sé una delle sue chiamate. */
function laPaginaChiama(url: string) {
  const x = new XMLHttpRequest()
  x.open('GET', url)
}

describe('dove gira', () => {
  it('su una pagina SPID non fa niente: non tocca la rete né la pagina', () => {
    w.happyDOM.setURL('https://idp.esempio-spid.it/login')
    const fetchPrima = w.fetch
    esegui()
    expect(w.fetch).toBe(fetchPrima)
    expect(XMLHttpRequest.prototype.open).toBe(xhrOpen)
    expect(messaggi).toEqual([])
  })

  it('su Infostud, finché non vede una chiamata, aspetta e poi suggerisce', async () => {
    w.happyDOM.setURL('https://www.studenti.uniroma1.it/phoenix/')
    esegui()
    expect(messaggi).toEqual([{ tipo: 'fase', fase: 'accesso' }])
    await attendi(80)
    expect(messaggi.at(-1)).toEqual({ tipo: 'suggerimento' })
    expect(chieste).toEqual([])
  })

  it('eseguito due volte sulla stessa pagina, lavora una volta sola', () => {
    w.happyDOM.setURL('https://www.studenti.uniroma1.it/phoenix/')
    esegui(); esegui()
    expect(messaggi.filter(m => m.fase === 'accesso')).toHaveLength(1)
  })
})

describe('estrazione', () => {
  it('dalla chiamata della pagina ricava dove chiedere, e chiede i due elenchi', async () => {
    w.happyDOM.setURL('https://www.studenti.uniroma1.it/phoenix/')
    esegui()
    laPaginaChiama(`/phoenixws/studente/1234567/insegnamentisostenibili?cacheBuster=1790088460823&ingresso=${SESSIONE}`)
    await attendi()
    expect(chieste.sort()).toEqual([
      `https://www.studenti.uniroma1.it/phoenixws/studente/1234567/esamiall?ingresso=${SESSIONE}`,
      `https://www.studenti.uniroma1.it/phoenixws/studente/1234567/prenotazioni?ingresso=${SESSIONE}`,
    ])
    const dati = messaggi.find(m => m.tipo === 'dati')!
    expect(dati).toBeDefined()
    expect((dati.esami as { ritorno: { esami: unknown[] } }).ritorno.esami).toHaveLength(4)
  })

  it('all\'app non arrivano né la sessione né la matricola', async () => {
    w.happyDOM.setURL('https://www.studenti.uniroma1.it/phoenix/')
    esegui()
    laPaginaChiama(`https://www.studenti.uniroma1.it/phoenixws/studente/1234567/esami?ingresso=${SESSIONE}`)
    await attendi()
    const testo = JSON.stringify(messaggi)
    expect(testo).not.toContain(SESSIONE)
    expect(testo).not.toContain('1234567')
    // `output` delle risposte è la sessione rimandata indietro: non passa
    expect(testo).not.toContain('"output"')
  })

  it('una chiamata verso un altro dominio non si segue', async () => {
    w.happyDOM.setURL('https://www.studenti.uniroma1.it/phoenix/')
    esegui()
    laPaginaChiama(`https://altro.esempio.it/phoenixws/studente/1234567/esami?ingresso=${SESSIONE}`)
    await attendi()
    expect(chieste).toEqual([])
  })

  it('le chiamate con fetch contano quanto quelle con XHR', async () => {
    w.happyDOM.setURL('https://www.studenti.uniroma1.it/phoenix/')
    esegui()
    await window.fetch(`/phoenixws/studente/7654321/prenotazioni?ingresso=${SESSIONE}`)
    await attendi()
    expect(chieste.filter(u => u.includes('/7654321/esamiall'))).toHaveLength(1)
  })

  it('una risposta d\'errore diventa un messaggio d\'errore, senza dati', async () => {
    w.fetch = (async () => new Response('', { status: 500 })) as typeof fetch
    w.happyDOM.setURL('https://www.studenti.uniroma1.it/phoenix/')
    esegui()
    laPaginaChiama(`/phoenixws/studente/1234567/esami?ingresso=${SESSIONE}`)
    await attendi()
    expect(messaggi.find(m => m.tipo === 'errore')).toMatchObject({ motivo: 'risposta 500' })
    expect(messaggi.find(m => m.tipo === 'dati')).toBeUndefined()
  })
})
