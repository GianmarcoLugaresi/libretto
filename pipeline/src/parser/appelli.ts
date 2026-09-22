/* ============================================================
   Appelli — /it/course/{codice}/attendance/exams

   Com'è fatta la pagina (verificato su Design 33426):

   - ogni insegnamento è un pannello a fisarmonica, con il titolo
     "codice | NOME" in un `.panel-title`;
   - dentro, una tabella: codice corso, docente, apertura e chiusura
     prenotazioni, data appello. Date in formato gg/mm/aaaa;
   - la stessa pagina contiene righe di PIÙ COORTI (per Design
     33426 e 31807): senza filtrare per codice corso si mostrano
     allo studente appelli che non sono suoi;
   - lo stesso appello compare più volte, una per docente o canale:
     va deduplicato per (codice, data) tenendo l'elenco dei docenti;
   - lo stesso esame ha codici diversi fra ordinamenti (Istituzioni
     di matematica: 1026553 e 10622515). Da qui nasce la tabella di
     alias: si costruisce confrontando i NOMI normalizzati, che è
     l'unico aggancio disponibile in questa pagina.
   ============================================================ */

import * as cheerio from 'cheerio'
import type { Appello, Appelli } from '../tipi'

const pulisci = (t: string) => t.replace(/\s+/g, ' ').trim()

/** "05/11/2027" → "2027-11-05". Restituisce null se non è una data. */
export function dataItaliana(t: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(pulisci(t))
  if (!m) return null
  const [, g, mm, a] = m
  const iso = `${a}-${mm.padStart(2, '0')}-${g.padStart(2, '0')}`
  // Una data come 31/02 non esiste: meglio scartarla che pubblicarla.
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime()) || d.getDate() !== Number(g)) return null
  return iso
}

/** Nome normalizzato, per riconoscere lo stesso esame sotto codici
 *  diversi. Deve restare uguale a quello usato dall'app. */
export function normalizzaNome(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/['’`´]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
}

export interface AppelliEstratti {
  appelli: Appello[]
  alias: Record<string, string>
  /** Codici corso visti in pagina: utile a capire quante coorti ci sono */
  codiciCorso: string[]
  /** Righe scartate perché senza una data valida */
  scartate: number
}

export function estraiAppelli(html: string): AppelliEstratti {
  const $ = cheerio.load(html)
  const grezzi: Appello[] = []
  const codiciCorso = new Set<string>()
  let scartate = 0

  $('.panel-title').each((_, titolo) => {
    const testo = pulisci($(titolo).text())
    const m = /^(\S+)\s*\|\s*(.+)$/.exec(testo)
    if (!m) return
    const [, codice, nome] = m

    // La tabella del pannello sta nel corpo che segue il titolo.
    const pannello = $(titolo).closest('.panel, fieldset').first()
    const tabelle = pannello.length ? pannello.find('table') : $(titolo).parent().nextAll().find('table')

    tabelle.find('tbody tr').each((_, riga) => {
      const c = $(riga).find('td').map((_, td) => pulisci($(td).text())).get()
      if (c.length < 5) return
      const [codiceCorso, docente, dal, al, dataAppello] = c
      const data = dataItaliana(dataAppello)
      if (!data) { scartate++; return }
      if (codiceCorso) codiciCorso.add(codiceCorso)
      grezzi.push({
        codice,
        nome,
        codiceCorso: codiceCorso || undefined,
        data,
        docenti: docente ? [docente] : [],
        prenotazioniDal: dataItaliana(dal) ?? undefined,
        prenotazioniAl: dataItaliana(al) ?? undefined,
      })
    })
  })

  /* ---- deduplica per (codice, corso, data), unendo i docenti ---- */
  const perChiave = new Map<string, Appello>()
  for (const a of grezzi) {
    const k = `${a.codice}|${a.codiceCorso ?? ''}|${a.data}`
    const g = perChiave.get(k)
    if (!g) { perChiave.set(k, { ...a, docenti: [...a.docenti] }); continue }
    for (const d of a.docenti) if (!g.docenti.includes(d)) g.docenti.push(d)
    // Fra due righe della stessa data si tiene la finestra più ampia:
    // è quella che non fa perdere la prenotazione.
    if (a.prenotazioniDal && (!g.prenotazioniDal || a.prenotazioniDal < g.prenotazioniDal)) g.prenotazioniDal = a.prenotazioniDal
    if (a.prenotazioniAl && (!g.prenotazioniAl || a.prenotazioniAl > g.prenotazioniAl)) g.prenotazioniAl = a.prenotazioniAl
  }
  const appelli = [...perChiave.values()].sort((x, y) => x.data.localeCompare(y.data) || x.codice.localeCompare(y.codice))

  /* ---- alias: stesso nome, codici diversi ---- */
  const perNome = new Map<string, Set<string>>()
  for (const a of appelli) {
    const n = normalizzaNome(a.nome)
    if (!perNome.has(n)) perNome.set(n, new Set())
    perNome.get(n)!.add(a.codice)
  }
  const alias: Record<string, string> = {}
  for (const codici of perNome.values()) {
    if (codici.size < 2) continue
    // Canonico: il codice più lungo, che è quello dell'ordinamento
    // nuovo (10622515 contro 1026553). A parità, il maggiore.
    const canonico = [...codici].sort((a, b) => b.length - a.length || b.localeCompare(a))[0]
    for (const c of codici) if (c !== canonico) alias[c] = canonico
  }

  return { appelli, alias, codiciCorso: [...codiciCorso].sort(), scartate }
}

/** Tiene solo gli appelli di una coorte. Senza questo filtro lo
 *  studente vede date che non lo riguardano. */
export function soloCoorte(a: Appello[], codiceCorso: string): Appello[] {
  return a.filter(x => !x.codiceCorso || x.codiceCorso === codiceCorso)
}

export function appelliPubblicabili(
  e: AppelliEstratti, codiceCorso: string, url: string, fetchedAt = new Date().toISOString(),
): Appelli {
  return {
    schemaVersion: 1,
    sources: [url],
    fetchedAt,
    codiceCorso,
    appelli: e.appelli,
    alias: e.alias,
  }
}
