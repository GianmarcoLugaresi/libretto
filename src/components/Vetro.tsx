/* ============================================================
   Vetro — replica in React del LiquidGlass.vue di Aiutly.

   Il materiale è riempimento translucido + sfocatura di ciò che sta
   dietro + bordo speculare (che è quel che fa leggere lo spessore).
   La rifrazione sul bordo si ottiene solo con backdrop-filter:
   url(#filtro) e feDisplacementMap: la disegna Chromium; WebKit la
   ignora (bug 245510), quindi su iPhone resta la versione sfocata.
   Non è una nostra semplificazione: in WebKit oggi quella rifrazione
   non esiste.

   Risposta al tocco, come il vetro di Apple: sotto il dito il pannello
   si ingrandisce di un soffio, il riflesso si accende nel punto
   premuto, e se il dito scorre tenendo premuto il vetro si lascia
   tirare e si allunga nella direzione del trascinamento, tornando a
   posto al rilascio.
   ============================================================ */

import { forwardRef, useId, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ElementType, HTMLAttributes, PointerEvent as RPointerEvent, ReactNode } from 'react'

/* Mappa di spostamento: il rosso muove in orizzontale, il verde in
   verticale, 128 vuol dire "fermo". Due rampe che restano a 128 al
   centro e scattano solo sugli ultimi pixel: il vetro piega il bordo
   e lascia intatto il centro, come una lente. */
function rampa(verticale: boolean): string {
  const [x2, y2] = verticale ? [0, 1] : [1, 0]
  const [alto, medio] = verticale ? ['#00ff00', '#008000'] : ['#ff0000', '#800000']
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">` +
    `<linearGradient id="g" x1="0" y1="0" x2="${x2}" y2="${y2}">` +
    `<stop offset="0" stop-color="${alto}"/>` +
    `<stop offset="0.22" stop-color="${medio}"/>` +
    `<stop offset="0.78" stop-color="${medio}"/>` +
    `<stop offset="1" stop-color="#000000"/>` +
    `</linearGradient>` +
    `<rect width="100" height="100" fill="url(%23g)"/></svg>`,
  )}`
}

/* CSS.supports() da solo non basta: WebKit risponde di sì e poi non
   disegna niente, e a quel punto perderemmo anche la sfocatura.
   `chrome` in window c'è su Chrome, Edge e la WebView di Android:
   esattamente dove la rifrazione funziona davvero. */
const PUO_RIFRANGERE =
  typeof window !== 'undefined' &&
  'chrome' in window &&
  typeof CSS !== 'undefined' &&
  CSS.supports('backdrop-filter', 'url(#a)')

/** Oltre questa distanza il vetro non si lascia tirare */
const LIMITE = 28
const entro = (v: number) => Math.max(-LIMITE, Math.min(LIMITE, v))

/** C'è una lista che scorre sopra di noi? Allora un gesto verticale è
 *  suo, non nostro. */
function dentroUnoScorrimento(el: HTMLElement): boolean {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY
    if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) return true
  }
  return false
}

export interface VetroProps extends Omit<HTMLAttributes<HTMLElement>, 'style' | 'onPointerDown' | 'children'> {
  as?: ElementType
  /** Raggio degli angoli: 22 per le card, 17 per le pillole */
  raggio?: number
  /** Quanto sfocare ciò che sta dietro */
  sfoco?: number
  /** Riempimento translucido; di base quello del tema */
  tinta?: string
  /** Rifrazione sul bordo (solo dove il browser la disegna) */
  rifrangi?: boolean
  /** Di quanti pixel piegare il bordo */
  forza?: number
  /** Risponde al tocco: si ingrandisce, si accende, si lascia tirare */
  interattivo?: boolean
  style?: CSSProperties
  children?: ReactNode
  onPointerDown?: (e: RPointerEvent<HTMLElement>) => void
  [k: `data-${string}`]: string | undefined
}

export const Vetro = forwardRef<HTMLElement, VetroProps>(function Vetro({
  as: Tag = 'div', raggio = 22, sfoco = 14, tinta, rifrangi = true, forza = 40,
  interattivo = false, className = '', style, children, onPointerDown, ...resto
}, refEsterno) {
  const id = `vetro-${useId().replace(/:/g, '')}`
  const root = useRef<HTMLElement>(null)
  useImperativeHandle(refEsterno, () => root.current as HTMLElement)
  const [premuto, setPremuto] = useState(false)
  const [tirato, setTirato] = useState(false)
  const [punto, setPunto] = useState({ x: 0, y: 0 })
  const [tiro, setTiro] = useState({ x: 0, y: 0 })
  const da = useRef({ x: 0, y: 0 })
  const cede = useRef(false)

  const puoRifrangere = rifrangi && PUO_RIFRANGERE
  const mappe = useMemo(() => [rampa(false), rampa(true)], [])

  const giu = (e: RPointerEvent<HTMLElement>) => {
    onPointerDown?.(e)
    if (!interattivo || !root.current) return
    cede.current = dentroUnoScorrimento(root.current)
    const r = root.current.getBoundingClientRect()
    da.current = { x: e.clientX, y: e.clientY }
    setPunto({ x: e.clientX - r.left, y: e.clientY - r.top })
    setTiro({ x: 0, y: 0 })
    setPremuto(true)
    setTirato(false)
    /* Niente setPointerCapture: incollando gli eventi al vetro, la lista
       che scorre non riuscirebbe più a prendersi il gesto. Senza cattura
       lo scorrimento vince da solo e arriva pointercancel. */
  }

  const su = () => { setPremuto(false); setTirato(false); setTiro({ x: 0, y: 0 }) }

  const muovi = (e: RPointerEvent<HTMLElement>) => {
    if (!premuto || !root.current) return
    const dx = e.clientX - da.current.x
    const dy = e.clientY - da.current.y
    // Dentro una lista: un gesto verticale è della lista, le restituiamo il dito.
    if (cede.current && !tirato && Math.abs(dy) > 5 && Math.abs(dy) > Math.abs(dx)) { su(); return }
    const r = root.current.getBoundingClientRect()
    setPunto({ x: e.clientX - r.left, y: e.clientY - r.top })
    const t = { x: entro(dx), y: entro(dy) }
    setTiro(t)
    if (!tirato && Math.hypot(t.x, t.y) > 2) setTirato(true)
  }

  // Segue il dito con resistenza, si allunga sull'asse del tiro e cede sull'altro.
  const fx = Math.abs(tiro.x) / LIMITE, fy = Math.abs(tiro.y) / LIMITE
  const s = premuto ? 1.035 : 1
  const trasforma = premuto
    ? `translate(${tiro.x * 0.24}px, ${tiro.y * 0.24}px) scale(${(s * (1 + fx * 0.05 - fy * 0.02)).toFixed(4)}, ${(s * (1 + fy * 0.05 - fx * 0.02)).toFixed(4)})`
    : 'translate(0px, 0px) scale(1, 1)'

  const stile: CSSProperties = {
    ...style,
    ['--r' as string]: `${raggio}px`,
    ['--tint' as string]: tinta ?? 'var(--glass-tint)',
    ['--bf' as string]: `blur(${sfoco}px) saturate(180%)${puoRifrangere ? ` url(#${id})` : ''}`,
    ['--px' as string]: `${punto.x}px`,
    ['--py' as string]: `${punto.y}px`,
    ['--pr' as string]: premuto ? '1' : '0',
    ...(interattivo ? { transform: trasforma } : {}),
  }

  return (
    <Tag
      ref={root}
      className={`vetro${interattivo ? ' vetro-tocco' : ''} ${className}`}
      data-tirato={tirato ? '' : undefined}
      style={stile}
      onPointerDown={giu}
      onPointerMove={interattivo ? muovi : undefined}
      onPointerUp={interattivo ? su : undefined}
      onPointerCancel={interattivo ? su : undefined}
      onPointerLeave={interattivo ? su : undefined}
      {...resto}
    >
      {/* il filtro vive qui dentro così ogni vetro ha il suo */}
      {puoRifrangere && (
        <svg className="vetro-svg" aria-hidden="true" focusable="false">
          <filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feImage href={mappe[0]} result="rx" preserveAspectRatio="none" />
            <feImage href={mappe[1]} result="ry" preserveAspectRatio="none" />
            <feBlend in="rx" in2="ry" mode="screen" result="map" />
            <feDisplacementMap in="SourceGraphic" in2="map" scale={forza} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>
      )}
      {children}
    </Tag>
  )
})
