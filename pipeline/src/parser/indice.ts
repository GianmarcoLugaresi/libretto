/* ============================================================
   Indice dei corsi — /it

   La pagina elenca tutti i corsi di studio in una volta sola
   (318 alla verifica di settembre 2026), senza paginazione,
   raggruppati per area tematica in una fisarmonica.

   Ogni corso è una `li.corso-card` con:
   - il link /it/course/{codice};
   - il nome in `h5.field-content`;
   - il codice in `.corso--codice` e la classe in `.corso--tipologia`.

   L'area tematica è il titolo della sezione che li contiene: non è
   la facoltà, e non va spacciata per tale.
   ============================================================ */

import * as cheerio from 'cheerio'
import type { Corso, Indice } from '../tipi'

const pulisci = (t: string) => t.replace(/\s+/g, ' ').trim()

/** Una classe di laurea: L-4, LM-41, LMG/01, LM/SNT1… */
const CLASSE = /^(L-\d+|LM-\d+|LMG\/\d+|LM\/SNT\d*|LM-\d+\s*&\s*LM-\d+)$/i

export interface IndiceEstratto {
  corsi: Corso[]
  /** Aree tematiche viste, con quanti corsi ciascuna */
  aree: Record<string, number>
}

export function estraiIndice(html: string): IndiceEstratto {
  const $ = cheerio.load(html)
  const perCodice = new Map<string, Corso>()
  const aree: Record<string, number> = {}

  $('li.corso-card').each((_, card) => {
    const $c = $(card)
    const href = $c.find('a[href*="/it/course/"]').first().attr('href') ?? ''
    const mCodice = /\/it\/course\/(\w+)/.exec(href)
    const codiceDaTesto = pulisci($c.find('.corso--codice').first().text())
      .replace(/^Codice corso\s*/i, '')
    const codice = mCodice?.[1] || codiceDaTesto
    if (!codice) return

    const nome = pulisci($c.find('h5.field-content').first().text())
    if (!nome) return

    // Fra i .corso--tipologia il primo che somiglia a una classe è
    // la classe; gli altri sono modalità di accesso e simili.
    let classe: string | undefined
    $c.find('.corso--tipologia').each((_, t) => {
      const v = pulisci($(t).text().replace(pulisci($(t).find('.corso--label').text()), ''))
      if (!classe && CLASSE.test(v)) classe = v
    })

    const area = pulisci($c.closest('.accordion-item').find('.accordion-title h4 span').first().text())
    if (area) aree[area] = (aree[area] ?? 0) + 1

    // Lo stesso corso può comparire in più aree: si tiene una volta.
    if (!perCodice.has(codice)) {
      perCodice.set(codice, { codice, nome, classe, facolta: undefined, coorti: [] })
    }
  })

  return {
    corsi: [...perCodice.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'it')),
    aree,
  }
}

export function indicePubblicabile(
  corsi: Corso[], url: string, hash: Record<string, string> = {},
  generatedAt = new Date().toISOString(),
): Indice {
  return {
    schemaVersion: 1,
    sources: [url],
    fetchedAt: generatedAt,
    generatedAt,
    corsi,
    hash,
  }
}
