/* ============================================================
   Orari curati a mano.

   È la via legittima per gli orari che nessuna fonte automatica
   può dare: quelli delle facoltà che pubblicano in PDF, o quelli
   che il feed non attribuisce a un anno e a un canale.

   Il formato è un CSV pensato per essere compilato a mano, anche
   da un rappresentante degli studenti, senza conoscere il codice:

     corso,anno,canale,nome,giorno,inizio,fine,aula,edificio,dal,al,saltate
     33426,2,2º canale,Teoria e storia del design,mar,14:30,18:30,Aula 9,RM064,2026-09-28,2027-01-13,2026-12-08

   Righe vuote e commentate con # vengono ignorate. Un file
   sbagliato non passa in silenzio: si dice quale riga e perché.
   ============================================================ */

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Lezione } from '../tipi'
import type { EsitoOrario, TimetableAdapter } from './tipi'

const GIORNI: Record<string, number> = {
  lun: 1, mar: 2, mer: 3, gio: 4, ven: 5, sab: 6, dom: 7,
  lunedi: 1, martedi: 2, mercoledi: 3, giovedi: 4, venerdi: 5, sabato: 6, domenica: 7,
}

export interface RigaCurata extends Lezione { corso: string }

export interface EsitoLettura {
  righe: RigaCurata[]
  errori: string[]
}

const chiave = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '')

/** Legge un CSV curato. Non lancia: raccoglie gli errori e va
 *  avanti, così una riga sbagliata non butta via tutto il file. */
export function leggiCsv(testo: string, nomeFile = 'curato.csv'): EsitoLettura {
  const righe: RigaCurata[] = []
  const errori: string[] = []
  const linee = testo.split(/\r?\n/)
  let intestazione: string[] | null = null

  linee.forEach((linea, i) => {
    const n = i + 1
    const t = linea.trim()
    if (!t || t.startsWith('#')) return
    const campi = t.split(',').map(x => x.trim())
    if (!intestazione) { intestazione = campi.map(chiave); return }

    const v = (nome: string) => {
      const idx = intestazione!.indexOf(chiave(nome))
      return idx >= 0 ? (campi[idx] ?? '') : ''
    }

    const corso = v('corso')
    const nome = v('nome')
    const giorno = GIORNI[chiave(v('giorno'))] ?? Number(v('giorno'))
    // Normalizzare PRIMA di confrontare: come stringhe "11:00" viene
    // prima di "9:00", e un orario scritto senza zero verrebbe
    // rifiutato per un motivo sbagliato.
    const ora = (o: string) => (/^\d:\d{2}$/.test(o.trim()) ? `0${o.trim()}` : o.trim())
    const inizio = ora(v('inizio'))
    const fine = ora(v('fine'))

    if (!corso) { errori.push(`${nomeFile}:${n} manca il codice del corso`); return }
    if (!nome) { errori.push(`${nomeFile}:${n} manca il nome dell'insegnamento`); return }
    if (!(giorno >= 1 && giorno <= 7)) { errori.push(`${nomeFile}:${n} giorno non valido: «${v('giorno')}»`); return }
    if (!/^\d{1,2}:\d{2}$/.test(inizio) || !/^\d{1,2}:\d{2}$/.test(fine)) {
      errori.push(`${nomeFile}:${n} orario non valido: «${inizio}»–«${fine}»`); return
    }
    if (fine <= inizio) { errori.push(`${nomeFile}:${n} la fine (${fine}) non viene dopo l'inizio (${inizio})`); return }

    const annoTxt = v('anno')
    const anno = annoTxt ? Number(annoTxt) : undefined
    if (annoTxt && !(anno! >= 1 && anno! <= 6)) { errori.push(`${nomeFile}:${n} anno non valido: «${annoTxt}»`); return }

    righe.push({
      corso,
      nome,
      codice: v('codice') || undefined,
      giorno: giorno as Lezione['giorno'],
      inizio,
      fine,
      aula: v('aula') || undefined,
      edificio: v('edificio') || undefined,
      docenti: v('docenti') ? v('docenti').split(';').map(d => d.trim()).filter(Boolean) : [],
      anno,
      canale: v('canale') || undefined,
      dal: v('dal') || undefined,
      al: v('al') || undefined,
      saltate: v('saltate') ? v('saltate').split(';').map(d => d.trim()).filter(Boolean) : [],
    })
  })

  return { righe, errori }
}

export function curatedAdapter(cartella: string): TimetableAdapter & { errori: string[] } {
  const errori: string[] = []
  const perCorso = new Map<string, RigaCurata[]>()

  if (existsSync(cartella)) {
    for (const f of readdirSync(cartella).filter(x => x.endsWith('.csv'))) {
      const e = leggiCsv(readFileSync(join(cartella, f), 'utf8'), f)
      errori.push(...e.errori)
      for (const r of e.righe) {
        if (!perCorso.has(r.corso)) perCorso.set(r.corso, [])
        perCorso.get(r.corso)!.push(r)
      }
    }
  }

  return {
    id: 'curato',
    facolta: '*',
    enabled: true,
    errori,
    supports: (codice) => perCorso.has(codice),
    async fetch(codiceCorso): Promise<EsitoOrario> {
      const righe = perCorso.get(codiceCorso) ?? []
      const lezioni = righe.map(({ corso: _corso, ...l }) => l)
      return {
        // Un orario curato è attribuito per definizione: chi lo
        // compila sa a quale anno e canale appartiene.
        lezioni: lezioni.filter(l => l.anno != null),
        nonAttribuite: lezioni.filter(l => l.anno == null),
        sources: [`curato:${cartella}`],
        dal: lezioni.map(l => l.dal).filter(Boolean).sort()[0],
        al: lezioni.map(l => l.al).filter(Boolean).sort().at(-1),
      }
    },
  }
}
