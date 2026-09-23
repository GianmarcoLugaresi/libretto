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

import type { z } from 'zod'
import { Appelli, Indice, Orario, Piano, percorsi } from '../../pipeline/src/tipi'
import type { Archivio, DepositoCatalogo } from './deposito'

export type { Appelli, Indice, Orario, Piano }
export type Corso = Indice['corsi'][number]

/** Dove stanno i dati. In produzione accanto all'app sulle Pages;
 *  in sviluppo si può puntare a una cartella locale. */
export const URL_DATI: string =
  (import.meta.env.VITE_DATI_URL as string | undefined) ??
  'https://gianmarcolugaresi.github.io/libretto/data/v1/'

/** Com'è andato il tentativo di aggiornare un file. */
export type Esito =
  | 'aggiornato'   // scaricato e salvato
  | 'invariato'    // l'impronta coincide, niente da scaricare
  | 'assente'      // la pipeline non l'ha pubblicato (es. niente orario)
  | 'offline'      // la rete non c'è o il server ha risposto male
  | 'non-valido'   // è arrivato qualcosa che non passa lo schema

interface MetaFile {
  /** Impronta dell'indice per questo file, quando l'abbiamo preso */
  hash?: string
  /** Quando l'abbiamo preso (ISO) */
  presoIl: string
}

const CHIAVE_INDICE = 'indice'

export interface Disponibilita {
  /** Coorti di cui c'è il piano */
  piani: number[]
  /** Coorti di cui c'è l'orario */
  orari: number[]
  appelli: boolean
}

export class CatalogoRemoto {
  constructor(
    private readonly dep: DepositoCatalogo,
    private readonly base: string = URL_DATI,
    private readonly fetch_: typeof fetch = (...a) => fetch(...a),
    private readonly adesso: () => Date = () => new Date(),
  ) {}

  /* ---------------- Lettura locale ---------------- */

  indice(): Promise<Indice | undefined> {
    return this.dep.prendi<Indice>('corsi', CHIAVE_INDICE)
  }

  piano(codice: string, coorte: number): Promise<Piano | undefined> {
    return this.dep.prendi<Piano>('piani', `${codice}/${coorte}`)
  }

  appelli(codice: string): Promise<Appelli | undefined> {
    return this.dep.prendi<Appelli>('appelli', codice)
  }

  orario(codice: string, coorte: number): Promise<Orario | undefined> {
    return this.dep.prendi<Orario>('orari', `${codice}/${coorte}`)
  }

  /** Quando è stato preso l'indice l'ultima volta: è il «aggiornato
   *  il…» che vede lo studente. */
  async aggiornatoIl(): Promise<string | undefined> {
    return (await this.dep.prendi<MetaFile>('meta', percorsi.indice()))?.presoIl
  }

  /* ---------------- Aggiornamento ---------------- */

  /** L'indice si chiede sempre: è piccolo, ed è lui a dire cosa è
   *  cambiato. Il browser lo rivalida con l'ETag da sé. */
  aggiornaIndice(): Promise<Esito> {
    return this.scarica(percorsi.indice(), Indice, 'corsi', CHIAVE_INDICE)
  }

  /** Piano, appelli e orario di un corso, solo dove l'impronta è
   *  cambiata. Un file che l'indice non elenca non si chiede: la
   *  pipeline non l'ha pubblicato, e chiederlo sarebbe un 404 sicuro. */
  async aggiornaCorso(codice: string, coorte: number): Promise<Record<'piano' | 'appelli' | 'orario', Esito>> {
    const ind = await this.indice()
    const hash = ind?.hash ?? {}
    const pp = percorsi.piano(codice, coorte)
    const pa = percorsi.appelli(codice)
    const po = percorsi.orario(codice, coorte)
    const [piano, appelli, orario] = await Promise.all([
      pp in hash ? this.scarica(pp, Piano, 'piani', `${codice}/${coorte}`, hash[pp]) : Promise.resolve<Esito>('assente'),
      pa in hash ? this.scarica(pa, Appelli, 'appelli', codice, hash[pa]) : Promise.resolve<Esito>('assente'),
      po in hash ? this.scarica(po, Orario, 'orari', `${codice}/${coorte}`, hash[po]) : Promise.resolve<Esito>('assente'),
    ])
    return { piano, appelli, orario }
  }

  private async scarica<T>(
    percorso: string, schema: z.ZodType<T>, archivio: Archivio, chiave: string, hashAtteso?: string,
  ): Promise<Esito> {
    const meta = await this.dep.prendi<MetaFile>('meta', percorso)
    if (hashAtteso && meta?.hash === hashAtteso && (await this.dep.prendi(archivio, chiave)) !== undefined) {
      return 'invariato'
    }

    let r: Response
    try {
      // no-cache: il browser rivalida con l'ETag che ha già, e un 304
      // torna qui come la risposta che aveva in cache. Niente header
      // fatti a mano, che su un altro dominio farebbero partire una
      // richiesta preliminare in più.
      r = await this.fetch_(new URL(percorso, this.base).toString(), { cache: 'no-cache' })
    } catch {
      return 'offline'
    }
    if (r.status === 404) return 'assente'
    if (!r.ok) return 'offline'

    let grezzo: unknown
    try { grezzo = await r.json() } catch { return 'non-valido' }
    const v = schema.safeParse(grezzo)
    if (!v.success) {
      // Una versione di schema più nuova dell'app, o un file rotto:
      // in entrambi i casi si tiene quello che si ha.
      console.warn('[dati] scartato', percorso, v.error.issues.slice(0, 2))
      return 'non-valido'
    }

    await this.dep.metti(archivio, chiave, v.data)
    await this.dep.metti('meta', percorso, { hash: hashAtteso, presoIl: this.adesso().toISOString() } satisfies MetaFile)
    return 'aggiornato'
  }
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

/** Il codice corso di una coorte. Le coorti vecchie hanno un codice
 *  loro (Design 2024/25 è 31807): è quello il file da aprire. */
export function codiceDellaCoorte(corso: Corso, coorte: number): string {
  return corso.coorti.find(k => k.anno === coorte)?.codiceCorso ?? corso.codice
}

/** Appelli della propria coorte: la pagina di un corso li mescola
 *  tutti, ognuno col suo codice corso. Una riga senza codice vale
 *  per chiunque. */
export function appelliDellaCoorte(a: Appelli | undefined, codiceCoorte: string): Appelli['appelli'] {
  return (a?.appelli ?? []).filter(x => !x.codiceCorso || x.codiceCorso === codiceCoorte)
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
