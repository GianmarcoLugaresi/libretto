/* ============================================================
   Una sincronizzazione Infostud, dall'inizio alla fine.

   estrazione (provider) → mapper → merge. Se una qualunque delle tre
   fallisce, il risultato è un errore e lo stato non si tocca: il
   merge lavora su una copia, e la copia si butta.
   ============================================================ */

import type { Stato, StatoInfostud } from '../types'
import { EsitoNegativo, FormatoCambiato, mappaEsami, mappaPrenotazioni } from './mapper'
import {
  AccessoNonRiuscito, InfostudIrraggiungibile, SyncAnnullata, TempoScaduto,
  type InfostudProvider, type OpzioniSync,
} from './provider'
import { unisci, type Riepilogo } from './unisci'

export type EsitoSync =
  | { ok: true; infostud: StatoInfostud; riepilogo: Riepilogo; quando: string }
  | { ok: false; errore: unknown }

export async function sincronizza(
  provider: InfostudProvider,
  s: Stato,
  alias: Record<string, string>,
  o: OpzioniSync,
  adesso: () => Date = () => new Date(),
): Promise<EsitoSync> {
  try {
    const grezzo = await provider.estrai(o)
    const quando = adesso().toISOString()
    const esami = mappaEsami(grezzo.esami, quando)
    const prenotazioni = mappaPrenotazioni(grezzo.prenotazioni, quando)
    const { stato, riepilogo } = unisci(s, esami, prenotazioni, alias)
    return { ok: true, infostud: stato.infostud, riepilogo, quando }
  } catch (errore) {
    return { ok: false, errore }
  }
}

/** Cosa dire allo studente, senza gergo. Mai il contenuto delle
 *  risposte: potrebbe contenere dati personali. */
export function messaggioErrore(e: unknown): { titolo: string; testo: string } {
  if (e instanceof SyncAnnullata) {
    return { titolo: 'Sincronizzazione annullata', testo: 'Non è cambiato niente.' }
  }
  if (e instanceof AccessoNonRiuscito) {
    return { titolo: 'Accesso non riuscito', testo: 'L’accesso con SPID o CIE non è andato a buon fine. Puoi riprovare quando vuoi.' }
  }
  if (e instanceof InfostudIrraggiungibile) {
    return { titolo: 'Infostud non raggiungibile', testo: 'Controlla la connessione, o riprova più tardi: a volte Infostud è in manutenzione.' }
  }
  if (e instanceof TempoScaduto) {
    return { titolo: 'Ci ha messo troppo', testo: 'La sincronizzazione si è fermata da sola. Riprova quando la connessione è migliore.' }
  }
  if (e instanceof EsitoNegativo) {
    return { titolo: 'Infostud ha rifiutato la richiesta', testo: 'Di solito basta rifare l’accesso. Se succede di nuovo, la sincronizzazione va aggiornata.' }
  }
  if (e instanceof FormatoCambiato) {
    return { titolo: 'Infostud è cambiato', testo: 'La sincronizzazione va aggiornata. Intanto i tuoi dati sono al sicuro e puoi continuare a mano.' }
  }
  return { titolo: 'Qualcosa è andato storto', testo: 'I tuoi dati non sono stati toccati. Intanto puoi continuare a mano.' }
}
