/* ============================================================
   Test di caratterizzazione: fissano il comportamento attuale
   dei calcoli di carriera prima di qualunque refactor. Se un
   giorno una media cambia, deve essere una scelta, non un
   effetto collaterale.
   ============================================================ */

import { describe, it, expect } from 'vitest'
import {
  riepilogo, andamento, distribuzione, cfuPerAnno, mediaNecessaria,
  cfuResiduiInMedia, impatto, inCentodecimi, ritmo, votoEffettivo,
  portaCfu, fmtMedia, fmtVoto, fmt110,
} from './stats'
import type { Stato, Insegnamento, Esame, TipoInsegnamento } from './types'
import { IMPOSTAZIONI_DEFAULT, profiloDefault } from './seed'

/* ---------------- Costruttori di comodo ---------------- */

let n = 0
function ins(cfu: number, extra: Partial<Insegnamento> = {}): Insegnamento {
  n++
  return {
    id: `i${n}`, nome: `Insegnamento ${n}`, cfu,
    anno: 1, semestre: 1, tipo: 'obbligatorio' as TipoInsegnamento, tinta: 0,
    ...extra,
  }
}

function stato(voci: { ins: Insegnamento; esame?: Partial<Esame> }[], cfuTotali = 180): Stato {
  const esami: Record<string, Esame> = {}
  for (const v of voci) {
    if (v.esame) esami[v.ins.id] = { insegnamentoId: v.ins.id, stato: 'da_sostenere', ...v.esame }
  }
  return {
    versione: 1,
    profilo: { ...profiloDefault(), cfuTotali, immatricolazione: 2025 },
    impostazioni: { ...IMPOSTAZIONI_DEFAULT },
    insegnamenti: voci.map(v => v.ins),
    esami,
    appelli: [],
    lezioni: [],
    sync: {},
    onboarding: false,
  }
}

const superato = (voto: number, data = '2026-01-15', lode = false): Partial<Esame> =>
  ({ stato: 'superato', voto, lode, data })

/* ---------------- Media ponderata ---------------- */

describe('media ponderata', () => {
  it('pesa i voti sui CFU, non sul numero di esami', () => {
    // 30 su 12 CFU e 18 su 6 CFU: la ponderata sta più vicina al 30
    const s = stato([
      { ins: ins(12), esame: superato(30) },
      { ins: ins(6), esame: superato(18) },
    ])
    const r = riepilogo(s)
    expect(r.mediaPonderata).toBeCloseTo((30 * 12 + 18 * 6) / 18, 6)
    expect(r.mediaAritmetica).toBeCloseTo(24, 6)
  })

  it('senza esami superati non inventa una media', () => {
    const r = riepilogo(stato([{ ins: ins(9) }]))
    expect(r.mediaPonderata).toBeNull()
    expect(r.mediaAritmetica).toBeNull()
    expect(r.votoPartenza).toBeNull()
    expect(r.proiezioneLaurea).toBeNull()
  })

  it('la lode vale quanto dice impostazioni.valoreLode', () => {
    const base = stato([{ ins: ins(6), esame: superato(30, '2026-01-15', true) }])
    expect(riepilogo(base).mediaPonderata).toBe(30)

    const con31 = { ...base, impostazioni: { ...base.impostazioni, valoreLode: 31 as const } }
    expect(riepilogo(con31).mediaPonderata).toBe(31)
    // il voto grezzo resta 30: la lode cambia la media, non il libretto
    expect(riepilogo(con31).votoMax).toBe(30)
  })
})

/* ---------------- Idoneità ---------------- */

describe('idoneità', () => {
  it('porta CFU ma non entra in media', () => {
    const s = stato([
      { ins: ins(9), esame: superato(24) },
      { ins: ins(3), esame: { stato: 'idoneo', data: '2026-02-01' } },
    ])
    const r = riepilogo(s)
    expect(r.cfuAcquisiti).toBe(12)      // conta i CFU
    expect(r.cfuInMedia).toBe(9)         // ma non nel peso della media
    expect(r.mediaPonderata).toBe(24)
    expect(r.esamiSuperati).toBe(2)
  })
})

/* ---------------- Esclusione dalla media ---------------- */

describe('esami esclusi dalla media (convalide)', () => {
  it('portano CFU senza spostare la media', () => {
    const s = stato([
      { ins: ins(6), esame: superato(30) },
      { ins: ins(12), esame: { ...superato(18), escludiDaMedia: true } },
    ])
    const r = riepilogo(s)
    expect(r.cfuAcquisiti).toBe(18)
    expect(r.cfuInMedia).toBe(6)
    expect(r.mediaPonderata).toBe(30)
  })
})

/* ---------------- Stati che non contano ---------------- */

describe('stati non superati', () => {
  it('prenotato e respinto non portano CFU né media', () => {
    const s = stato([
      { ins: ins(9), esame: { stato: 'prenotato' } },
      { ins: ins(6), esame: { stato: 'respinto', data: '2026-01-10' } },
      { ins: ins(6), esame: superato(27) },
    ])
    const r = riepilogo(s)
    expect(r.cfuAcquisiti).toBe(6)
    expect(r.esamiSuperati).toBe(1)
    expect(r.esamiRimanenti).toBe(2)
    expect(r.mediaPonderata).toBe(27)
  })
})

/* ---------------- Base di laurea ---------------- */

describe('base di laurea', () => {
  it('è media × 110 ÷ 30', () => {
    const s = stato([{ ins: ins(6), esame: superato(27) }])
    const r = riepilogo(s)
    expect(r.votoPartenza).toBeCloseTo(27 * 110 / 30, 6)   // 99
    expect(inCentodecimi(30)).toBe(110)
    expect(inCentodecimi(18)).toBeCloseTo(66, 6)
  })

  it('la proiezione somma i punti di tesi e non supera 110', () => {
    const s = stato([{ ins: ins(6), esame: superato(30, '2026-01-15', true) }])
    const conBonus = { ...s, impostazioni: { ...s.impostazioni, puntiTesi: 6 } }
    // 30 → base 110, +6 resterebbe 116: va tagliato a 110
    expect(riepilogo(conBonus).proiezioneLaurea).toBe(110)
  })
})

/* ---------------- Percentuale e CFU ---------------- */

describe('avanzamento', () => {
  it('la percentuale non supera 1 anche con CFU in più del piano', () => {
    const s = stato([{ ins: ins(200), esame: superato(30) }], 180)
    const r = riepilogo(s)
    expect(r.percentuale).toBe(1)
    expect(r.cfuRimanenti).toBe(0)
  })

  it('CFU per anno separa fatti e totali', () => {
    const s = stato([
      { ins: ins(12, { anno: 1 }), esame: superato(28) },
      { ins: ins(6, { anno: 1 }) },
      { ins: ins(9, { anno: 2 }) },
    ])
    expect(cfuPerAnno(s)).toEqual([
      { anno: 1, fatti: 12, totali: 18 },
      { anno: 2, fatti: 0, totali: 9 },
    ])
  })
})

/* ---------------- Andamento ---------------- */

describe('andamento nel tempo', () => {
  it('ricalcola la ponderata dopo ogni esame, in ordine di data', () => {
    const s = stato([
      { ins: ins(6), esame: superato(30, '2026-03-01') },
      { ins: ins(6), esame: superato(18, '2026-01-01') },
    ])
    const a = andamento(s)
    expect(a.map(p => p.data)).toEqual(['2026-01-01', '2026-03-01'])
    expect(a[0].media).toBe(18)
    expect(a[1].media).toBe(24)
  })

  it('salta gli esami senza data', () => {
    const s = stato([{ ins: ins(6), esame: { stato: 'superato', voto: 30 } }])
    expect(andamento(s)).toHaveLength(0)
  })
})

/* ---------------- Distribuzione ---------------- */

describe('distribuzione dei voti', () => {
  it('copre sempre 18–30, anche gli zeri', () => {
    const d = distribuzione(stato([{ ins: ins(6), esame: superato(24) }]))
    expect(d).toHaveLength(13)
    expect(d[0].voto).toBe(18)
    expect(d[12].voto).toBe(30)
    expect(d.find(x => x.voto === 24)!.conta).toBe(1)
    expect(d.find(x => x.voto === 25)!.conta).toBe(0)
  })
})

/* ---------------- Simulatore e obiettivo ---------------- */

describe('simulatore', () => {
  it('impatto dice dove finisce la media con un voto ipotetico', () => {
    const s = stato([{ ins: ins(6), esame: superato(24) }])
    const { nuova, delta } = impatto(s, 6, 30)
    expect(nuova).toBe(27)
    expect(delta).toBe(3)
  })

  it('i CFU residui in media escludono tirocinio, prova finale e lingua', () => {
    const s = stato([
      { ins: ins(6) },
      { ins: ins(3, { tipo: 'lingua' }) },
      { ins: ins(6, { tipo: 'tirocinio' }) },
      { ins: ins(9, { tipo: 'prova_finale' }) },
    ])
    expect(cfuResiduiInMedia(s)).toBe(6)
  })

  it('la media necessaria può risultare fuori scala: è informazione, non errore', () => {
    const s = stato([
      { ins: ins(6), esame: superato(18) },
      { ins: ins(6) },
    ])
    // per arrivare a 28 partendo da 18 su metà dei CFU servirebbe 38
    expect(mediaNecessaria(s, 28)).toBeCloseTo(38, 6)
  })

  it('senza CFU residui non c\'è una media necessaria', () => {
    const s = stato([{ ins: ins(6), esame: superato(30) }])
    expect(mediaNecessaria(s, 28)).toBeNull()
  })
})

/* ---------------- Ritmo ---------------- */

describe('ritmo', () => {
  it('confronta i CFU fatti con i 60 all\'anno attesi', () => {
    const s = stato([{ ins: ins(60), esame: superato(27) }])
    const r = ritmo({ ...s, profilo: { ...s.profilo, immatricolazione: 2025 } })
    expect(r.cfuAttesi).toBeGreaterThan(0)
    expect(typeof r.inPari).toBe('boolean')
  })
})

/* ---------------- Formattazione ---------------- */

describe('formattazione', () => {
  it('usa la virgola decimale e il trattino per i vuoti', () => {
    expect(fmtMedia(26.96)).toBe('26,96')
    expect(fmtMedia(27)).toBe('27,00')
    expect(fmtMedia(26.9, 1)).toBe('26,9')
    expect(fmtMedia(null)).toBe('—')
    expect(fmt110(null)).toBe('—')
    expect(fmt110(98.6)).toBe('99')
  })

  it('arrotonda come toFixed, cioè sul valore binario davvero rappresentato', () => {
    // 26.955 in virgola mobile è 26.9549…, quindi scende a 26,95.
    // Non è un difetto da correggere: è come si comporta JavaScript,
    // e va scritto perché nessuno lo "aggiusti" per sbaglio.
    expect(fmtMedia(26.955)).toBe('26,95')
    expect(fmtMedia(26.965)).toBe('26,96')
  })

  it('il voto mostra 30L per la lode e ID per le idoneità', () => {
    expect(fmtVoto({ insegnamentoId: 'x', stato: 'superato', voto: 30, lode: true })).toBe('30L')
    expect(fmtVoto({ insegnamentoId: 'x', stato: 'superato', voto: 27 })).toBe('27')
    expect(fmtVoto({ insegnamentoId: 'x', stato: 'idoneo' })).toBe('ID')
    expect(fmtVoto(undefined)).toBe('—')
  })
})

/* ---------------- Predicati di base ---------------- */

describe('predicati', () => {
  it('votoEffettivo restituisce null quando il voto non conta', () => {
    const imp = IMPOSTAZIONI_DEFAULT
    expect(votoEffettivo({ insegnamentoId: 'x', stato: 'superato', voto: 27 }, imp)).toBe(27)
    expect(votoEffettivo({ insegnamentoId: 'x', stato: 'idoneo' }, imp)).toBeNull()
    expect(votoEffettivo({ insegnamentoId: 'x', stato: 'prenotato' }, imp)).toBeNull()
    expect(votoEffettivo({ insegnamentoId: 'x', stato: 'superato', voto: 27, escludiDaMedia: true }, imp)).toBeNull()
  })

  it('portaCfu vale per superato e idoneo', () => {
    expect(portaCfu({ insegnamentoId: 'x', stato: 'superato', voto: 18 })).toBe(true)
    expect(portaCfu({ insegnamentoId: 'x', stato: 'idoneo' })).toBe(true)
    expect(portaCfu({ insegnamentoId: 'x', stato: 'respinto' })).toBe(false)
    expect(portaCfu({ insegnamentoId: 'x', stato: 'da_sostenere' })).toBe(false)
  })
})
