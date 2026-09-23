import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { FUOCHI, fuocoDi, immaginePer, immagineLibera } from './poster'

const CARTELLA = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'poster')
const nome = (url: string) => /\/poster\/([a-z0-9-]+)\.jpg$/.exec(url)![1]

describe('immagini del poster', () => {
  it('ogni immagine che la home può scegliere esiste', () => {
    const nomi = ['Disegno', 'Ergonomia', 'Storia dell\'arte', 'Informatica', 'Tirocinio', 'Fisica', 'Biologia']
    const urls = [
      ...nomi.flatMap(n => [0, 1, 2, 3].map(g => immaginePer(n, g))),
      ...[0, 1, 2, 3].map(g => immagineLibera(g)),
    ]
    for (const u of urls) expect(existsSync(join(CARTELLA, `${nome(u)}.jpg`)), u).toBe(true)
  })
})

describe('fuocoDi', () => {
  it('dà il taglio scelto per un\'opera, a prescindere dalla base dell\'URL', () => {
    expect(fuocoDi('/poster/piranesi-piazza-del-popolo.jpg')).toBe('42% 30%')
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
