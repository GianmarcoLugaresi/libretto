// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { estraiIndice, indicePubblicabile } from './indice'
import { Indice } from '../tipi'

const html = readFileSync(fileURLToPath(new URL('../../fixture/catalogo-indice.html', import.meta.url)), 'utf8')
const e = estraiIndice(html)

describe('indice', () => {
  it('trova tutti i corsi in una pagina sola', () => {
    expect(e.corsi.length).toBeGreaterThan(250)
  })

  it('legge codice, nome e classe', () => {
    const design = e.corsi.find(c => c.codice === '33426')!
    expect(design).toMatchObject({ codice: '33426', nome: 'Design', classe: 'L-4' })
  })

  it('la classe è una classe di laurea, non la modalità di accesso', () => {
    const conClasse = e.corsi.filter(c => c.classe)
    expect(conClasse.length).toBeGreaterThan(200)
    for (const c of conClasse) {
      expect(c.classe).toMatch(/^(L|LM|LMG)/)
      expect(c.classe).not.toMatch(/prova|accesso|libero/i)
    }
  })

  it('non duplica i corsi presenti in più aree', () => {
    const codici = e.corsi.map(c => c.codice)
    expect(new Set(codici).size).toBe(codici.length)
  })

  it('raccoglie le aree tematiche', () => {
    expect(Object.keys(e.aree).length).toBeGreaterThan(5)
    expect(e.aree['Architettura e design']).toBeGreaterThan(0)
  })

  it('li ordina per nome', () => {
    const nomi = e.corsi.map(c => c.nome)
    expect([...nomi].sort((a, b) => a.localeCompare(b, 'it'))).toEqual(nomi)
  })
})

describe('validazione', () => {
  it('il file pubblicabile passa lo schema', () => {
    const f = indicePubblicabile(e.corsi, 'https://corsidilaurea.uniroma1.it/it')
    expect(() => Indice.parse(f)).not.toThrow()
  })
})

describe('robustezza', () => {
  it('una pagina senza corsi non produce errori', () => {
    expect(estraiIndice('<html><body><p>niente</p></body></html>').corsi).toEqual([])
  })

  it('una card senza nome viene saltata', () => {
    const p = estraiIndice('<li class="corso-card"><a href="/it/course/999"></a></li>')
    expect(p.corsi).toEqual([])
  })
})
