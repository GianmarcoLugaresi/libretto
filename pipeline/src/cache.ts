/* ============================================================
   Cache di ETag e Last-Modified.

   Serve a due cose insieme: essere gentili con il server (un 304
   non costa quasi nulla a nessuno) e accorgersi che una pagina non
   è cambiata senza riparsarla.

   Vive su disco fra un'esecuzione e l'altra. Se il file si perde
   non succede niente di grave: si riscarica tutto una volta.
   ============================================================ */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface Voce {
  etag?: string
  lastModified?: string
  /** Quando l'abbiamo vista l'ultima volta, per poter scadere */
  vista: string
}

export class Cache {
  private voci: Record<string, Voce> = {}

  constructor(private readonly file: string) {}

  async carica(): Promise<void> {
    try {
      this.voci = JSON.parse(await readFile(this.file, 'utf8'))
    } catch {
      // Prima esecuzione, o file corrotto: si riparte da vuoto.
      this.voci = {}
    }
  }

  /** Una voce più vecchia di `giorni` non si usa: un ETag eterno
   *  nasconderebbe per sempre un cambiamento che il server non
   *  segnala bene. */
  prendi(url: string, giorni = 7): { etag?: string; lastModified?: string } {
    const v = this.voci[url]
    if (!v) return {}
    const eta = (Date.now() - Date.parse(v.vista)) / 86_400_000
    if (!Number.isFinite(eta) || eta > giorni) return {}
    return { etag: v.etag, lastModified: v.lastModified }
  }

  segna(url: string, r: { etag?: string; lastModified?: string }): void {
    // Un 304 conferma la voce: si rinfresca la data, non si perde
    // l'ETag che il server non ha rimandato.
    const prima = this.voci[url]
    this.voci[url] = {
      etag: r.etag ?? prima?.etag,
      lastModified: r.lastModified ?? prima?.lastModified,
      vista: new Date().toISOString(),
    }
  }

  async salva(): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true })
    await writeFile(this.file, JSON.stringify(this.voci, null, 1), 'utf8')
  }

  get dimensione(): number { return Object.keys(this.voci).length }
}
