/* ============================================================
   Provider WebView: le pagine ufficiali di Infostud in una WebView
   nativa con sessione usa-e-getta (plugin in plugins/infostud-webview).

   Solo nell'app per iPhone. Il browser non può incorporare il login
   di un altro sito né leggerne i dati, ed è giusto così.
   ============================================================ */

import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { CONFIG_ATTIVA, type ConfigInfostud } from './config'
import { scriptDiEstrazione } from './script'
import {
  AccessoNonRiuscito, InfostudIrraggiungibile, SyncAnnullata, TempoScaduto,
  type Estrazione, type FaseSync, type InfostudProvider, type OpzioniSync,
} from './provider'

interface PluginInfostud {
  estrai(o: { url: string; hostConsentiti: string[]; script: string; timeoutMs: number }): Promise<Estrazione>
  annulla(): Promise<void>
  addListener(evento: 'fase', f: (x: { fase: FaseSync }) => void): Promise<PluginListenerHandle>
}

const Plugin = registerPlugin<PluginInfostud>('InfostudWebView')

export function webviewDisponibile(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('InfostudWebView')
}

export class WebViewInfostudProvider implements InfostudProvider {
  readonly nome = 'webview'

  constructor(private readonly config: ConfigInfostud = CONFIG_ATTIVA) {}

  async estrai({ segnale, fase }: OpzioniSync): Promise<Estrazione> {
    if (segnale.aborted) throw new SyncAnnullata()
    const ascolto = await Plugin.addListener('fase', x => fase(x.fase))
    const annulla = () => { Plugin.annulla().catch(() => {}) }
    segnale.addEventListener('abort', annulla, { once: true })
    fase('accesso')
    try {
      return await Plugin.estrai({
        url: this.config.loginUrl,
        hostConsentiti: this.config.hostConsentiti,
        script: scriptDiEstrazione({
          hostConsentiti: this.config.hostConsentiti,
          canale: 'mysapienza',
          risorse: this.config.endpoints,
          suggerimentoMs: 12_000,
        }),
        timeoutMs: this.config.timeoutMs,
      })
    } catch (e) {
      throw traduci(e)
    } finally {
      segnale.removeEventListener('abort', annulla)
      ascolto.remove().catch(() => {})
    }
  }
}

/** I codici del plugin nativo diventano gli errori dell'app. */
function traduci(e: unknown): Error {
  const codice = (e as { code?: string })?.code
  switch (codice) {
    case 'ANNULLATA': return new SyncAnnullata()
    case 'TEMPO_SCADUTO': return new TempoScaduto()
    case 'IRRAGGIUNGIBILE': return new InfostudIrraggiungibile()
    case 'LETTURA_FALLITA': return new AccessoNonRiuscito('La lettura dei dati non è riuscita')
    default: return e instanceof Error ? e : new Error(String(e))
  }
}
