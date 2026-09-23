/* ============================================================
   Da dove arrivano i dati di Infostud.

   La UI parla con un InfostudProvider e non sa come si fa l'accesso:
   - MockInfostudProvider restituisce le risposte finte di fixture.ts,
     con i tempi e gli errori di una sincronizzazione vera;
   - WebViewInfostudProvider (webview.ts) apre le pagine ufficiali in
     una WebView con sessione usa-e-getta, solo nell'app per iPhone.
   Entrambi restituiscono le risposte grezze; mapper e merge sono gli
   stessi per tutti e due.
   ============================================================ */

import { esamiFinti, esamiVuoti, prenotazioniFinte, prenotazioniVuote } from './fixture'

/** Le risposte di Infostud, così come arrivano, ridotte a esito e
 *  ritorno: la sessione (`output`) non arriva mai fin qui. */
export interface Estrazione {
  esami: unknown
  prenotazioni: unknown
}

export type FaseSync = 'accesso' | 'lettura'

export interface OpzioniSync {
  segnale: AbortSignal
  fase: (f: FaseSync) => void
}

export interface InfostudProvider {
  readonly nome: 'prova' | 'webview'
  estrai(o: OpzioniSync): Promise<Estrazione>
}

/* ---------------- Errori comprensibili ---------------- */

export class SyncAnnullata extends Error {
  constructor() { super('Sincronizzazione annullata'); this.name = 'SyncAnnullata' }
}
export class AccessoNonRiuscito extends Error {
  constructor(m = 'Accesso non riuscito') { super(m); this.name = 'AccessoNonRiuscito' }
}
export class InfostudIrraggiungibile extends Error {
  constructor(m = 'Infostud non raggiungibile') { super(m); this.name = 'InfostudIrraggiungibile' }
}
export class TempoScaduto extends Error {
  constructor() { super('Tempo scaduto'); this.name = 'TempoScaduto' }
}

/** Aspetta, ma si ferma subito se lo studente annulla. */
export function attesa(ms: number, segnale: AbortSignal): Promise<void> {
  return new Promise((ok, no) => {
    if (segnale.aborted) { no(new SyncAnnullata()); return }
    const t = setTimeout(ok, ms)
    segnale.addEventListener('abort', () => { clearTimeout(t); no(new SyncAnnullata()) }, { once: true })
  })
}

/* ---------------- Provider di prova ---------------- */

export type Scenario = 'esami' | 'vuoto' | 'accesso-fallito' | 'irraggiungibile' | 'formato-cambiato'

export class MockInfostudProvider implements InfostudProvider {
  readonly nome = 'prova'

  constructor(private readonly scenario: Scenario = 'esami', private readonly ritardoMs = 900) {}

  async estrai({ segnale, fase }: OpzioniSync): Promise<Estrazione> {
    fase('accesso')
    await attesa(this.ritardoMs, segnale)
    if (this.scenario === 'accesso-fallito') throw new AccessoNonRiuscito()
    if (this.scenario === 'irraggiungibile') throw new InfostudIrraggiungibile()
    fase('lettura')
    await attesa(this.ritardoMs, segnale)
    if (this.scenario === 'formato-cambiato') return { esami: { risposta: 'inattesa' }, prenotazioni: prenotazioniVuote }
    if (this.scenario === 'vuoto') return { esami: esamiVuoti, prenotazioni: prenotazioniVuote }
    // Una copia: il merge non deve poter modificare la fixture.
    return JSON.parse(JSON.stringify({ esami: esamiFinti, prenotazioni: prenotazioniFinte }))
  }
}
