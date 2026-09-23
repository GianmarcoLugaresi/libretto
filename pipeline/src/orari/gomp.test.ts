// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { leggiTitolo, aggrega, gompAdapter } from './gomp'

const dati = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../fixture/design-orario-2026-10.json', import.meta.url)), 'utf8'),
)
const e = aggrega(dati.events)

describe('lettura del titolo', () => {
  it('separa nome, docente, aula ed edificio', () => {
    const t = '<b>PROGETTAZIONE STRUTTURALE </b><p class="cal-teacher"><i class="fa fa-user"></i> <a href="/it/lecturer/x">EGIDIO LOFRANO</a></p><p class="cal-space"><i class="fa fa-location"></i> Aula F5  (RM068, Accessibile: Si)</a></p>'
    expect(leggiTitolo(t)).toEqual({
      nome: 'PROGETTAZIONE STRUTTURALE',
      docenti: ['EGIDIO LOFRANO'],
      aula: 'Aula F5',
      edificio: 'RM068',
    })
  })

  it('decodifica gli apostrofi della fonte', () => {
    const t = "<b>IMPRENDITORIALITA&#039; E SVILUPPO</b>"
    expect(leggiTitolo(t).nome).toBe("IMPRENDITORIALITA' E SVILUPPO")
  })

  it('regge un titolo senza docente né aula', () => {
    expect(leggiTitolo('<b>SOLO NOME</b>')).toEqual({ nome: 'SOLO NOME', docenti: [], aula: undefined, edificio: undefined })
  })
})

describe('aggregazione in fasce settimanali', () => {
  it('raggruppa le ricorrenze in una fascia sola', () => {
    const tutte = [...e.lezioni, ...e.nonAttribuite]
    expect(tutte.length).toBeLessThan(dati.events.length / 3)
    for (const l of tutte) {
      expect(l.giorno).toBeGreaterThanOrEqual(1)
      expect(l.giorno).toBeLessThanOrEqual(7)
      expect(l.inizio).toMatch(/^\d{2}:\d{2}$/)
    }
  })

  it('ricava il periodo di ogni fascia', () => {
    for (const l of [...e.lezioni, ...e.nonAttribuite]) {
      expect(l.dal).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(l.al! >= l.dal!).toBe(true)
    }
  })
})

describe('anno e canale: solo se la fonte li dichiara', () => {
  it('attribuisce solo le lezioni etichettate', () => {
    for (const l of e.lezioni) expect(l.anno).toBeDefined()
  })

  it('le lezioni senza etichetta restano non attribuite, non indovinate', () => {
    expect(e.nonAttribuite.length).toBeGreaterThan(0)
    for (const l of e.nonAttribuite) {
      expect(l.anno).toBeUndefined()
      expect(l.canale).toBeUndefined()
    }
  })

  it('riconosce i canali dichiarati', () => {
    const disegno = e.lezioni.filter(l => l.nome.includes('MODELLAZIONE DIGITALE'))
    expect(disegno.length).toBe(2)
    expect(disegno.map(l => l.canale).sort()).toEqual(['1º canale', '2º canale'])
    expect(disegno.every(l => l.anno === 2)).toBe(true)
  })

  it('non attribuisce Teoria e storia del design, che la fonte non etichetta', () => {
    // È l'errore già commesso una volta: dedurne l'anno aveva
    // mescolato secondo e primo anno.
    const t = e.nonAttribuite.find(l => l.nome.includes('TEORIA E STORIA DEL DESIGN'))
    expect(t).toBeDefined()
    expect(t!.anno).toBeUndefined()
  })
})

describe('giorni saltati', () => {
  it('nel solo ottobre non ci sono sospensioni', () => {
    for (const l of [...e.lezioni, ...e.nonAttribuite]) expect(l.saltate).toEqual([])
  })

  it('un buco in mezzo al periodo diventa una data saltata', () => {
    const ev = (d: string) => ({
      start: `${d}T09:00:00`, end: `${d}T11:00:00`,
      title: '<b>PROVA</b>', course_years: [1], partitions: ['1º canale'],
    })
    // tre martedì, il secondo manca
    const r = aggrega([ev('2026-10-06'), ev('2026-10-20')])
    expect(r.lezioni[0].saltate).toEqual(['2026-10-13'])
  })
})

describe('adattatore', () => {
  it('è attivo e vale per qualunque corso del catalogo', () => {
    const a = gompAdapter()
    expect(a.enabled).toBe(true)
    expect(a.supports('33426')).toBe(true)
    expect(a.id).toBe('gomp-catalogo')
  })
})

describe('periodo da chiedere al feed', () => {
  it('in autunno, il primo semestre: settembre-gennaio', async () => {
    const { periodoDiLezione } = await import('./gomp')
    expect(periodoDiLezione(new Date(2026, 8, 22))).toEqual({ dal: '2026-09-01', al: '2027-01-01', semestre: 1 })
  })

  it('a marzo, il secondo semestre di quest\'anno, non l\'autunno successivo', async () => {
    const { periodoDiLezione } = await import('./gomp')
    expect(periodoDiLezione(new Date(2027, 2, 10))).toEqual({ dal: '2027-02-01', al: '2027-06-01', semestre: 2 })
  })

  it('a gennaio si guarda già al secondo semestre', async () => {
    const { periodoDiLezione } = await import('./gomp')
    expect(periodoDiLezione(new Date(2027, 0, 15)).semestre).toBe(2)
  })

  it('ad agosto si prepara il primo semestre del nuovo anno', async () => {
    const { periodoDiLezione } = await import('./gomp')
    expect(periodoDiLezione(new Date(2027, 7, 20)).dal).toBe('2027-09-01')
  })
})
