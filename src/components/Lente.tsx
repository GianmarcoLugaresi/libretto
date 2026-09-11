/* ============================================================
   Lente — Liquid Glass vero, anche su Safari.

   Safari non applica filtri SVG al backdrop (WebKit 245510), quindi
   la lente non filtra "quel che c'è dietro": filtra UNA COPIA VIVA
   del contenuto che le sta dietro, clonata dal DOM e tenuta
   allineata a ogni scroll. Sulla copia gira un feDisplacementMap con
   una mappa costruita come signed-distance field del rettangolo
   arrotondato: ai bordi lo spostamento è massimo (il "labbro" che
   rifrange), al centro nullo. Tre passate con scala diversa per
   R, G e B danno l'aberrazione cromatica; il canale B della mappa è
   la maschera del riflesso.
   ============================================================ */

import {
  useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
} from 'react'
import type { CSSProperties, ReactNode, ElementType } from 'react'

export interface Ottica {
  /** Ampiezza dello spostamento ai bordi, in px */
  forza?: number
  /** Larghezza del labbro rifrangente, in px */
  labbro?: number
  /** Curva del labbro: >1 concentra la rifrazione sul bordo */
  curva?: number
  /** Sfocatura del vetro, in px (0 = vetro limpido) */
  gelo?: number
  /** Aberrazione cromatica: differenza di scala fra i canali (0–0.2) */
  dispersione?: number
  /** Saturazione del fondo attraverso il vetro */
  saturazione?: number
}

const DEF: Required<Ottica> = {
  forza: 22, labbro: 14, curva: 1.6, gelo: 3, dispersione: 0.08, saturazione: 1.55,
}

/* ---------------- Mappa di spostamento ---------------- */

function sdfRett(x: number, y: number, w: number, h: number, r: number): number {
  const qx = Math.abs(x - w / 2) - (w / 2 - r)
  const qy = Math.abs(y - h / 2) - (h / 2 - r)
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0)
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r
}

/** PNG (data URL) con la mappa per un box w×h col raggio r, in cui
 *  il rettangolo è rientrato di `bleed` px: fuori è neutra. */
function generaMappa(w: number, h: number, r: number, bleed: number, labbro: number, curva: number, dpr: number): string {
  const W = Math.max(2, Math.round(w * dpr)), H = Math.max(2, Math.round(h * dpr))
  const B = bleed * dpr, R = Math.min(r * dpr, (W - 2 * B) / 2, (H - 2 * B) / 2)
  const L = Math.max(1, labbro * dpr)
  const iw = W - 2 * B, ih = H - 2 * B
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(W, H)
  const d = img.data
  const s = (x: number, y: number) => sdfRett(x - B, y - B, iw, ih, R)

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      const v = s(x + 0.5, y + 0.5)          // <0 dentro
      let dx = 0, dy = 0, spec = 0
      if (v < 0) {
        const dist = -v
        const t = Math.max(0, Math.min(1, 1 - dist / L))
        const mag = Math.pow(t, curva)
        // gradiente dell'SDF = normale verso l'esterno
        const gx = s(x + 1.5, y + 0.5) - s(x - 0.5, y + 0.5)
        const gy = s(x + 0.5, y + 1.5) - s(x + 0.5, y - 0.5)
        const len = Math.hypot(gx, gy) || 1
        dx = (gx / len) * mag
        dy = (gy / len) * mag
        spec = Math.pow(t, 1.8)
      }
      d[i] = Math.round(128 + dx * 127)
      d[i + 1] = Math.round(128 + dy * 127)
      d[i + 2] = Math.round(spec * 255)
      d[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return c.toDataURL('image/png')
}

/* ---------------- Specchio del DOM ---------------- */

/** Pulisce un clone: niente id doppi, niente interazione. */
function preparaClone(el: HTMLElement) {
  el.removeAttribute('id')
  el.setAttribute('aria-hidden', 'true')
  el.setAttribute('inert', '')
  el.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'))
  // Le lenti dentro la copia non devono specchiare a loro volta.
  el.querySelectorAll('.lente').forEach(n => n.remove())
  el.querySelectorAll('video, iframe, canvas').forEach(n => n.remove())
}

export function Lente({
  fonte, raggio = 26, ottica, as: Tag = 'div', className = '', style, children, flessione = 0,
  chiave, ...resto
}: {
  /** Selettore dell'elemento da specchiare (quello che sta "dietro") */
  fonte: string
  raggio?: number
  ottica?: Ottica
  as?: ElementType
  className?: string
  style?: CSSProperties
  children?: ReactNode
  /** Extra di forza momentaneo (0–1): il vetro "flette" */
  flessione?: number
  /** Cambiarla forza il riaggancio della fonte (es. cambio schermata) */
  chiave?: string
  [k: string]: unknown
}) {
  const o = { ...DEF, ...ottica }
  const id = useId().replace(/:/g, '')
  const guscio = useRef<HTMLElement>(null)
  const specchio = useRef<HTMLDivElement>(null)
  const [dim, setDim] = useState({ w: 0, h: 0 })
  const bleed = Math.ceil(o.forza + 4)

  // Misura del guscio: la mappa dipende dalle dimensioni esatte.
  useLayoutEffect(() => {
    const el = guscio.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect
      setDim(p => (Math.abs(p.w - width) < 0.5 && Math.abs(p.h - height) < 0.5 ? p : { w: width, h: height }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)
  const mappa = useMemo(
    () => (dim.w > 0 && dim.h > 0
      ? generaMappa(dim.w + 2 * bleed, dim.h + 2 * bleed, raggio, bleed, o.labbro, o.curva, dpr)
      : null),
    [dim.w, dim.h, raggio, bleed, o.labbro, o.curva, dpr],
  )

  // Copia viva della fonte + allineamento a ogni scroll.
  // La fonte può essere sostituita (cambio di schermata, hot reload):
  // si riaggancia da sola quando l'elemento sotto il selettore cambia.
  useEffect(() => {
    const box = specchio.current
    const el = guscio.current
    if (!box || !el) return

    let src: HTMLElement | null = null
    let clone: HTMLElement | null = null
    let raf = 0
    let deb: number | undefined
    let mo: MutationObserver | null = null
    let antenati: HTMLElement[] = []

    const allinea = () => {
      raf = 0
      if (!clone || !src) return
      const s = src.getBoundingClientRect()
      const g = el.getBoundingClientRect()
      const st = src.scrollTop, sl = src.scrollLeft
      const tx = s.left - g.left + bleed - sl
      const ty = s.top - g.top + bleed - st
      clone.style.transform = `translate(${tx}px, ${ty}px)`
      clone.style.width = `${s.width}px`
      // Il riflesso scorre col contenuto: una luce che passa sul vetro
      el.style.setProperty('--luce-y', `${(-8 + ((st * 0.12) % 60)).toFixed(1)}%`)
    }
    const chiedi = () => { if (!raf) raf = requestAnimationFrame(allinea) }

    const rifai = () => {
      if (!src) return
      const nuovo = src.cloneNode(true) as HTMLElement
      preparaClone(nuovo)
      nuovo.className = `${nuovo.className} lente-clone`
      nuovo.style.cssText = 'position:absolute;top:0;left:0;margin:0;overflow:visible;height:auto;min-height:0;flex:none;pointer-events:none;user-select:none;will-change:transform;'
      if (clone) clone.replaceWith(nuovo); else box.appendChild(nuovo)
      clone = nuovo
      allinea()
    }
    const sgancia = () => {
      mo?.disconnect(); mo = null
      src?.removeEventListener('scroll', chiedi)
      antenati.forEach(p => p.removeEventListener('scroll', chiedi))
      antenati = []
      clone?.remove(); clone = null
      src = null
    }

    const aggancia = () => {
      const trovato = document.querySelector<HTMLElement>(fonte)
      if (trovato === src) return
      sgancia()
      if (!trovato) return
      src = trovato
      rifai()
      // Il DOM cambia (stato, hot reload): la copia si rifà con calma.
      // Le lenti dentro la fonte cambiano il proprio stile a ogni scroll:
      // quelle mutazioni non contano, altrimenti si riclona di continuo.
      mo = new MutationObserver(m => {
        if (m.every(x => x.type === 'attributes' && (x.target as HTMLElement).classList?.contains('lente'))) return
        window.clearTimeout(deb)
        deb = window.setTimeout(rifai, 120)
      })
      mo.observe(src, { childList: true, subtree: true, attributes: true, characterData: true })
      src.addEventListener('scroll', chiedi, { passive: true })
      // Anche gli antenati scorrevoli della fonte spostano la fonte.
      for (let p = src.parentElement; p; p = p.parentElement) {
        if (/(auto|scroll)/.test(getComputedStyle(p).overflowY)) { antenati.push(p); p.addEventListener('scroll', chiedi, { passive: true }) }
      }
    }

    aggancia()
    window.addEventListener('resize', chiedi)
    // Rete di sicurezza: fonte sostituita o layout asincrono.
    const iv = window.setInterval(() => { aggancia(); chiedi() }, 400)

    return () => {
      sgancia()
      window.removeEventListener('resize', chiedi)
      window.clearInterval(iv)
      window.clearTimeout(deb)
      cancelAnimationFrame(raf)
    }
  }, [fonte, bleed, dim.w, dim.h, chiave])

  const S = o.forza * dpr * (1 + flessione * 0.9)
  const disp = o.dispersione

  return (
    <Tag
      ref={guscio}
      className={`lente ${className}`}
      style={{ ...style, borderRadius: raggio, ['--lente-r' as string]: `${raggio}px` }}
      {...resto}
    >
      {mappa && (
        <svg className="lente-svg" aria-hidden="true" focusable="false">
          <filter id={`lente-${id}`} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feImage href={mappa} preserveAspectRatio="none" result="mappa" />
            <feDisplacementMap in="SourceGraphic" in2="mappa" scale={S * (1 + disp)} xChannelSelector="R" yChannelSelector="G" result="pr" />
            <feColorMatrix in="pr" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="cr" />
            <feDisplacementMap in="SourceGraphic" in2="mappa" scale={S} xChannelSelector="R" yChannelSelector="G" result="pg" />
            <feColorMatrix in="pg" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="cg" />
            <feDisplacementMap in="SourceGraphic" in2="mappa" scale={S * (1 - disp)} xChannelSelector="R" yChannelSelector="G" result="pb" />
            <feColorMatrix in="pb" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="cb" />
            <feBlend in="cr" in2="cg" mode="screen" result="rg" />
            <feBlend in="rg" in2="cb" mode="screen" result="rgb" />
            <feGaussianBlur in="rgb" stdDeviation={o.gelo * dpr * 0.5} result="gelo" />
            <feColorMatrix in="gelo" type="saturate" values={String(o.saturazione)} result="sat" />
            {/* Riflesso dal canale B della mappa */}
            <feColorMatrix in="mappa" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0.55 0 0" result="lucine" />
            <feBlend in="sat" in2="lucine" mode="screen" />
          </filter>
        </svg>
      )}
      <span className="lente-clip">
        <span
          className="lente-filtro"
          style={{
            inset: -bleed,
            filter: mappa ? `url(#lente-${id})` : `blur(${o.gelo}px) saturate(${o.saturazione})`,
          }}
        >
          <div className="lente-specchio" ref={specchio} />
        </span>
      </span>
      <span className="lente-velo" />
      <span className="lente-bordo" />
      <span className="lente-luce" />
      <span className="lente-dentro">{children}</span>
    </Tag>
  )
}
