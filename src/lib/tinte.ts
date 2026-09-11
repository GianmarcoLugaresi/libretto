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

/** Tappe della scala dei voti, le stesse di --spettro. */
const SCALA: [number, [number, number, number]][] = [
  [18, [255, 77, 106]], [20.6, [255, 140, 66]], [23.3, [255, 209, 102]],
  [25.7, [126, 231, 135]], [27.8, [76, 201, 240]], [30, [167, 139, 250]],
]

/** Colore di un voto 18–30 interpolato sulla scala. */
export function coloreVoto(voto: number): string {
  const v = Math.max(18, Math.min(30, voto))
  for (let i = 1; i < SCALA.length; i++) {
    const [v0, c0] = SCALA[i - 1], [v1, c1] = SCALA[i]
    if (v <= v1) {
      const t = (v - v0) / (v1 - v0)
      const m = c0.map((a, k) => Math.round(a + (c1[k] - a) * t))
      return `rgb(${m[0]} ${m[1]} ${m[2]})`
    }
  }
  return 'rgb(167 139 250)'
}

/** Posizione percentuale di un voto sulla barra 18→30. */
export function posizioneVoto(voto: number): number {
  return ((Math.max(18, Math.min(30, voto)) - 18) / 12) * 100
}
