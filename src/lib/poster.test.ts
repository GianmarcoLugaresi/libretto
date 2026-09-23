import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { FUOCHI, fuocoDi, immaginePer, immagineLibera } from './poster'

const CARTELLA = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'poster')
const nome = (url: string) => /\/poster\/([a-z0-9-]+)\.jpg$/.exec(url)![1]

/** Larghezza e altezza di un JPEG, dal segmento SOF. */
function misure(file: string): [number, number] {
  const b = readFileSync(file)
  let i = 2
  while (i < b.length) {
    const m = b[i + 1], lung = b.readUInt16BE(i + 2)
    if (m >= 0xc0 && m <= 0xc3) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)]
    i += 2 + lung
  }
  throw new Error(`${file}: misure non trovate`)
}

describe('immagini del poster', () => {
  it('ogni immagine che la home può scegliere esiste', () => {
    const nomi = ['Disegno', 'Ergonomia', 'Storia dell\'arte', 'Informatica', 'Tirocinio', 'Fisica', 'Biologia']
    const urls = [
      ...nomi.flatMap(n => [0, 1, 2, 3].map(g => immaginePer(n, g))),
      ...[0, 1, 2, 3].map(g => immagineLibera(g)),
    ]
    for (const u of urls) expect(existsSync(join(CARTELLA, `${nome(u)}.jpg`)), u).toBe(true)
  })

  it('ogni immagine è abbastanza grande da riempire il riquadro senza sfocare', () => {
    // Il riquadro è circa 393×460 punti: di un'opera orizzontale conta
    // l'altezza, di una verticale la larghezza, e serve almeno un pixel
    // dell'immagine per punto.
    for (const f of readdirSync(CARTELLA).filter(f => f.endsWith('.jpg'))) {
      const [w, h] = misure(join(CARTELLA, f))
      expect(w / h > 393 / 460 ? h : w, f).toBeGreaterThanOrEqual(460)
    }
  })
})

describe('fuocoDi', () => {
  it('dà il taglio scelto per un\'opera, a prescindere dalla base dell\'URL', () => {
    expect(fuocoDi('/poster/piranesi-piazza-del-popolo.jpg')).toBe('38% 30%')
    expect(fuocoDi('/AppSapienza/poster/leonardo-vitruviano.jpg')).toBe('50% 10%')
  })

  it('per un\'opera senza taglio proprio, o un\'immagine dello studente, lascia il default', () => {
    expect(fuocoDi('/poster/morris-tulip-willow.jpg')).toBeUndefined()
    expect(fuocoDi('https://esempio.it/mia-foto.jpg')).toBeUndefined()
  })

  it('ogni taglio si riferisce a un\'immagine che c\'è: un refuso non passa in silenzio', () => {
    const presenti = new Set(readdirSync(CARTELLA).filter(f => f.endsWith('.jpg')).map(f => f.slice(0, -4)))
    for (const n of Object.keys(FUOCHI)) expect(presenti.has(n), n).toBe(true)
  })
})
