/* ============================================================
   Tema dell'app: Automatico (segue il telefono), Chiaro o Scuro.
   La scelta sta nelle impostazioni; qui si decide quello che vale
   adesso e lo si applica alla pagina e, nell'app, a iOS (barra di
   stato, tastiera, selettori di data e ora: ios/App/App/Aspetto.swift).
   ============================================================ */

import { Capacitor, registerPlugin } from '@capacitor/core'
import type { Impostazioni } from './types'

export type Tema = Impostazioni['tema']

/** Il colore di fondo di ciascun tema: lo usa la barra del browser. */
const FONDO = { chiaro: '#f3f3f4', scuro: '#060607' } as const

export function temaEffettivo(tema: Tema, sistemaChiaro: boolean): 'chiaro' | 'scuro' {
  if (tema === 'chiaro' || tema === 'scuro') return tema
  return sistemaChiaro ? 'chiaro' : 'scuro'
}

const Aspetto = registerPlugin<{ imposta(o: { tema: Tema }): Promise<void> }>('Aspetto')

/** Applica il tema e, se è automatico, lo tiene allineato al telefono.
 *  Restituisce la funzione che smette di ascoltare. */
export function applicaTema(tema: Tema): () => void {
  const sistema = window.matchMedia('(prefers-color-scheme: light)')
  const applica = () => {
    const t = temaEffettivo(tema, sistema.matches)
    const root = document.documentElement
    if (t === 'chiaro') root.setAttribute('data-theme', 'light')
    else root.removeAttribute('data-theme')
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', FONDO[t])
  }
  applica()
  // Una versione dell'app senza il plugin rifiuta: resta il tema del
  // sistema per le parti native, la pagina è già a posto.
  if (Capacitor.isNativePlatform()) Aspetto.imposta({ tema }).catch(() => {})
  if (tema !== 'auto') return () => {}
  sistema.addEventListener('change', applica)
  return () => sistema.removeEventListener('change', applica)
}
