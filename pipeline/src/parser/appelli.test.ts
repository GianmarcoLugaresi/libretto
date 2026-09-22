// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { estraiAppelli, soloCoorte, dataItaliana, normalizzaNome, appelliPubblicabili } from './appelli'
import { Appelli } from '../tipi'

const html = readFileSync(fileURLToPath(new URL('../../fixture/design-appelli.html', import.meta.url)), 'utf8')
const e = estraiAppelli(html)

describe('date', () => {
  it('converte il formato italiano in ISO', () => {
    expect(dataItaliana('05/11/2027')).toBe('2027-11-05')
    expect(dataItaliana('5/2/2027')).toBe('2027-02-05')
  })

  it('rifiuta le date che non esistono, invece di pubblicarle', () => {
    expect(dataItaliana('31/02/2027')).toBeNull()
    expect(dataItaliana('')).toBeNull()
    expect(dataItaliana('prossimamente')).toBeNull()
    expect(dataItaliana('2027-11-05')).toBeNull()
  })
})

describe('estrazione', () => {
  it('legge gli appelli con codice, nome, date e docenti', () => {
    expect(e.appelli.length).toBeGreaterThan(50)
    const a = e.appelli[0]
    expect(a.codice).toBeTruthy()
    expect(a.nome).toBeTruthy()
    expect(a.data).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('trova gli appelli di un insegnamento noto', () => {
    const sm = e.appelli.filter(a => a.nome.includes('SCIENZA DEI MATERIALI'))
    expect(sm.length).toBeGreaterThan(0)
    expect(sm.some(a => a.docenti.includes('MARRA FRANCESCO'))).toBe(true)
    const uno = sm.find(a => a.data === '2027-11-05')!
    expect(uno.prenotazioniDal).toBe('2027-05-31')
    expect(uno.prenotazioniAl).toBe('2027-10-31')
  })

  it('la pagina mescola più coorti: le vede entrambe', () => {
    expect(e.codiciCorso).toContain('33426')
    expect(e.codiciCorso).toContain('31807')
  })

  it('non restano date non valide fra i risultati', () => {
    for (const a of e.appelli) expect(a.data).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('deduplica', () => {
  it('lo stesso appello con più docenti diventa una riga sola', () => {
    for (const a of e.appelli) {
      expect(new Set(a.docenti).size).toBe(a.docenti.length)
    }
    const chiavi = e.appelli.map(a => `${a.codice}|${a.codiceCorso}|${a.data}`)
    expect(new Set(chiavi).size).toBe(chiavi.length)
  })

  it('almeno un appello ha più docenti uniti', () => {
    expect(e.appelli.some(a => a.docenti.length > 1)).toBe(true)
  })
})

describe('filtro per coorte', () => {
  it('toglie gli appelli di un altro ordinamento', () => {
    const soli = soloCoorte(e.appelli, '33426')
    expect(soli.length).toBeLessThan(e.appelli.length)
    expect(soli.every(a => !a.codiceCorso || a.codiceCorso === '33426')).toBe(true)
    expect(soli.some(a => a.codiceCorso === '31807')).toBe(false)
  })
})

describe('alias fra ordinamenti', () => {
  it('riconosce lo stesso esame sotto codici diversi', () => {
    // Istituzioni di matematica compare come 1026553 e 10622515
    const nomi = new Map<string, Set<string>>()
    for (const a of e.appelli) {
      const n = normalizzaNome(a.nome)
      if (!nomi.has(n)) nomi.set(n, new Set())
      nomi.get(n)!.add(a.codice)
    }
    const doppi = [...nomi.entries()].filter(([, c]) => c.size > 1)
    expect(doppi.length).toBeGreaterThan(0)
    expect(Object.keys(e.alias).length).toBeGreaterThan(0)
  })

  it('ogni alias punta a un codice che esiste davvero', () => {
    const esistenti = new Set(e.appelli.map(a => a.codice))
    for (const [da, a] of Object.entries(e.alias)) {
      expect(esistenti.has(da)).toBe(true)
      expect(esistenti.has(a)).toBe(true)
      expect(da).not.toBe(a)
    }
  })

  it('gli alias non formano catene: puntano tutti al canonico', () => {
    for (const a of Object.values(e.alias)) expect(e.alias[a]).toBeUndefined()
  })
})

describe('validazione', () => {
  it('il file pubblicabile passa lo schema', () => {
    const f = appelliPubblicabili(e, '33426', 'https://corsidilaurea.uniroma1.it/it/course/33426/attendance/exams')
    expect(() => Appelli.parse(f)).not.toThrow()
  })
})

describe('robustezza', () => {
  it('una pagina vuota non produce appelli né errori', () => {
    const v = estraiAppelli('<html></html>')
    expect(v.appelli).toEqual([])
    expect(v.alias).toEqual({})
  })

  it('una riga senza data valida viene contata fra le scartate', () => {
    const p = estraiAppelli(`
      <fieldset class="panel"><legend class="panel-heading">
        <a class="panel-title">999 | ESAME FINTO</a></legend>
        <table><tbody>
          <tr><td>33426</td><td>ROSSI</td><td>01/01/2027</td><td>02/01/2027</td><td>da definire</td></tr>
          <tr><td>33426</td><td>ROSSI</td><td>01/01/2027</td><td>02/01/2027</td><td>10/01/2027</td></tr>
        </tbody></table></fieldset>`)
    expect(p.appelli).toHaveLength(1)
    expect(p.scartate).toBe(1)
  })
})
