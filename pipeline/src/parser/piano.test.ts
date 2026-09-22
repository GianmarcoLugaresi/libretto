// @vitest-environment node
/* ============================================================
   Parser del piano, provato sulla pagina vera di Design 33426.
   ============================================================ */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { estraiPiano, pianoPubblicabile } from './piano'
import { Piano } from '../tipi'

const html = readFileSync(fileURLToPath(new URL('../../fixture/design-piano.html', import.meta.url)), 'utf8')
const p = estraiPiano(html, '33426')
const trova = (nome: string) => p.insegnamenti.find(i => i.nome.toUpperCase().includes(nome.toUpperCase()))!

describe('coorti', () => {
  it('le legge dal selettore, col codice corso di ciascuna', () => {
    expect(p.coorti).toEqual([
      { anno: 2026, etichetta: '2026/2027', codiceCorso: '33426' },
      { anno: 2025, etichetta: '2025/2026', codiceCorso: '33426' },
      { anno: 2024, etichetta: '2024/2025', codiceCorso: '31807' },
    ])
  })

  it('il codice corso cambia fra coorti: 2024/25 è 31807', () => {
    expect(p.coorti.find(c => c.anno === 2024)!.codiceCorso).toBe('31807')
    expect(p.coorti.find(c => c.anno === 2026)!.codiceCorso).toBe('33426')
  })

  it('prende la coorte selezionata nella pagina', () => {
    expect(p.coorte).toBe(2026)
    expect(p.codiceCorso).toBe('33426')
    expect(p.nomeCorso).toBe('Design')
  })
})

describe('insegnamenti', () => {
  it('legge codice, nome, anno, semestre, CFU e SSD', () => {
    const m = trova('ISTITUZIONI DI MATEMATICA')
    expect(m).toMatchObject({
      codice: '10622515', anno: 1, semestre: 1, cfu: 6,
      ssd: 'MATH-03/A', tipo: 'graded',
    })
    expect(m.pagina).toContain('/attendance/lesson/')
  })

  it('non duplica: le tabelle dei gruppi ripetono gli stessi esami', () => {
    const codici = p.insegnamenti.map(i => i.codice)
    expect(new Set(codici).size).toBe(codici.length)
  })

  it('i CFU totali tornano con quelli dichiarati dal corso', () => {
    // 180 CFU: il piano completo senza doppi conteggi
    const totale = p.insegnamenti.reduce((n, i) => n + i.cfu, 0)
    // i gruppi opzionali offrono più scelte dei CFU richiesti:
    // si conta una sola alternativa per gruppo
    const senzaGruppi = p.insegnamenti.filter(i => !i.gruppo).reduce((n, i) => n + i.cfu, 0)
    const daiGruppi = p.gruppi.reduce((n, g) => n + (g.cfuRichiesti ?? 0), 0)
    expect(senzaGruppi + daiGruppi).toBe(180)
    expect(totale).toBeGreaterThan(180)   // perché elenca tutte le alternative
  })
})

describe('corsi integrati e moduli', () => {
  it('i moduli stanno sotto il padre, senza codice proprio', () => {
    const f = trova('FONDAMENTI DI DISEGNO')
    expect(f.codice).toBe('10622516')
    expect(f.cfu).toBe(12)
    expect(f.moduli.map(m => m.nome)).toEqual(['GEOMETRIA DESCRITTIVA', 'DISEGNO DIGITALE'])
    expect(f.moduli.every(m => m.cfu === 6)).toBe(true)
  })

  it('i CFU dei moduli non si sommano a quelli del padre', () => {
    const f = trova('FONDAMENTI DI DISEGNO')
    const sommaModuli = f.moduli.reduce((n, m) => n + m.cfu, 0)
    expect(sommaModuli).toBe(f.cfu)          // coincidono, ma...
    // ...il modulo non compare fra gli insegnamenti: il voto è del padre
    expect(p.insegnamenti.some(i => i.nome === 'GEOMETRIA DESCRITTIVA')).toBe(false)
  })

  it('riconosce anche i moduli di un integrato dentro un gruppo opzionale', () => {
    // cercato per codice: nel nome la fonte ha un refuso ("PER LEXHIBIT")
    const l = p.insegnamenti.find(i => i.codice === '10606454')!
    expect(l.cfu).toBe(12)
    expect(l.moduli).toHaveLength(2)
    expect(l.gruppo).toBe('1° gruppo opzionale')
  })

  it('non raddoppia i moduli di chi compare due volte in pagina', () => {
    // ogni integrato del piano Design ha esattamente due moduli
    for (const i of p.insegnamenti.filter(x => x.moduli.length)) {
      expect(i.moduli).toHaveLength(2)
      expect(new Set(i.moduli.map(m => m.nome)).size).toBe(2)
    }
  })

  it('riporta i nomi come li scrive la fonte, refusi compresi', () => {
    // "PER LEXHIBIT" è scritto così nel catalogo: correggerlo qui
    // vorrebbe dire non ritrovarlo più quando la fonte lo sistema
    expect(p.insegnamenti.find(i => i.codice === '10606454')!.nome).toContain('LEXHIBIT')
  })
})

describe('gruppi opzionali', () => {
  it('legge nome, CFU richiesti e alternative', () => {
    expect(p.gruppi).toHaveLength(2)
    for (const g of p.gruppi) {
      expect(g.cfuRichiesti).toBe(12)
      expect(g.codici.length).toBe(3)       // tre alternative per gruppo
    }
  })

  it('segna il gruppo sugli insegnamenti che ne fanno parte', () => {
    expect(trova('DESIGN DELL\'ESPERIENZA').gruppo).toBe('2° gruppo opzionale')
    expect(trova('ISTITUZIONI DI MATEMATICA').gruppo).toBeUndefined()
  })
})

describe('attività senza voto', () => {
  it('le AAF sono idoneità, non esami con voto', () => {
    expect(trova('LINGUA INGLESE')).toMatchObject({ codice: 'AAF1101', tipo: 'pass_fail' })
    expect(trova('PROVA FINALE')).toMatchObject({ codice: 'AAF1008', tipo: 'pass_fail' })
    expect(trova('ALTRE CONOSCENZE')).toMatchObject({ codice: 'AAF1154', tipo: 'pass_fail' })
  })

  it('"a scelta dello studente" non è un esame e ha comunque una chiave', () => {
    const s = trova('A SCELTA DELLO STUDENTE')
    expect(s.tipo).toBe('other')
    expect(s.codice).toBeTruthy()
    expect(s.cfu).toBe(12)
  })
})

describe('validazione', () => {
  it('il file pubblicabile passa lo schema', () => {
    const file = pianoPubblicabile(p, 'https://corsidilaurea.uniroma1.it/it/course/33426/attendance/lessons-plan')
    expect(() => Piano.parse(file)).not.toThrow()
  })
})

describe('robustezza', () => {
  it('una pagina vuota non fa esplodere il parser', () => {
    const vuoto = estraiPiano('<html><body></body></html>')
    expect(vuoto.insegnamenti).toEqual([])
    expect(vuoto.gruppi).toEqual([])
  })

  it('una tabella senza celle utili viene ignorata', () => {
    const strano = estraiPiano('<table><tr><td>solo una cella</td></tr></table>')
    expect(strano.insegnamenti).toEqual([])
  })
})
