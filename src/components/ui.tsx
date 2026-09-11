/* ============================================================
   Componenti condivisi.
   ============================================================ */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode, CSSProperties } from 'react'
import { Icona, type NomeIcona } from './Icona'
import { Vetro } from './Vetro'

/* ---------------- Guscio schermo ----------------
   Titolo grande che collassa allo scroll. La soglia è bassa
   apposta: il passaggio deve avvenire appena parti, non a
   metà pagina. */

export function Schermo({
  titolo, sottotitolo, azioni, children, sotto, indietro,
}: {
  titolo: string
  sottotitolo?: ReactNode
  azioni?: ReactNode
  /** Fascia agganciata sotto la barra (filtri, ricerca) */
  sotto?: ReactNode
  /** Se presente, la barra mostra il ritorno alla schermata precedente */
  indietro?: () => void
  children: ReactNode
}) {
  const [collassato, setCollassato] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setCollassato(el.scrollTop > 18))
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => { el.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf) }
  }, [])

  return (
    <>
      <div className="nav" data-collapsed={collassato}>
        <div className="nav-bar">
          {indietro && (
            <button className="nav-act" onClick={indietro} aria-label="Indietro" style={{ marginLeft: -8 }}>
              <Icona nome="indietro" size={21} peso={2.2} />
            </button>
          )}
          <span className="nav-compact grow truncate">{titolo}</span>
          <div className="row" style={{ gap: 2, marginLeft: 'auto' }}>{azioni}</div>
        </div>
        <div className="nav-large">
          <h1 className="display-m">{titolo}</h1>
          {sottotitolo && <div className="foot dimmer" style={{ marginTop: 3 }}>{sottotitolo}</div>}
        </div>
        {sotto && <div style={{ paddingBottom: 10 }}>{sotto}</div>}
      </div>
      <div className="scroll" ref={ref}>{children}</div>
    </>
  )
}

export function AzioneNav({ icona, onClick, etichetta }: {
  icona: NomeIcona; onClick: () => void; etichetta: string
}) {
  return (
    <Vetro as="button" className="nav-act" raggio={19} sfoco={14} forza={24} interattivo
      onClick={onClick} aria-label={etichetta}>
      <Icona nome={icona} size={21} />
    </Vetro>
  )
}

/* ---------------- Foglio modale ---------------- */

export function Foglio({
  aperto, chiudi, titolo, azione, children, piede,
}: {
  aperto: boolean
  chiudi: () => void
  titolo: string
  /** Pulsante a destra nell'intestazione */
  azione?: ReactNode
  piede?: ReactNode
  children: ReactNode
}) {
  // Blocca lo scroll dietro al foglio: su iOS senza questo la
  // pagina sottostante scorre sotto le dita.
  useEffect(() => {
    if (!aperto) return
    const prec = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') chiudi() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prec
      window.removeEventListener('keydown', onKey)
    }
  }, [aperto, chiudi])

  if (!aperto) return null
  return (
    <>
      <div className="backdrop" onClick={chiudi} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={titolo}>
        <div className="sheet-grab" />
        <div className="sheet-head">
          <button className="nav-act" onClick={chiudi} aria-label="Chiudi" style={{ marginLeft: -6 }}>
            <Icona nome="chiudi" size={20} />
          </button>
          <span className="headline grow truncate">{titolo}</span>
          {azione}
        </div>
        <div className="sheet-body">{children}</div>
        {piede && <div className="sheet-foot">{piede}</div>}
      </div>
    </>
  )
}

/* ---------------- Controllo segmentato ---------------- */

export function Segmentato<T extends string>({
  opzioni, valore, cambia,
}: {
  opzioni: { v: T; l: string }[]
  valore: T
  cambia: (v: T) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = useState<CSSProperties>({ opacity: 0 })
  const [liquido, setLiquido] = useState(false)
  const primo = useRef(true)

  useEffect(() => {
    if (primo.current) { primo.current = false; return }
    setLiquido(true)
    const id = window.setTimeout(() => setLiquido(false), 500)
    return () => window.clearTimeout(id)
  }, [valore])

  // Il cursore insegue il segmento attivo misurandolo dal DOM:
  // così regge etichette di lunghezza diversa.
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const misura = () => {
      const i = opzioni.findIndex(o => o.v === valore)
      const b = el.children[i + 1] as HTMLElement | undefined  // +1: il thumb è il primo figlio
      if (!b) return
      setThumb({ left: b.offsetLeft, width: b.offsetWidth, opacity: 1 })
    }
    misura()
    const ro = new ResizeObserver(misura)
    ro.observe(el)
    return () => ro.disconnect()
  }, [valore, opzioni])

  return (
    <div className="seg" ref={box} role="tablist">
      <div className={`seg-thumb${liquido ? ' is-liquido' : ''}`} style={thumb} />
      {opzioni.map(o => (
        <button
          key={o.v} role="tab" className="seg-item"
          aria-selected={o.v === valore}
          onClick={() => cambia(o.v)}
        >{o.l}</button>
      ))}
    </div>
  )
}

/* ---------------- Anello di avanzamento ---------------- */

export function Anello({
  valore, size = 132, spessore = 10, colore = 'var(--cta)', pista = 'var(--surface-2)', children,
}: {
  valore: number            // 0–1
  size?: number
  spessore?: number
  colore?: string
  pista?: string
  children?: ReactNode
}) {
  const r = (size - spessore) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, valore))
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={pista} strokeWidth={spessore} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colore}
          strokeWidth={spessore} strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.32,0.72,0,1)',
                   filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.35))' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>{children}</div>
    </div>
  )
}

/* ---------------- Stato vuoto ---------------- */

export function Vuoto({ icona, titolo, testo, azione }: {
  icona: NomeIcona; titolo: string; testo?: string; azione?: ReactNode
}) {
  return (
    <div className="empty">
      <div className="empty-ico"><Icona nome={icona} size={24} /></div>
      <div className="stack" style={{ gap: 4 }}>
        <div className="headline" style={{ color: 'var(--ink)' }}>{titolo}</div>
        {testo && <div className="sub" style={{ maxWidth: 280 }}>{testo}</div>}
      </div>
      {azione}
    </div>
  )
}

/* ---------------- Riga di lista ---------------- */

export function Riga({
  titolo, sotto, destra, icona, onClick, chevron, colore,
}: {
  titolo: ReactNode
  sotto?: ReactNode
  destra?: ReactNode
  icona?: ReactNode
  onClick?: () => void
  chevron?: boolean
  /** Barretta colorata a sinistra: lega la riga al suo corso */
  colore?: string
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className={`list-row${onClick ? ' is-tappable' : ''}`} onClick={onClick}>
      {colore && (
        <span style={{
          width: 3, alignSelf: 'stretch', borderRadius: 99,
          background: colore, flex: 'none', margin: '2px 0',
        }} />
      )}
      {icona}
      <div className="grow stack" style={{ gap: 1 }}>
        <div className="callout strong truncate" style={{ lineHeight: 1.35 }}>{titolo}</div>
        {sotto && <div className="foot dimmer truncate">{sotto}</div>}
      </div>
      {destra}
      {chevron && <Icona nome="chevron" size={17} peso={2.2} className="chev" />}
    </Tag>
  )
}

/* ---------------- Interruttore ---------------- */

export function Interruttore({ acceso, cambia, etichetta }: {
  acceso: boolean; cambia: (v: boolean) => void; etichetta: string
}) {
  return (
    <button
      className="switch" role="switch" aria-checked={acceso} aria-label={etichetta}
      onClick={() => cambia(!acceso)}
    >
      <span className="switch-knob" />
    </button>
  )
}

/* ---------------- Campo ---------------- */

export function Campo({ label, hint, children }: {
  label: string; hint?: string; children: ReactNode
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export function Selezione({ valore, cambia, opzioni }: {
  valore: string
  cambia: (v: string) => void
  opzioni: { v: string; l: string }[]
}) {
  return (
    <div className="select-wrap">
      <select className="input" value={valore} onChange={e => cambia(e.target.value)}>
        {opzioni.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
      <Icona nome="chevron-giu" size={16} peso={2} className="chev-abs" />
    </div>
  )
}

/* ---------------- Titolo di sezione ---------------- */

export function Sezione({ titolo, destra, children, stretto }: {
  titolo?: string; destra?: ReactNode; children: ReactNode; stretto?: boolean
}) {
  return (
    <section className="gut" style={{ marginTop: stretto ? 16 : 26 }}>
      {titolo && (
        <div className="list-hdr" style={{ paddingTop: 0 }}>
          <span className="eyebrow">{titolo}</span>
          {destra}
        </div>
      )}
      {children}
    </section>
  )
}
