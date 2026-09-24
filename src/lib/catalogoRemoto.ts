/* ============================================================
   Il client che scarica e valida i dati pubblici.

   Sta in un modulo a parte perché si porta dietro zod e gli schemi:
   l'app lo carica dopo il primo disegno, così l'avvio non aspetta
   la validazione. Le regole sono in dati.ts.
   ============================================================ */

import type { z } from 'zod'
import { Appelli, Indice, Orario, Piano } from '../../pipeline/src/tipi'
import { percorsi } from '../../pipeline/src/percorsi'
import type { Archivio, DepositoCatalogo } from './deposito'
import { URL_DATI, annoOrario, type Esito } from './dati'

interface MetaFile {
  /** Impronta dell'indice per questo file, quando l'abbiamo preso */
  hash?: string
  /** Quando l'abbiamo preso (ISO) */
  presoIl: string
}

const CHIAVE_INDICE = 'indice'

export class CatalogoRemoto {
  private readonly base: string

  constructor(
    private readonly dep: DepositoCatalogo,
    base: string = URL_DATI,
    private readonly fetch_: typeof fetch = (...a) => fetch(...a),
    private readonly adesso: () => Date = () => new Date(),
  ) {
    // Un indirizzo relativo («/dati-locali/v1/» in sviluppo) vale
    // rispetto alla pagina; uno assoluto resta com'è.
    this.base = new URL(base, globalThis.location?.href ?? 'http://localhost/').toString()
  }

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

  /** L'orario di un corso, qualunque sia la coorte dello studente:
   *  vedi annoOrario. */
  async orarioDelCorso(codice: string): Promise<Orario | undefined> {
    const anno = annoOrario(await this.indice(), codice)
    return anno == null ? undefined : this.orario(codice, anno)
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

  /** Piano, appelli e orario di una coorte, solo dove l'impronta è
   *  cambiata. Un file che l'indice non elenca non si chiede: la
   *  pipeline non l'ha pubblicato, e chiederlo sarebbe un 404 sicuro.
   *  Appelli e orario stanno sul codice del corso anche per le coorti
   *  con un codice loro: la stessa pagina li elenca tutti, e l'orario
   *  sta sotto la coorte più recente (annoOrario). */
  async aggiornaCorso(
    codice: string, coorte: number, codiceCorso: string = codice,
  ): Promise<Record<'piano' | 'appelli' | 'orario', Esito>> {
    const ind = await this.indice()
    const hash = ind?.hash ?? {}
    const pp = percorsi.piano(codice, coorte)
    const pa = percorsi.appelli(codiceCorso)
    const ao = annoOrario(ind, codiceCorso)
    const po = ao == null ? undefined : percorsi.orario(codiceCorso, ao)
    const [piano, appelli, orario] = await Promise.all([
      pp in hash ? this.scarica(pp, Piano, 'piani', `${codice}/${coorte}`, hash[pp]) : Promise.resolve<Esito>('assente'),
      pa in hash ? this.scarica(pa, Appelli, 'appelli', codiceCorso, hash[pa]) : Promise.resolve<Esito>('assente'),
      po ? this.scarica(po, Orario, 'orari', `${codiceCorso}/${ao}`, hash[po]) : Promise.resolve<Esito>('assente'),
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
