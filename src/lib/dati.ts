/* ============================================================
   Dati pubblici: dal sito al telefono.

   La pipeline pubblica ogni notte dei file JSON; qui l'app li
   scarica, li valida con gli STESSI schemi con cui la pipeline li ha
   scritti, e li mette nel deposito locale. Da quel momento la UI
   legge solo dal telefono: senza rete funziona tutto, con i dati
   dell'ultima volta.

   Tre regole:
   - si scarica solo ciò che è cambiato: l'indice porta l'impronta di
     ogni file, e un file con la stessa impronta non si richiede;
   - un file che non passa lo schema non entra: resta quello di prima;
   - la rete che manca non è un errore da mostrare, è la normalità
     di un telefono in metropolitana.
   ============================================================ */

// Solo tipi da tipi.ts: gli schemi zod (e zod stesso) li carica
// catalogoRemoto.ts, a parte, dopo il primo disegno dell'app.
import type { Appelli, Indice, Orario, Piano } from '../../pipeline/src/tipi'

export type { Appelli, Indice, Orario, Piano }
export type Corso = Indice['corsi'][number]

/** Dove stanno i dati. In produzione accanto all'app sulle Pages;
 *  in sviluppo si può puntare a una cartella locale. */
export const URL_DATI: string =
  // `env` c'è solo dentro Vite: fuori (script, test in node) si usa
  // l'indirizzo di produzione.
  (import.meta.env?.VITE_DATI_URL as string | undefined) ??
  'https://gianmarcolugaresi.github.io/libretto/data/v1/'

/** Com'è andato il tentativo di aggiornare un file. */
export type Esito =
  | 'aggiornato'   // scaricato e salvato
  | 'invariato'    // l'impronta coincide, niente da scaricare
  | 'assente'      // la pipeline non l'ha pubblicato (es. niente orario)
  | 'offline'      // la rete non c'è o il server ha risposto male
  | 'non-valido'   // è arrivato qualcosa che non passa lo schema

export interface Disponibilita {
  /** Coorti di cui c'è il piano */
  piani: number[]
  /** Coorti di cui c'è l'orario */
  orari: number[]
  appelli: boolean
}

/* ---------------- Letture sull'indice ---------------- */

/** Cosa c'è di pubblicato per un corso, ricavato dalle impronte
 *  dell'indice: se il file non è lì, non esiste. */
export function disponibilita(ind: Indice | undefined, codice: string): Disponibilita {
  const out: Disponibilita = { piani: [], orari: [], appelli: false }
  if (!ind) return out
  const codici = new Set([codice, ...(ind.corsi.find(c => c.codice === codice)?.coorti.map(k => k.codiceCorso) ?? [])])
  for (const p of Object.keys(ind.hash)) {
    const m = /^courses\/([^/]+)\/(?:(\d{4})\/)?(plan|timetable|exams)\.json$/.exec(p)
    if (!m || !codici.has(m[1])) continue
    if (m[3] === 'exams' && m[1] === codice) out.appelli = true
    if (m[3] === 'plan') out.piani.push(Number(m[2]))
    if (m[3] === 'timetable') out.orari.push(Number(m[2]))
  }
  out.piani.sort((a, b) => b - a)
  out.orari.sort((a, b) => b - a)
  return out
}

/** Di quale coorte è l'orario pubblicato di un corso. L'orario è del
 *  corso, non della coorte: il calendario della facoltà copre tutti
 *  gli anni, e la pipeline lo pubblica sotto il codice del corso e la
 *  coorte più recente. Chi è al secondo o terzo anno lo trova lì, non
 *  sotto l'anno in cui si è iscritto. */
export function annoOrario(ind: Indice | undefined, codice: string): number | undefined {
  let anno: number | undefined
  for (const p of Object.keys(ind?.hash ?? {})) {
    const m = /^courses\/([^/]+)\/(\d{4})\/timetable\.json$/.exec(p)
    if (m && m[1] === codice && (anno === undefined || Number(m[2]) > anno)) anno = Number(m[2])
  }
  return anno
}

/** Il codice corso di una coorte. Le coorti vecchie hanno un codice
 *  loro (Design 2024/25 è 31807): è quello il file da aprire. */
export function codiceDellaCoorte(corso: Corso, coorte: number): string {
  return corso.coorti.find(k => k.anno === coorte)?.codiceCorso ?? corso.codice
}

/** Appelli della propria coorte: la pagina di un corso li mescola
 *  tutti, ognuno col suo codice corso. Una riga senza codice vale
 *  per chiunque. Lo stesso esame può comparire con due codici che la
 *  fonte dichiara alias (ordinamenti diversi, stessa data, stesso
 *  docente): si mostra una volta, col codice canonico. */
export function appelliDellaCoorte(a: Appelli | undefined, codiceCoorte: string): Appelli['appelli'] {
  if (!a) return []
  const canonico = (c: string) => a.alias[c] ?? c
  const visti = new Map<string, Appelli['appelli'][number]>()
  for (const x of a.appelli) {
    if (x.codiceCorso && x.codiceCorso !== codiceCoorte) continue
    const k = `${canonico(x.codice)}|${x.data}`
    const prima = visti.get(k)
    if (!prima) { visti.set(k, { ...x, codice: canonico(x.codice) }); continue }
    prima.docenti = [...new Set([...prima.docenti, ...x.docenti])]
  }
  return [...visti.values()]
}

/** Ricerca per nome o codice, senza accenti e senza badare alle
 *  maiuscole. Prima chi comincia con la parola cercata. */
export function cercaCorsi(corsi: Corso[], q: string, norm: (s: string) => string): Corso[] {
  const t = norm(q)
  if (!t) return corsi
  const trovati = corsi.filter(c => norm(c.nome).includes(t) || c.codice === q.trim() || norm(c.classe ?? '') === t)
  return trovati.sort((a, b) => {
    const pa = norm(a.nome).startsWith(t) ? 0 : 1
    const pb = norm(b.nome).startsWith(t) ? 0 : 1
    return pa - pb || a.nome.localeCompare(b.nome, 'it')
  })
}

/** Quando conviene ricontrollare: non più di una volta ogni sei ore,
 *  per non consumare batteria e dati a ogni apertura. */
export const INTERVALLO_SYNC_MS = 6 * 60 * 60 * 1000

export function serveControllare(ultimo: string | undefined, adesso: Date): boolean {
  if (!ultimo) return true
  const t = Date.parse(ultimo)
  return !Number.isFinite(t) || adesso.getTime() - t >= INTERVALLO_SYNC_MS
}
