/* ============================================================
   Accesso educato alle fonti pubbliche.

   Il robots.txt di corsidilaurea.uniroma1.it dichiara
   `Crawl-delay: 10`: dieci secondi fra una richiesta e l'altra,
   non una al secondo. È un tetto stretto e detta la scala di tutta
   la pipeline, quindi è scritto qui una volta sola e rispettato
   sempre.

   Qui dentro non si fa scraping di host che non lo consentono:
   app.arc.uniroma1.it e gomp.uniroma1.it restano fuori.
   ============================================================ */

import { setTimeout as attendi } from 'node:timers/promises'

export const UA =
  'MySapienzaBot/0.1 (progetto studentesco non ufficiale; +https://github.com/GianmarcoLugaresi/libretto; contatto: placeholder@example.com)'

/** Host da cui è consentito leggere, con la loro attesa minima. */
export const HOST_CONSENTITI: Record<string, number> = {
  'corsidilaurea.uniroma1.it': 10_000,
}

/** Host esclusi per scelta, con il motivo: serve a chi legge il
 *  codice fra un anno e si chiede perché manchi la fonte ovvia. */
export const HOST_ESCLUSI: Record<string, string> = {
  'app.arc.uniroma1.it': 'robots.txt non consente l’accesso automatico',
  'gomp.uniroma1.it': 'robots.txt non consente l’accesso automatico',
}

export class HostNonConsentito extends Error {
  constructor(host: string, motivo: string) {
    super(`Host non consentito: ${host} — ${motivo}`)
    this.name = 'HostNonConsentito'
  }
}

export interface Risposta {
  /** null quando il server ha risposto 304: il contenuto non è cambiato */
  corpo: string | null
  etag?: string
  lastModified?: string
  stato: number
  url: string
}

export interface OpzioniFetch {
  /** ETag della copia che abbiamo già */
  etag?: string
  lastModified?: string
  /** Iniettabile nei test */
  fetchImpl?: typeof fetch
  /** Attesa minima, per i test */
  attesaMs?: number
  /** Tentativi in caso di 429/5xx */
  tentativi?: number
}

/** Ultima richiesta per host, per far rispettare il crawl-delay
 *  anche fra chiamate che non si conoscono fra loro. */
const ultimaRichiesta = new Map<string, number>()

export function azzeraRitmo(): void {
  ultimaRichiesta.clear()
}

function hostDi(url: string): string {
  return new URL(url).host
}

/** Aspetta quanto serve perché fra due richieste allo stesso host
 *  passi almeno il crawl-delay. */
async function rispettaIlRitmo(host: string, attesaMs: number): Promise<void> {
  const ultima = ultimaRichiesta.get(host)
  if (ultima != null) {
    const passato = Date.now() - ultima
    if (passato < attesaMs) await attendi(attesaMs - passato)
  }
  ultimaRichiesta.set(host, Date.now())
}

/** Scarica una pagina rispettando ritmo, cache e backoff.
 *  Un 304 non è un errore: vuol dire che la copia che abbiamo va
 *  ancora bene, ed è il caso più frequente in una pipeline
 *  giornaliera. */
export async function scarica(url: string, o: OpzioniFetch = {}): Promise<Risposta> {
  const host = hostDi(url)
  const motivoEsclusione = HOST_ESCLUSI[host]
  if (motivoEsclusione) throw new HostNonConsentito(host, motivoEsclusione)
  if (!(host in HOST_CONSENTITI)) {
    throw new HostNonConsentito(host, 'non è fra gli host previsti dalla pipeline')
  }

  const f = o.fetchImpl ?? fetch
  const attesa = o.attesaMs ?? HOST_CONSENTITI[host]
  const tentativiMax = o.tentativi ?? 3

  const intestazioni: Record<string, string> = { 'User-Agent': UA, 'Accept-Language': 'it' }
  if (o.etag) intestazioni['If-None-Match'] = o.etag
  if (o.lastModified) intestazioni['If-Modified-Since'] = o.lastModified

  let ultimoErrore: unknown
  for (let tentativo = 1; tentativo <= tentativiMax; tentativo++) {
    await rispettaIlRitmo(host, attesa)
    let r: Response
    try {
      r = await f(url, { headers: intestazioni, redirect: 'follow' })
    } catch (e) {
      ultimoErrore = e
      if (tentativo === tentativiMax) break
      await attendi(attesa * tentativo)
      continue
    }

    if (r.status === 304) {
      return { corpo: null, stato: 304, url, etag: o.etag, lastModified: o.lastModified }
    }
    if (r.status === 403) {
      // Un divieto non si ritenta: si smette e lo si dice.
      throw new HostNonConsentito(host, 'il server ha risposto 403')
    }
    if (r.status === 429 || r.status >= 500) {
      // Backoff crescente; se il server indica Retry-After si usa quello.
      const indicato = Number(r.headers.get('retry-after'))
      const pausa = Number.isFinite(indicato) && indicato > 0 ? indicato * 1000 : attesa * 2 ** tentativo
      ultimoErrore = new Error(`${r.status} da ${url}`)
      if (tentativo === tentativiMax) break
      await attendi(pausa)
      continue
    }
    if (!r.ok) throw new Error(`${r.status} ${r.statusText} — ${url}`)

    return {
      corpo: await r.text(),
      stato: r.status,
      url,
      etag: r.headers.get('etag') ?? undefined,
      lastModified: r.headers.get('last-modified') ?? undefined,
    }
  }
  throw new Error(`Richiesta fallita dopo ${tentativiMax} tentativi — ${url}: ${String(ultimoErrore)}`)
}
