/* ============================================================
   Piano di studi — /it/course/{codice}/attendance/lessons-plan

   Com'è fatta la pagina (verificato su Design 33426):

   - un <select id="edit-year-course"> elenca le coorti, con il
     codice corso di ciascuna: "2024/2025 - Design: 31807". Il
     codice cambia fra coorti, quindi non identifica il corso da
     solo;
   - la prima tabella è il piano completo. I gruppi opzionali stanno
     in finestre modali (`.modal`), ciascuna col suo titolo
     ("1° gruppo opzionale: lo studente deve acquisire 12 CFU…") e
     una tabella che ripete gli stessi insegnamenti. Servono solo a
     sapere chi appartiene a quale gruppo: gli insegnamenti vanno
     deduplicati, altrimenti i CFU si contano più volte;
   - una riga con `data-parent-id` è un MODULO del corso integrato
     che la precede. Il modulo non ha codice proprio: voto e CFU
     appartengono al padre. Sommare i CFU dei moduli a quelli del
     padre raddoppierebbe il totale;
   - i codici che iniziano per AAF sono attività senza voto
     (idoneità, tirocinio, prova finale).
   ============================================================ */

import * as cheerio from 'cheerio'
import type { Coorte, GruppoOpzionale, Insegnamento, Modulo, Piano, TipoAttivita } from '../tipi'

const BASE = 'https://corsidilaurea.uniroma1.it'

export interface PianoEstratto {
  codiceCorso: string
  nomeCorso: string
  coorte: number
  coorti: Coorte[]
  curricula: string[]
  insegnamenti: Insegnamento[]
  gruppi: GruppoOpzionale[]
}

const pulisci = (t: string) => t.replace(/\s+/g, ' ').trim()

/** "1º" → 1 · "Annuale" → 0 */
function numeroPeriodo(t: string): number {
  const s = pulisci(t).toLowerCase()
  if (s.startsWith('annual')) return 0
  const n = Number(s.replace(/[^\d]/g, ''))
  return Number.isFinite(n) ? n : 0
}

/** Le attività AAF non danno un voto: contano i CFU, non la media.
 *  Distinguerle qui evita che le statistiche le trattino come esami. */
function tipoDa(codice: string, nome: string): TipoAttivita {
  if (/^AAF/i.test(codice)) return 'pass_fail'
  if (/prova finale|tirocinio|idoneit/i.test(nome)) return 'pass_fail'
  if (/a scelta dello studente/i.test(nome)) return 'other'
  return 'graded'
}

export function estraiPiano(html: string, codiceCorsoAtteso?: string): PianoEstratto {
  const $ = cheerio.load(html)

  /* ---- coorti dal selettore ---- */
  const coorti: Coorte[] = []
  let coorteCorrente: number | null = null
  let codiceCorrente = codiceCorsoAtteso ?? ''
  $('#edit-year-course option').each((_, o) => {
    const valore = pulisci($(o).attr('value') ?? '')
    const etichetta = pulisci($(o).text())
    // value = "2026-33426", testo = "2026/2027 - Design: 33426"
    const m = /^(\d{4})-(\S+)$/.exec(valore)
    if (!m) return
    const anno = Number(m[1])
    coorti.push({ anno, etichetta: etichetta.split(' - ')[0] || String(anno), codiceCorso: m[2] })
    if ($(o).attr('selected') != null) { coorteCorrente = anno; codiceCorrente = m[2] }
  })
  if (coorteCorrente == null && coorti.length) {
    coorteCorrente = coorti[0].anno
    codiceCorrente = coorti[0].codiceCorso
  }

  const nomeCorso = pulisci($('#page-title h1').first().text()) || pulisci($('h1').first().text())

  const curricula: string[] = []
  $('.curriculum, .curricula li').each((_, e) => {
    const t = pulisci($(e).text())
    if (t && !curricula.includes(t)) curricula.push(t)
  })

  /* ---- insegnamenti, tabella per tabella ---- */
  const perCodice = new Map<string, Insegnamento>()
  const gruppi: GruppoOpzionale[] = []

  $('table').each((_, tabella) => {
    // I gruppi opzionali vivono in finestre modali, non in tabelle
    // inline: il titolo è l'h5 del modale che contiene la tabella.
    const titoloModale = pulisci($(tabella).closest('.modal').find('.modal-title').first().text())
    const mGruppo = /(\d+)\s*[°º]\s*gruppo opzionale\s*:?\s*(.*)$/i.exec(titoloModale)
    let gruppo: GruppoOpzionale | null = null
    if (mGruppo) {
      const descrizione = pulisci(mGruppo[2])
      const mCfu = /(\d+)\s*CFU/i.exec(descrizione)
      gruppo = {
        nome: `${mGruppo[1]}° gruppo opzionale`,
        cfuRichiesti: mCfu ? Number(mCfu[1]) : undefined,
        codici: [],
      }
      gruppi.push(gruppo)
    }

    let padre: Insegnamento | null = null
    // I moduli di un insegnamento si raccolgono una volta sola: lo
    // stesso integrato compare sia nella tabella principale sia nel
    // modale del suo gruppo, e senza questo li raddoppierebbe.
    let raccogliModuli = false

    $(tabella).find('tr').each((_, riga) => {
      const $r = $(riga)
      const classi = $r.attr('class') ?? ''
      if (classi.includes('text')) return            // riga di obiettivi formativi
      const celle = $r.find('td')
      if (celle.length < 4) return                   // intestazione

      const codice = pulisci($r.find('.activity-code').first().text())
      const nome = pulisci($r.find('.activity-name').first().text())
      if (!nome) return

      const anno = numeroPeriodo($(celle[1]).text())
      const semestre = numeroPeriodo($(celle[2]).text())
      const cfu = Number(pulisci($(celle[3]).text()).replace(',', '.')) || 0

      // "[MATH-03/A] [ITA]" accanto al nome
      const marcatori = pulisci($r.find('strong').first().text())
      const mSsd = /\[([^\]]+)\]/.exec(marcatori)
      const mLingua = /\[([^\]]+)\]\s*$/.exec(marcatori)
      const ssd = mSsd && mSsd[1] !== 'N/D' ? mSsd[1] : undefined
      const lingua = mLingua && mLingua[1] !== mSsd?.[1] ? mLingua[1] : undefined

      const href = $r.find('a[href*="/attendance/lesson/"]').first().attr('href')
      const uuid = $r.attr('data-activity-id') ?? $r.attr('data-group-id') ?? undefined

      if ($r.attr('data-parent-id')) {
        // È un modulo: appartiene al corso integrato che lo precede.
        // Niente codice, niente CFU sommati al padre.
        if (padre && raccogliModuli) {
          const modulo: Modulo = { nome, cfu, ssd, lingua, uuid }
          padre.moduli.push(modulo)
        }
        return
      }

      // Senza codice (A SCELTA DELLO STUDENTE) si usa l'uuid: serve
      // comunque una chiave stabile per agganciare la scelta.
      const chiave = codice || (uuid ? `UUID-${uuid}` : `NOME-${nome}`)

      const esistente = perCodice.get(chiave)
      if (esistente) {
        // Già visto nella prima tabella: qui impariamo solo il gruppo,
        // i moduli ce li ha già.
        if (gruppo && !gruppo.codici.includes(chiave)) {
          esistente.gruppo = gruppo.nome
          gruppo.codici.push(chiave)
        }
        padre = esistente
        raccogliModuli = false
        return
      }

      const ins: Insegnamento = {
        codice: chiave,
        nome,
        anno: Math.min(Math.max(anno || 1, 1), 6),
        semestre,
        cfu,
        ssd,
        lingua,
        tipo: tipoDa(codice, nome),
        gruppo: gruppo?.nome,
        moduli: [],
        uuid,
        pagina: href ? (href.startsWith('http') ? href : BASE + href) : undefined,
      }
      perCodice.set(chiave, ins)
      if (gruppo && !gruppo.codici.includes(chiave)) gruppo.codici.push(chiave)
      padre = ins
      raccogliModuli = true
    })
  })

  return {
    codiceCorso: codiceCorrente,
    nomeCorso,
    coorte: coorteCorrente ?? new Date().getFullYear(),
    coorti,
    curricula,
    insegnamenti: [...perCodice.values()],
    gruppi,
  }
}

/** Confeziona il file pubblicabile. */
export function pianoPubblicabile(e: PianoEstratto, url: string, fetchedAt = new Date().toISOString()): Piano {
  return {
    schemaVersion: 1,
    sources: [url],
    fetchedAt,
    codiceCorso: e.codiceCorso,
    nomeCorso: e.nomeCorso,
    coorte: e.coorte,
    curricula: e.curricula,
    insegnamenti: e.insegnamenti,
    gruppi: e.gruppi,
  }
}
