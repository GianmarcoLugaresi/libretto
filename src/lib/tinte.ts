/* Tinte dei corsi: la tonalità viaggia come variabile CSS,
   il tema decide il resto. */

import type { CSSProperties } from 'react'
import { TINTE } from './types'

/** Applica la tonalità di un corso al sottoalbero. */
export function tinta(i: number): CSSProperties {
  return { ['--h' as string]: String(TINTE[i % TINTE.length].h) }
}

export const PIENO = 'hsl(var(--h) var(--c-s) var(--c-l))'
export const VELO  = 'hsl(var(--h) var(--c-w-s) var(--c-w-l))'
export const TESTO = 'hsl(var(--h) var(--c-t-s) var(--c-t-l))'

/** Colore pieno calcolato fuori dal DOM (grafici in canvas/SVG
 *  che non ereditano la variabile). */
export function pienoDi(i: number, scuro: boolean): string {
  const h = TINTE[i % TINTE.length].h
  return scuro ? `hsl(${h} 52% 62%)` : `hsl(${h} 44% 40%)`
}
