/* ============================================================
   Pubblicazione su `data/v1/`.

   Il compito è scrivere file che l'app possa scaricare uno alla
   volta, e soprattutto NON scriverli quando il controllo dice che
   sono sospetti: in quel caso resta l'ultima versione buona, già
   sul disco, e il job segnala il problema.

   Ogni file è validato con lo schema prima di toccare il disco: un
   file che non passa lo schema è un bug della pipeline, non un dato
   da pubblicare.
   ============================================================ */

import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { z } from 'zod'
import { VERSIONE_SCHEMA, Indice } from './tipi'
import type { Esito } from './controlli'
import { riassumi } from './controlli'

export interface Scritto {
  percorso: string
  hash: string
  /** Il contenuto era identico a quello già pubblicato */
  invariato: boolean
}

export interface Rapporto {
  scritti: Scritto[]
  /** File non pubblicati perché il controllo li ha bloccati */
  bloccati: string[]
  avvisi: string[]
  righe: string[]
}

/** L'hash del contenuto senza i campi che cambiano a ogni giro.
 *  Se cambia solo `fetchedAt`, il file è lo stesso e l'app non ha
 *  motivo di riscaricarlo. */
export function impronta(dato: unknown): string {
  const senzaTempo = JSON.parse(JSON.stringify(dato))
  delete senzaTempo.fetchedAt
  delete senzaTempo.generatedAt
  return createHash('sha256').update(stabile(senzaTempo)).digest('hex').slice(0, 16)
}

/** JSON con le chiavi in ordine: due oggetti uguali danno la stessa
 *  stringa anche se costruiti in ordine diverso. */
function stabile(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(stabile).join(',')}]`
  const chiavi = Object.keys(v as object).sort()
  return `{${chiavi.map(k => `${JSON.stringify(k)}:${stabile((v as Record<string, unknown>)[k])}`).join(',')}}`
}

export class Pubblicatore {
  private readonly hash: Record<string, string> = {}
  readonly rapporto: Rapporto = { scritti: [], bloccati: [], avvisi: [], righe: [] }

  constructor(private readonly radice: string) {}

  /** L'ultima versione buona già pubblicata, se c'è e se è leggibile. */
  async precedente<T>(percorso: string, schema: z.ZodType<T>): Promise<T | undefined> {
    try {
      const grezzo = JSON.parse(await readFile(join(this.radice, percorso), 'utf8'))
      const esito = schema.safeParse(grezzo)
      return esito.success ? esito.data : undefined
    } catch {
      return undefined
    }
  }

  /**
   * Valida, controlla e scrive. Se il controllo blocca, non scrive:
   * resta il file di ieri e il rapporto dice perché.
   */
  async scrivi<T>(
    percorso: string,
    dato: T,
    schema: z.ZodType<T>,
    controllo?: (dato: T, precedente?: T) => Esito,
  ): Promise<Scritto | undefined> {
    const valido = schema.safeParse(dato)
    if (!valido.success) {
      const dettaglio = valido.error.issues.slice(0, 3).map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
      this.rapporto.bloccati.push(percorso)
      this.rapporto.righe.push(`BLOCCATO · ${percorso}\n  schema: ${dettaglio}`)
      return undefined
    }

    if (controllo) {
      const prima = await this.precedente(percorso, schema)
      const esito = controllo(valido.data, prima)
      this.rapporto.righe.push(riassumi(percorso, esito))
      this.rapporto.avvisi.push(...esito.avvisi.map(a => `${percorso}: ${a}`))
      if (!esito.ok) {
        this.rapporto.bloccati.push(percorso)
        return undefined
      }
    }

    const testo = JSON.stringify(valido.data)
    const h = impronta(valido.data)
    const invariato = this.hashPubblicato(percorso) === h && await this.esiste(percorso)
    // Un file identico non si riscrive. Cambierebbe solo `fetchedAt`,
    // ma basterebbe a far risalvare a git tutti i file del catalogo
    // ogni notte. Perciò `fetchedAt` dice quando quel contenuto è
    // stato preso, e `generatedAt` dell'indice quando abbiamo
    // guardato l'ultima volta: sono due domande diverse.
    if (!invariato) await this.suDisco(percorso, testo)
    this.hash[percorso] = h
    const scritto = { percorso, hash: h, invariato }
    this.rapporto.scritti.push(scritto)
    return scritto
  }

  /** Un hash che corrisponde ma senza il file sul disco non vale:
   *  meglio riscrivere che lasciare un buco. */
  private async esiste(percorso: string): Promise<boolean> {
    try { await stat(join(this.radice, percorso)); return true } catch { return false }
  }

  private hashPubblicatoCache?: Record<string, string>
  private hashPubblicato(percorso: string): string | undefined {
    return this.hashPubblicatoCache?.[percorso]
  }

  /** Legge gli hash dell'indice già pubblicato, per sapere cosa è
   *  davvero cambiato rispetto a ieri. */
  async caricaHashPrecedenti(): Promise<void> {
    const vecchio = await this.precedente('index.json', Indice)
    this.hashPubblicatoCache = vecchio?.hash ?? {}
  }

  /** L'indice si scrive per ultimo: contiene gli hash di tutto il
   *  resto, quindi deve vedere cosa è stato davvero pubblicato.
   *
   *  Passa anche lui dal controllo: un indice dimezzato farebbe
   *  sparire dei corsi dall'app, che è il danno peggiore di tutti
   *  perché nasconde anche i file che stanno benissimo. */
  async scriviIndice(
    corsi: Indice['corsi'], sources: string[],
    controllo?: (i: Indice, precedente?: Indice) => Esito,
  ): Promise<void> {
    const adesso = new Date().toISOString()
    const indice: Indice = {
      schemaVersion: VERSIONE_SCHEMA,
      sources,
      fetchedAt: adesso,
      generatedAt: adesso,
      corsi,
      // Gli hash dei file bloccati restano quelli di ieri: il file
      // sul disco è ancora quello, e l'app non deve riscaricarlo.
      hash: { ...this.hashPubblicatoCache, ...this.hash },
    }
    const valido = Indice.parse(indice)
    if (controllo) {
      const esito = controllo(valido, await this.precedente('index.json', Indice))
      this.rapporto.righe.push(riassumi('index.json', esito))
      this.rapporto.avvisi.push(...esito.avvisi.map(a => `index.json: ${a}`))
      if (!esito.ok) {
        // Senza indice nuovo resta quello di ieri: elenca gli stessi
        // corsi e gli hash di ieri, quindi è coerente con i file che
        // non abbiamo toccato.
        this.rapporto.bloccati.push('index.json')
        return
      }
    }
    await this.suDisco('index.json', JSON.stringify(valido))
    // Anche l'indice va nel conto dei file scritti, altrimenti il
    // riepilogo dice un numero e poi ne elenca un altro.
    this.rapporto.scritti.push({ percorso: 'index.json', hash: impronta(valido), invariato: false })
  }

  /** Scrittura atomica: si scrive di fianco e si rinomina, così un
   *  job interrotto non lascia mezzo JSON che l'app non sa leggere. */
  private async suDisco(percorso: string, testo: string): Promise<void> {
    const pieno = join(this.radice, percorso)
    await mkdir(dirname(pieno), { recursive: true })
    const provvisorio = `${pieno}.tmp`
    await writeFile(provvisorio, testo, 'utf8')
    await rename(provvisorio, pieno)
  }
}

/* ---------------- Percorsi ---------------- */

// I percorsi stanno con gli schemi: sono il contratto con l'app, che
// li importa da lì senza tirarsi dietro node:fs.
export { percorsi } from './tipi'

export function stampaRapporto(r: Rapporto): string {
  const testa = `${r.scritti.length} file scritti, ${r.scritti.filter(s => s.invariato).length} invariati, ${r.bloccati.length} bloccati`
  return [testa, ...r.righe].join('\n')
}
