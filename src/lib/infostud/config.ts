/* ============================================================
   infostud.config (PROMPT_MYSAPIENZA.md, «Specifica della sync»).
   Tutto ciò che qui è marcato «visto» viene dalle catture vere del
   22-23 settembre 2026; il resto è da confermare.
   ============================================================ */

export interface ConfigInfostud {
  /** Da dove parte l'accesso */
  loginUrl: string
  /** Host su cui lo script può girare */
  hostConsentiti: string[]
  /** Come si capisce che l'accesso è riuscito */
  isLoggedIn: string
  /** Come la pagina si autentica verso i dati */
  auth: string
  endpoints: { esami: string; prenotazioni: string }
  timeoutMs: number
}

export const CONFIG_INFOSTUD: ConfigInfostud = {
  // TODO: da confermare con una cattura del login. È la pagina di
  // Infostud 2.0 (visto: le chiamate ai dati partono da qui); se
  // l'accesso comincia altrove, lo studente ci arriva navigando.
  loginUrl: 'https://www.studenti.uniroma1.it/phoenix/',
  // Visto: pagine e dati stanno su questo host. I fornitori SPID/CIE no,
  // e lì lo script non gira.
  hostConsentiti: ['www.studenti.uniroma1.it'],
  // Visto: dopo l'accesso la pagina chiama da sé /phoenixws/studente/…
  isLoggedIn: 'una chiamata della pagina a /phoenixws/studente/<matricola>/…?ingresso=…',
  // Visto: nessun Authorization; il cookie è di un bilanciatore. La
  // sessione è il parametro `ingresso`, che la pagina aggiunge da sé.
  auth: 'parametro ingresso nella query, preso dalle chiamate della pagina',
  // Visti entrambi, con le loro buste. La forma di un esame è di
  // seconda mano (docs/INFOSTUD.md).
  endpoints: { esami: 'esamiall', prenotazioni: 'prenotazioni' },
  // L'accesso con SPID può chiedere di aprire un'altra app e tornare.
  timeoutMs: 5 * 60_000,
}

/** Per provare il flusso vero sul simulatore senza toccare Infostud:
 *  l'Infostud finto del server di sviluppo (vite.config.ts), con un
 *  fornitore SPID finto su 127.0.0.1, dove lo script non deve girare.
 *  Si attiva solo con VITE_INFOSTUD_PROVA=1 al momento della build; senza,
 *  il ramo sparisce dal pacchetto e in produzione non ne resta traccia. */
export const IN_PROVA = import.meta.env.VITE_INFOSTUD_PROVA === '1'

export const CONFIG_ATTIVA: ConfigInfostud = import.meta.env.VITE_INFOSTUD_PROVA === '1'
  ? {
      ...CONFIG_INFOSTUD,
      loginUrl: 'http://localhost:5174/infostud-finto/',
      hostConsentiti: ['localhost'],
      timeoutMs: 2 * 60_000,
    }
  : CONFIG_INFOSTUD
