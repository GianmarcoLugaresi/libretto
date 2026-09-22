/* ============================================================
   Orari dal calendario del catalogo (dati GOMP).

   La pagina /it/course/{codice}/attendance/timetable non contiene
   l'orario: lo carica FullCalendar da
   /it/services/gomp/timetable-data/{codice}?start=…&end=…
   che sta sullo STESSO host del catalogo, quello il cui robots.txt
   consente l'accesso. Non serve toccare app.arc.uniroma1.it.

   Attenzione, e questo è il punto che conta: il feed etichetta anno
   e canale solo per una parte delle lezioni. Nel primo semestre
   2026/27 di Design il campo `filters` dichiara
   `course_years: [1, 2]`, e più della metà degli eventi ha
   `course_years: []`. Dedurre l'anno dalle righe non etichettate
   produce lezioni del secondo anno attribuite al primo: è già
   successo. Qui le righe senza etichetta finiscono in
   `nonAttribuite` e ci restano.
   ============================================================ */

import { scarica } from '../http'
import type { Lezione } from '../tipi'
import type { EsitoOrario, OpzioniAdattatore, TimetableAdapter } from './tipi'

const BASE = 'https://corsidilaurea.uniroma1.it'

interface EventoGomp {
  start: string
  end: string
  title: string
  description?: string
  course_years?: number[]
  partitions?: string[]
  curricula?: string[]
  ssds?: string[]
}

interface RispostaGomp {
  events?: EventoGomp[]
  filters?: { course_years?: number[]; partitions?: string[] }
}

const senzaTag = (t: string) => t.replace(/<[^>]+>/g, ' ')

function decodifica(t: string): string {
  return t
    .replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ').trim()
}

/** Il titolo è HTML: nome in <b>, docente e aula in paragrafi con
 *  icone. Si legge per struttura, non a naso. */
export function leggiTitolo(titolo: string): { nome: string; docenti: string[]; aula?: string; edificio?: string } {
  const nome = decodifica((/<b>([\s\S]*?)<\/b>/.exec(titolo) ?? [, ''])[1])
  const docenti = [...titolo.matchAll(/fa-user"><\/i>\s*<a[^>]*>([\s\S]*?)<\/a>/g)]
    .map(m => decodifica(m[1]))
    .filter(Boolean)
  const mAula = /fa-location"><\/i>([\s\S]*?)(?:\(|<\/)/.exec(titolo)
  const aula = mAula ? decodifica(senzaTag(mAula[1])) : undefined
  const mEd = /\((RM\d+)/.exec(titolo)
  return { nome, docenti, aula: aula || undefined, edificio: mEd?.[1] }
}

const oraDi = (iso: string) => iso.slice(11, 16)
const giornoDi = (iso: string) => {
  const d = new Date(`${iso.slice(0, 19)}`)
  const g = d.getDay()
  return g === 0 ? 7 : g
}

/** Raggruppa gli eventi in fasce settimanali ricorrenti, e ricava
 *  le date saltate: un giorno della settimana dentro il periodo in
 *  cui quella fascia non compare è una sospensione (ponte, vacanze). */
export function aggrega(eventi: EventoGomp[]): EsitoOrario {
  const fasce = new Map<string, { l: Lezione; date: Set<string> }>()
  let dal: string | undefined
  let al: string | undefined

  for (const e of eventi) {
    if (!e.start || !e.end) continue
    const data = e.start.slice(0, 10)
    if (!dal || data < dal) dal = data
    if (!al || data > al) al = data

    const { nome, docenti, aula, edificio } = leggiTitolo(e.title ?? '')
    if (!nome) continue
    const giorno = giornoDi(e.start)
    const inizio = oraDi(e.start)
    const fine = oraDi(e.end)
    // Anno e canale SOLO se la fonte li dichiara.
    const anno = e.course_years?.length === 1 ? e.course_years[0] : undefined
    const canale = e.partitions?.length === 1 ? decodifica(e.partitions[0]) : undefined

    const k = [nome, giorno, inizio, fine, aula ?? '', anno ?? '', canale ?? ''].join('|')
    const g = fasce.get(k)
    if (g) { g.date.add(data); for (const d of docenti) if (!g.l.docenti.includes(d)) g.l.docenti.push(d); continue }
    fasce.set(k, {
      l: { nome, giorno, inizio, fine, aula, edificio, docenti: [...docenti], anno, canale, saltate: [] },
      date: new Set([data]),
    })
  }

  // Le sospensioni: giorni del periodo, nello stesso giorno della
  // settimana, in cui la fascia non si è tenuta.
  for (const { l, date } of fasce.values()) {
    const ordinate = [...date].sort()
    l.dal = ordinate[0]
    l.al = ordinate[ordinate.length - 1]
    const saltate: string[] = []
    for (let d = new Date(`${l.dal}T00:00:00`); d <= new Date(`${l.al}T00:00:00`); d.setDate(d.getDate() + 1)) {
      const g = d.getDay() === 0 ? 7 : d.getDay()
      if (g !== l.giorno) continue
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (!date.has(iso)) saltate.push(iso)
    }
    l.saltate = saltate
  }

  const tutte = [...fasce.values()].map(f => f.l)
  return {
    lezioni: tutte.filter(l => l.anno != null),
    nonAttribuite: tutte.filter(l => l.anno == null),
    sources: [],
    dal,
    al,
  }
}

/** Mesi da interrogare: il feed risponde per intervallo. */
function mesi(dal: string, al: string): [string, string][] {
  const out: [string, string][] = []
  const d = new Date(`${dal.slice(0, 7)}-01T00:00:00`)
  const fine = new Date(`${al.slice(0, 7)}-01T00:00:00`)
  while (d <= fine) {
    const a = new Date(d); const b = new Date(d); b.setMonth(b.getMonth() + 1)
    const f = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-01T00:00:00`
    out.push([f(a), f(b)])
    d.setMonth(d.getMonth() + 1)
  }
  return out
}

export function gompAdapter(): TimetableAdapter {
  return {
    id: 'gomp-catalogo',
    facolta: '*',
    enabled: true,
    supports: () => true,   // il feed esiste per ogni corso del catalogo
    async fetch(codiceCorso, o: OpzioniAdattatore = {}) {
      const prendi = o.prendi ?? (async (url: string) => (await scarica(url)).corpo)
      const dal = o.dal ?? `${new Date().getFullYear()}-09-01`
      const al = o.al ?? `${new Date().getFullYear() + 1}-02-01`
      const eventi: EventoGomp[] = []
      const sources: string[] = []

      for (const [inizio, fine] of mesi(dal, al)) {
        const url = `${BASE}/it/services/gomp/timetable-data/${codiceCorso}?start=${inizio}&end=${fine}`
        const corpo = await prendi(url)
        sources.push(url)
        if (!corpo) continue
        let dati: RispostaGomp
        try { dati = JSON.parse(corpo) } catch { continue }
        eventi.push(...(dati.events ?? []))
      }

      const esito = aggrega(eventi)
      return { ...esito, sources }
    },
  }
}
