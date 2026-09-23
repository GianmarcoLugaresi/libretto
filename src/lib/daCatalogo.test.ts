// @vitest-environment node
/* Sui dati veri di Design: il piano e l'orario salvati in fixture
   dalla pipeline, e il libretto nato dal vecchio piano statico. */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { estraiPiano, pianoPubblicabile } from '../../pipeline/src/parser/piano'
import { aggrega } from '../../pipeline/src/orari/gomp'
import {
  cfuDelPiano, cfuTotali, insegnamentiIniziali, nomeLeggibile, orarioDaCatalogo, ricollega,
  tipoCorso, tipoDa, trovaNelPiano,
} from './daCatalogo'
import { CATALOGO, espandi } from './catalogo'
import { statoIniziale } from './seed'
import type { Orario, Piano } from './dati'
import type { Stato } from './types'

const qui = dirname(fileURLToPath(import.meta.url))
const fixture = (n: string) => readFileSync(join(qui, '..', '..', 'pipeline', 'fixture', n), 'utf8')

const piano: Piano = pianoPubblicabile(
  estraiPiano(fixture('design-piano.html'), '33426'),
  'https://corsidilaurea.uniroma1.it/it/course/33426/attendance/lessons-plan',
  '2026-09-23T04:30:00.000Z',
)

const orario: Orario = (() => {
  const e = aggrega(JSON.parse(fixture('design-orario-2026-10.json')).events)
  return {
    schemaVersion: 1, sources: ['https://corsidilaurea.uniroma1.it/it'], fetchedAt: '2026-09-23T04:30:00.000Z',
    codiceCorso: '33426', coorte: 2026, adattatore: 'gomp-catalogo', semestre: 1,
    lezioni: e.lezioni, nonAttribuite: e.nonAttribuite,
  }
})()

describe('nomi', () => {
  it('dal maiuscolo del catalogo a una frase', () => {
    expect(nomeLeggibile('DISEGNO E MODELLO')).toBe('Disegno e modello')
    expect(nomeLeggibile("MANAGEMENT DELL'INNOVAZIONE")).toBe("Management dell'innovazione")
  })

  it("l'apostrofo finale torna accento, tranne sulla e", () => {
    expect(nomeLeggibile("TECNOLOGIE PER LA SOSTENIBILITA'")).toBe('Tecnologie per la sostenibilità')
    expect(nomeLeggibile("PERCHE' NO")).toBe("Perche' no")
  })

  it('i numeri romani in fondo restano numeri romani', () => {
    expect(nomeLeggibile('ANALISI MATEMATICA II')).toBe('Analisi matematica II')
    expect(nomeLeggibile('I SISTEMI')).toBe('I sistemi')
  })

  it('un nome già scritto con le minuscole non si tocca', () => {
    expect(nomeLeggibile('Laboratorio di UX')).toBe('Laboratorio di UX')
  })
})

describe('piano di Design', () => {
  it('fa 180 CFU contando una scelta per gruppo', () => {
    expect(cfuDelPiano(piano)).toBe(180)
  })

  it('nel libretto iniziale entrano tutti tranne le alternative dei gruppi', () => {
    const ins = insegnamentiIniziali(piano)
    expect(ins.length).toBe(piano.insegnamenti.length - 6)
    expect(ins.every(i => i.id.startsWith('cat:') && i.codice)).toBe(true)
    // I CFU del libretto iniziale + i 24 dei due gruppi = 180
    expect(ins.reduce((n, i) => n + i.cfu, 0) + 24).toBe(180)
  })

  it('i tipi vengono solo da ciò che il catalogo dichiara', () => {
    const per = (codice: string) => tipoDa(piano.insegnamenti.find(i => i.codice === codice)!)
    expect(per('AAF1008')).toBe('prova_finale')
    expect(per('AAF1101')).toBe('lingua')
    expect(per('AAF1154')).toBe('idoneita')
    expect(per('10606454')).toBe('a_scelta')   // in un gruppo opzionale
    expect(per('10589128')).toBe('obbligatorio')
  })

  it('un gruppo che dichiara meno CFU del suo esame più piccolo conta quanto l\'esame', () => {
    const p2024: Piano = pianoPubblicabile(
      estraiPiano(fixture('design-piano-2024.html'), '31807'),
      'https://corsidilaurea.uniroma1.it/it/course/33426/attendance/lessons-plan?year=2024&code=31807',
    )
    // La fonte dice 6 CFU per gruppo, gli esami ne valgono 12
    expect(p2024.gruppi.map(g => g.cfuRichiesti)).toEqual([6, 6])
    expect(cfuDelPiano(p2024)).toBe(180)
  })

  it('tipo e CFU del corso', () => {
    expect(tipoCorso('L-4', 3)).toBe('triennale')
    expect(tipoCorso('LM-41', 6)).toBe('ciclo_unico')
    expect(tipoCorso('LM-12', 2)).toBe('magistrale')
    // I CFU di laurea li fissa la legge, non la somma del piano
    expect(cfuTotali('triennale', 3)).toBe(180)
    expect(cfuTotali('magistrale', 2)).toBe(120)
    expect(cfuTotali('ciclo_unico', 5)).toBe(300)
    expect(cfuTotali('ciclo_unico', 6)).toBe(360)
  })
})

describe('orario di Design', () => {
  it('un modulo trova il suo insegnamento', () => {
    const t = trovaNelPiano(piano, 'GEOMETRIA DESCRITTIVA')
    expect(t?.ins.codice).toBe('10622516')
    expect(t?.modulo).toBe('Geometria descrittiva')
  })

  it('le lezioni attribuite finiscono sotto l\'insegnamento e il canale giusti', () => {
    const { orario: o } = orarioDaCatalogo(orario, piano)
    const fondamenti = o.varianti.filter(v => v.ins === 'Fondamenti di disegno')
    expect(fondamenti.map(v => v.etichetta).sort()).toEqual(['Canale 1', 'Canale 2'])
    expect(fondamenti.every(v => v.anno === 1)).toBe(true)
    // I due moduli di Fondamenti di disegno finiscono sotto lo stesso
    // insegnamento, ognuno segnato sulla sua fascia.
    const moduli = new Set(fondamenti.flatMap(v => v.slot.map(sl => sl.modulo)))
    expect([...moduli].sort()).toEqual(['Disegno digitale', 'Geometria descrittiva'])
  })

  it('le lezioni senza anno dichiarato non finiscono in nessun anno', () => {
    const { orario: o, senzaAnno, annoNelPiano } = orarioDaCatalogo(orario, piano)
    expect(o.varianti.some(v => v.ins === 'Istituzioni di matematica')).toBe(false)
    const mat = senzaAnno.find(v => v.ins === 'Istituzioni di matematica')
    expect(mat).toBeDefined()
    expect(mat!.anno).toBe(0)
    // Il piano lo mette al primo anno: è un'informazione, non un'attribuzione
    expect(annoNelPiano['Istituzioni di matematica']).toBe(1)
  })

  it('nessuna lezione si perde nel passaggio', () => {
    const { orario: o, senzaAnno } = orarioDaCatalogo(orario, piano)
    const fasce = [...o.varianti, ...senzaAnno].reduce((n, v) => n + v.slot.length, 0)
    expect(fasce).toBe(orario.lezioni.length + orario.nonAttribuite.length)
  })

  it('un docente compare una volta sola, anche su più fasce', () => {
    const doppio: Orario = {
      ...orario, nonAttribuite: [],
      lezioni: [1, 2].map(g => ({
        nome: 'TEORIA DELLA FORMA', giorno: g, inizio: '09:00', fine: '11:00',
        docenti: ['MICHELE CALVANO'], anno: 1, saltate: [],
      })),
    }
    const { orario: o } = orarioDaCatalogo(doppio, piano)
    expect(o.varianti).toHaveLength(1)
    expect(o.varianti[0].docente).toBe('Michele Calvano')
    expect(o.varianti[0].slot).toHaveLength(2)
  })

  it('senza piano i nomi restano quelli del feed', () => {
    const { orario: o } = orarioDaCatalogo(orario, undefined)
    expect(o.varianti.some(v => v.ins === 'Geometria descrittiva')).toBe(true)
  })

  it('periodo, semestre e fonte', () => {
    const { orario: o } = orarioDaCatalogo(orario, piano)
    expect(o.semestre).toBe(1)
    expect(o.aa).toBe('2026/27')
    expect(o.fonte).toContain('/course/33426/attendance/timetable')
  })
})

describe('ricollegare il libretto statico di Design', () => {
  const design = CATALOGO.find(c => c.id === 'design')!

  function libretto(): Stato {
    const s = statoIniziale()
    const ins = espandi(design)
    const disegno = ins.find(i => i.nome === 'Fondamenti di disegno')!
    return {
      ...s,
      onboarding: false,
      profilo: { ...s.profilo, catalogoId: 'design' },
      insegnamenti: ins,
      esami: {
        ...Object.fromEntries(ins.map(i => [i.id, { insegnamentoId: i.id, stato: 'da_sostenere' as const }])),
        [disegno.id]: { insegnamentoId: disegno.id, stato: 'superato', voto: 28, data: '2027-01-20', note: 'orale bello' },
      },
      appelli: [{ id: 'a1', insegnamentoId: disegno.id, data: '2027-01-20', tipo: 'orale' }],
      lezioni: [{ id: 'l1', insegnamentoId: disegno.id, giorno: 4, inizio: '14:30', fine: '19:30' }],
    }
  }

  it('aggancia ai codici veri e il voto segue', () => {
    const r = ricollega(libretto(), piano, () => 'x')
    expect(r.collegati).toBeGreaterThan(15)
    const disegno = r.stato.insegnamenti.find(i => i.nome === 'Fondamenti di disegno')!
    expect(disegno.id).toBe('cat:10622516')
    expect(disegno.codice).toBe('10622516')
    expect(r.stato.esami['cat:10622516']).toMatchObject({ stato: 'superato', voto: 28, note: 'orale bello' })
    expect(r.stato.appelli[0].insegnamentoId).toBe('cat:10622516')
    expect(r.stato.lezioni[0].insegnamentoId).toBe('cat:10622516')
  })

  it('chi non si aggancia resta, come voce personale', () => {
    const prima = libretto()
    const r = ricollega(prima, piano, () => 'x')
    expect(r.stato.insegnamenti).toHaveLength(prima.insegnamenti.length)
    expect(r.stato.insegnamenti.some(i => i.id.startsWith('piano:'))).toBe(false)
    for (const nome of r.personali) {
      expect(r.stato.insegnamenti.find(i => i.nome === nome)!.id).toMatch(/^man:/)
    }
    expect(r.collegati + r.personali.length + r.ambigui.length).toBe(prima.insegnamenti.length)
  })

  it('nessun esame si perde, nessuna chiave si duplica', () => {
    const prima = libretto()
    const r = ricollega(prima, piano, (() => { let n = 0; return () => String(n++) })())
    expect(Object.keys(r.stato.esami)).toHaveLength(Object.keys(prima.esami).length)
    const ids = r.stato.insegnamenti.map(i => i.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const i of r.stato.insegnamenti) expect(r.stato.esami[i.id]).toBeDefined()
  })

  it('rifarlo non cambia niente', () => {
    const una = ricollega(libretto(), piano, () => 'x').stato
    const due = ricollega(una, piano, () => 'y')
    expect(due.collegati).toBe(0)
    expect(due.stato).toEqual(una)
  })

  it('insegnamenti già personali non si toccano', () => {
    const s = libretto()
    s.insegnamenti.push({ id: 'man:mio:1', nome: 'Disegno e modello', cfu: 9, anno: 2, semestre: 1, tipo: 'a_scelta', tinta: 0 })
    s.esami['man:mio:1'] = { insegnamentoId: 'man:mio:1', stato: 'da_sostenere' }
    const r = ricollega(s, piano, () => 'x')
    expect(r.stato.insegnamenti.find(i => i.id === 'man:mio:1')).toBeDefined()
  })
})

describe('appelli di un insegnamento', () => {
  const comune = { schemaVersion: 1 as const, sources: ['https://corsidilaurea.uniroma1.it/it'], fetchedAt: '2026-09-23T04:30:00.000Z' }
  const appelli = {
    ...comune, codiceCorso: '33426',
    alias: { '1055957': '10589128' },
    appelli: [
      { codice: '10589128', nome: 'DISEGNO E MODELLO', codiceCorso: '33426', data: '2027-02-10', docenti: [] },
      { codice: '10589128', nome: 'DISEGNO E MODELLO', codiceCorso: '33426', data: '2027-01-18', docenti: [], prenotazioniDal: '2026-12-20', prenotazioniAl: '2027-01-12' },
      { codice: '1055957', nome: 'DISEGNO E MODELLO', codiceCorso: '33426', data: '2027-06-10', docenti: [] },
      { codice: '10589128', nome: 'DISEGNO E MODELLO', codiceCorso: '31807', data: '2027-01-19', docenti: [] },
      { codice: '10589128', nome: 'DISEGNO E MODELLO', codiceCorso: '33426', data: '2026-06-01', docenti: [] },
      { codice: '99', nome: 'TEORIA DELLA FORMA', codiceCorso: '33426', data: '2027-01-20', docenti: [] },
    ],
  }

  it('per codice, alias compresi, della propria coorte, futuri e in ordine', async () => {
    const { appelliDellInsegnamento } = await import('./daCatalogo')
    const r = appelliDellInsegnamento(appelli, '33426', { codice: '10589128', nome: 'Disegno e modello' }, '2026-09-23')
    expect(r.map(x => x.data)).toEqual(['2027-01-18', '2027-02-10', '2027-06-10'])
  })

  it('una voce a mano senza codice si aggancia per nome', async () => {
    const { appelliDellInsegnamento } = await import('./daCatalogo')
    const r = appelliDellInsegnamento(appelli, '33426', { nome: 'Teoria della forma' }, '2026-09-23')
    expect(r.map(x => x.data)).toEqual(['2027-01-20'])
  })

  it('un codice diverso non prende gli appelli di un omonimo', async () => {
    const { appelliDellInsegnamento } = await import('./daCatalogo')
    expect(appelliDellInsegnamento(appelli, '33426', { codice: '12345', nome: 'Teoria della forma' }, '2026-09-23')).toEqual([])
  })

  it('finestra di prenotazione', async () => {
    const { finestra } = await import('./daCatalogo')
    const a = appelli.appelli[1]
    expect(finestra(a, '2026-12-01')).toBe('prima')
    expect(finestra(a, '2027-01-05')).toBe('aperta')
    expect(finestra(a, '2027-01-13')).toBe('chiusa')
    expect(finestra(appelli.appelli[0], '2027-01-05')).toBe('ignota')
  })
})
