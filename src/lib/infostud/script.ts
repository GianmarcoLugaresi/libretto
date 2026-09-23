/* ============================================================
   Lo script che gira nella pagina di Infostud.

   È incluso nell'app, mai scaricato. La WebView lo esegue solo quando
   la pagina è su un host consentito (mai sulle pagine SPID o CIE), e
   lui stesso lo ricontrolla come prima cosa.

   Come funziona, senza inventare niente di Infostud:
   - dopo l'accesso, la pagina chiama da sé
     /phoenixws/studente/<matricola>/<risorsa>?…&ingresso=<sessione>
     (visto sulle catture vere);
   - lo script guarda quelle chiamate (quelle già fatte, dal registro
     delle risorse, e quelle future) e ne ricava il prefisso;
   - chiede esamiall e prenotazioni allo stesso indirizzo, con la stessa
     sessione, dalla pagina stessa: il browser fa il resto;
   - all'app passa solo `esito` e `ritorno` di ogni risposta. Matricola,
     sessione e `output` (che è la sessione rimandata indietro) restano
     nella pagina, e muoiono con lei.
   ============================================================ */

export interface OpzioniScript {
  hostConsentiti: string[]
  /** Nome del canale verso l'app (window.webkit.messageHandlers.<nome>) */
  canale: string
  /** Le risorse da chiedere, come si chiamano su Infostud */
  risorse: { esami: string; prenotazioni: string }
  /** Dopo quanto suggerire allo studente di aprire una sezione */
  suggerimentoMs: number
}

/** Il sorgente dello script, pronto da passare alla WebView. */
export function scriptDiEstrazione(o: OpzioniScript): string {
  return `(${estrai.toString()})(${JSON.stringify(o)});`
}

/* Scritta come funzione normale per poterla provare nei test; nella
   WebView viaggia come testo. Niente import, niente chiusure: deve
   stare in piedi da sola. */
function estrai(o: OpzioniScript): void {
  const w = window as unknown as {
    __mysapienza?: boolean
    webkit?: { messageHandlers?: Record<string, { postMessage(m: unknown): void }> }
  }
  if (o.hostConsentiti.indexOf(location.hostname) < 0) return
  if (w.__mysapienza) return
  w.__mysapienza = true

  const invia = (m: unknown) => {
    try { w.webkit?.messageHandlers?.[o.canale]?.postMessage(m) } catch { /* canale assente: niente da fare */ }
  }

  // Il prefisso fino alla matricola, e la sessione. Solo stesso dominio.
  const RE = /^(https?:\/\/[^?#]*\/phoenixws\/studente\/\d+\/)[^?#]*\?(?:[^#]*&)?ingresso=([0-9a-fA-F-]{36})/
  let trovato: { base: string; ingresso: string } | null = null
  const fetchOriginale = window.fetch.bind(window)

  const osserva = (url: unknown) => {
    if (trovato || typeof url !== 'string') return
    let assoluto: string
    try { assoluto = new URL(url, location.href).href } catch { return }
    const m = RE.exec(assoluto)
    if (!m || new URL(m[1]).origin !== location.origin) return
    trovato = { base: m[1], ingresso: m[2] }
    leggi()
  }

  const chiedi = (risorsa: string) =>
    fetchOriginale(`${trovato!.base}${risorsa}?ingresso=${encodeURIComponent(trovato!.ingresso)}`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    })
      .then(r => {
        if (!r.ok) throw new Error(`risposta ${r.status}`)
        return r.json()
      })
      // Solo esito e ritorno: `output` è la sessione, e non esce.
      .then((j: Record<string, unknown> | null) => ({ esito: j?.esito, ritorno: j?.ritorno }))

  const leggi = () => {
    invia({ tipo: 'fase', fase: 'lettura' })
    Promise.all([chiedi(o.risorse.esami), chiedi(o.risorse.prenotazioni)])
      .then(([esami, prenotazioni]) => invia({ tipo: 'dati', esami, prenotazioni }))
      .catch((e: unknown) => invia({ tipo: 'errore', motivo: e instanceof Error ? e.message : String(e) }))
  }

  // Le chiamate future della pagina…
  const xhrOpen = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...a: unknown[]) {
    osserva(a[1] instanceof URL ? a[1].href : a[1])
    return (xhrOpen as (...x: unknown[]) => void).apply(this, a)
  } as typeof XMLHttpRequest.prototype.open
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    osserva(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    return fetchOriginale(input, init)
  }) as typeof fetch

  // …e quelle già fatte prima che lo script arrivasse.
  try {
    for (const e of performance.getEntriesByType('resource')) osserva(e.name)
  } catch { /* registro non disponibile */ }

  if (!trovato) {
    invia({ tipo: 'fase', fase: 'accesso' })
    setTimeout(() => { if (!trovato) invia({ tipo: 'suggerimento' }) }, o.suggerimentoMs)
  }
}
