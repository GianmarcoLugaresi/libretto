/* ============================================================
   Adattatori per gli orari.

   Non esiste una fonte unica: ogni facoltà pubblica a modo suo.
   Un adattatore incapsula una fonte e dichiara per quali corsi
   vale; aggiungerne uno non deve toccare il resto della pipeline.

   `enabled: false` serve alle fonti scritte ma non ancora
   utilizzabili — per esempio perché il loro robots.txt non
   consente l'accesso automatico e manca il permesso della facoltà.
   ============================================================ */

import type { Lezione } from '../tipi'

export interface EsitoOrario {
  /** Lezioni con anno e canale dichiarati dalla fonte */
  lezioni: Lezione[]
  /** Lezioni che la fonte non attribuisce: si tengono a parte e non
   *  si indovina a chi appartengano. */
  nonAttribuite: Lezione[]
  sources: string[]
  semestre?: 1 | 2
  /** Primo e ultimo giorno osservati */
  dal?: string
  al?: string
}

export interface OpzioniAdattatore {
  dal?: string
  al?: string
  /** Come scaricare una pagina. Il runner passa la sua, che
   *  rispetta crawl-delay, cache e tetto di richieste; senza, vale
   *  il download diretto. Torna null su 304 o budget esaurito. */
  prendi?: (url: string) => Promise<string | null>
}

export interface TimetableAdapter {
  id: string
  facolta: string
  /** Vale per questo corso? */
  supports(codiceCorso: string): boolean
  /** Se false l'adattatore non viene interrogato: il codice resta,
   *  pronto per quando la fonte sarà utilizzabile. */
  enabled: boolean
  /** Motivo per cui è spento, da mostrare nei log */
  motivoDisattivazione?: string
  fetch(codiceCorso: string, opzioni?: OpzioniAdattatore): Promise<EsitoOrario>
}
