/* ============================================================
   Poster generativo di un corso.
   Non abbiamo fotografie, quindi l'illustrazione la costruiamo:
   macchie di luce nella tinta del corso, un anello (lo stesso
   dell'icona), la sigla gigante in filigrana e una grana sopra
   tutto, che rende "fotografico" ciò che altrimenti sarebbe una
   sfumatura piatta. La composizione dipende solo dall'indice di
   tinta: lo stesso corso ha sempre lo stesso poster.
   ============================================================ */

import { useEffect, useState } from 'react'
import { TINTE } from '../lib/types'

export function Poster({ tinta, sigla, immagine }: {
  tinta: number | null
  sigla?: string
  /** Fotografia sotto le luci: viene gradata nel colore del corso */
  immagine?: string
}) {
  const i = tinta ?? 4
  // Se la foto non arriva (offline, URL rotto) resta il poster
  // generato: l'eroe non deve mai essere un buco nero.
  const [fotoOk, setFotoOk] = useState(false)
  useEffect(() => { setFotoOk(false) }, [immagine])
  const h = tinta == null ? 0 : TINTE[i % TINTE.length].h
  const sat = tinta == null ? '0%' : '88%'

  // Posizioni pseudo-casuali ma stabili per indice
  const ax = 12 + ((i * 37) % 46), ay = 18 + ((i * 53) % 34)
  const bx = 58 + ((i * 29) % 34), by = 38 + ((i * 71) % 36)
  const rx = 66 + ((i * 13) % 24), ry = 22 + ((i * 41) % 28)
  const inclina = -8 + ((i * 7) % 16)

  const luce = (dh: number, l: string, a: number) => `hsl(${h + dh} ${sat} ${l} / ${a})`

  return (
    <div className="poster" aria-hidden="true">
      {immagine && (
        <>
          <img
            className="poster-foto" src={immagine} alt="" decoding="async"
            data-ok={fotoOk}
            onLoad={() => setFotoOk(true)} onError={() => setFotoOk(false)}
          />
          {/* Gradazione: il colore del corso "tinge" la foto conservando
              le luci, come una color correction cinematografica */}
          <div className="poster-grado" data-ok={fotoOk} style={{ background: luce(0, '52%', 1) }} />
          <div className="poster-scuro" data-ok={fotoOk} />
        </>
      )}

      <div className="poster-luci" style={{
        background: [
          `radial-gradient(60% 55% at ${ax}% ${ay}%, ${luce(0, '60%', 1)} 0%, ${luce(0, '50%', 0)} 100%)`,
          `radial-gradient(55% 60% at ${bx}% ${by}%, ${luce(38, '62%', 0.78)} 0%, ${luce(38, '50%', 0)} 100%)`,
          `radial-gradient(90% 60% at 50% 100%, ${luce(-35, '42%', 0.55)} 0%, ${luce(-35, '40%', 0)} 100%)`,
          `radial-gradient(120% 80% at 100% 0%, ${luce(-60, '30%', 0.5)} 0%, transparent 70%)`,
          '#060607',
        ].join(', '),
      }} />

      {/* Sigla in filigrana: un elemento tipografico da manifesto,
          in fuga oltre il bordo */}
      {sigla && !(immagine && fotoOk) && (
        <span className="poster-sigla" style={{
          color: luce(0, '78%', 0.2),
          transform: `rotate(${inclina}deg)`,
        }}>{sigla}</span>
      )}

      <svg className="poster-anello" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice"
        style={{ opacity: immagine && fotoOk ? 0.45 : 1 }}>
        <circle cx={rx} cy={ry} r="34" fill="none" stroke={luce(0, '80%', 0.5)} strokeWidth="0.9" />
        <circle cx={rx} cy={ry} r="34" fill="none" stroke={luce(0, '90%', 0.9)} strokeWidth="1.6"
          strokeDasharray="153 214" strokeLinecap="round" transform={`rotate(-90 ${rx} ${ry})`} />
      </svg>

      {/* Grana: rumore monocromatico in soft-light, sparisce le bande */}
      <svg className="poster-grana">
        <filter id="grana-poster">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grana-poster)" />
      </svg>

      <div className="poster-velo" />
    </div>
  )
}
