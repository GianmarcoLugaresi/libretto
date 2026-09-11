/* ============================================================
   Genera le icone dell'app senza dipendenze: disegno vettoriale
   rasterizzato a mano e scritto in PNG con zlib.
   Il segno è l'anello di avanzamento CFU, lo stesso della home.
   ============================================================ */

import zlib from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const QUI = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(QUI, '..', 'public')

const BORDEAUX = [0x83, 0x08, 0x2a]   // PANTONE 202, rosso Sapienza
const CARTA     = [0xfa, 0xf8, 0xf4]
const ORO       = [0xd8, 0xb0, 0x6a]

/* ---------- PNG ---------- */

const TAB_CRC = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = TAB_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(tipo, dati) {
  const len = Buffer.alloc(4); len.writeUInt32BE(dati.length)
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dati])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(corpo))
  return Buffer.concat([len, corpo, crc])
}

function scriviPng(file, w, h, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8      // 8 bit per canale
  ihdr[9] = 6      // RGBA
  // Ogni riga va preceduta dal byte di filtro: qui sempre 0.
  const grezzo = Buffer.alloc(h * (w * 4 + 1))
  for (let y = 0; y < h; y++) {
    grezzo[y * (w * 4 + 1)] = 0
    rgba.copy(grezzo, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  }
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(grezzo, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]))
}

/* ---------- Disegno ---------- */

/** Rasterizza a 4× e riduce: è il modo più corto per avere bordi
 *  puliti senza scrivere un antialias vero. */
const SS = 4

function disegna(size, { padding = 0 } = {}) {
  const S = size * SS
  const px = Buffer.alloc(S * S * 4)

  const cx = S / 2, cy = S / 2
  const scala = 1 - padding                    // rientro per l'icona mascherabile
  const rEst = S * 0.315 * scala
  const spess = S * 0.088 * scala
  const rInt = rEst - spess
  const rMed = (rEst + rInt) / 2
  const sweep = Math.PI * 2 * 0.72             // 72% di anello
  const inizio = -Math.PI / 2

  // Estremi arrotondati dell'arco
  const capA = [cx + rMed * Math.cos(inizio), cy + rMed * Math.sin(inizio)]
  const capB = [cx + rMed * Math.cos(inizio + sweep), cy + rMed * Math.sin(inizio + sweep)]

  // Pallino d'oro: il "punto a cui sei arrivato"
  const dot = [cx + rMed * Math.cos(inizio + sweep), cy + rMed * Math.sin(inizio + sweep)]
  const rDot = spess * 0.30

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4
      let col = BORDEAUX

      const dx = x - cx + 0.5, dy = y - cy + 0.5
      const d = Math.hypot(dx, dy)

      let dentro = false
      if (d >= rInt && d <= rEst) {
        // angolo orario a partire dall'alto
        let t = Math.atan2(dy, dx) - inizio
        while (t < 0) t += Math.PI * 2
        if (t <= sweep) dentro = true
      }
      if (!dentro) {
        if (Math.hypot(x - capA[0], y - capA[1]) <= spess / 2) dentro = true
        else if (Math.hypot(x - capB[0], y - capB[1]) <= spess / 2) dentro = true
      }
      if (dentro) col = CARTA
      if (Math.hypot(x - dot[0], y - dot[1]) <= rDot) col = ORO

      px[i] = col[0]; px[i + 1] = col[1]; px[i + 2] = col[2]; px[i + 3] = 255
    }
  }

  // Riduzione a media dei blocchi SS×SS
  const out = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * S + (x * SS + sx)) * 4
          r += px[i]; g += px[i + 1]; b += px[i + 2]
        }
      }
      const n = SS * SS, o = (y * size + x) * 4
      out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n)
      out[o + 2] = Math.round(b / n); out[o + 3] = 255
    }
  }
  return out
}

fs.mkdirSync(OUT, { recursive: true })
for (const size of [180, 192, 512]) {
  scriviPng(path.join(OUT, `icona-${size}.png`), size, size, disegna(size))
  console.log(`icona-${size}.png`)
}
// Icona dell'app iOS: 1024 a tutto campo (gli angoli li arrotonda iOS).
{
  const ios = path.join(QUI, '..', 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset', 'AppIcon-512@2x.png')
  if (fs.existsSync(path.dirname(ios))) { scriviPng(ios, 1024, 1024, disegna(1024)); console.log('AppIcon 1024 (iOS)') }
}
// La mascherabile perde gli angoli: il segno sta nel 66% centrale.
scriviPng(path.join(OUT, 'icona-maskable-512.png'), 512, 512, disegna(512, { padding: 0.34 }))
console.log('icona-maskable-512.png')
