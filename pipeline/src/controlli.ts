/* ============================================================
   Controlli di plausibilità.

   Uno scraper non si rompe con un errore: si rompe restituendo
   zero righe, o metà. Se pubblicassimo quel file, l'app di uno
   studente mostrerebbe un piano vuoto e una media sbagliata.

   Regola: davanti a un crollo sospetto si tiene l'ultima versione
   buona e si fa fallire il job in modo visibile. Meglio un dato
   di ieri che un dato falso oggi.
   ============================================================ */

import type { Appelli, Indice, Piano } from './tipi'

export interface Esito {
  ok: boolean
  /** Problemi che impediscono la pubblicazione */
  errori: string[]
  /** Anomalie da guardare, che non bloccano */
  avvisi: string[]
}

/** Sotto questa quota di voci rispetto alla volta scorsa si sospetta
 *  un parser rotto, non un cambio di piano. */
const CROLLO = 0.5

function confronta(cosa: string, ora: number, prima: number | undefined, e: Esito) {
  if (prima == null || prima === 0) return
  if (ora === 0) {
    e.errori.push(`${cosa}: adesso 0, prima ${prima}. Il parser sembra rotto.`)
    e.ok = false
  } else if (ora < prima * CROLLO) {
    e.errori.push(`${cosa}: da ${prima} a ${ora}, meno della metà. Sospetto parser rotto.`)
    e.ok = false
  } else if (ora < prima * 0.8) {
    e.avvisi.push(`${cosa}: da ${prima} a ${ora}. Calo sensibile, da guardare.`)
  }
}

export function controllaIndice(i: Indice, precedente?: Indice): Esito {
  const e: Esito = { ok: true, errori: [], avvisi: [] }
  if (i.corsi.length === 0) { e.errori.push('Indice senza corsi.'); e.ok = false }
  confronta('Corsi nell\'indice', i.corsi.length, precedente?.corsi.length, e)

  const codici = i.corsi.map(c => c.codice)
  const doppi = codici.filter((c, n) => codici.indexOf(c) !== n)
  if (doppi.length) {
    e.errori.push(`Codici corso duplicati: ${[...new Set(doppi)].join(', ')}`)
    e.ok = false
  }
  const senzaNome = i.corsi.filter(c => !c.nome.trim()).length
  if (senzaNome) { e.errori.push(`${senzaNome} corsi senza nome.`); e.ok = false }
  return e
}

export function controllaPiano(p: Piano, precedente?: Piano): Esito {
  const e: Esito = { ok: true, errori: [], avvisi: [] }
  if (p.insegnamenti.length === 0) { e.errori.push(`Piano ${p.codiceCorso}/${p.coorte} senza insegnamenti.`); e.ok = false }
  confronta(`Insegnamenti di ${p.codiceCorso}/${p.coorte}`, p.insegnamenti.length, precedente?.insegnamenti.length, e)

  const codici = p.insegnamenti.map(i => i.codice)
  const doppi = codici.filter((c, n) => codici.indexOf(c) !== n)
  if (doppi.length) { e.errori.push(`Insegnamenti duplicati: ${[...new Set(doppi)].join(', ')}`); e.ok = false }

  const senzaCfu = p.insegnamenti.filter(i => i.cfu <= 0)
  if (senzaCfu.length) e.avvisi.push(`${senzaCfu.length} insegnamenti con 0 CFU: ${senzaCfu.slice(0, 3).map(i => i.nome).join(', ')}`)

  // I CFU del piano: si conta una sola alternativa per gruppo
  // opzionale, altrimenti si sommano scelte che si escludono.
  const fuoriGruppo = p.insegnamenti.filter(i => !i.gruppo).reduce((n, i) => n + i.cfu, 0)
  const daiGruppi = p.gruppi.reduce((n, g) => n + (g.cfuRichiesti ?? 0), 0)
  const totale = fuoriGruppo + daiGruppi
  if (totale > 0 && (totale < 60 || totale > 400)) {
    e.avvisi.push(`CFU del piano fuori scala: ${totale}. Atteso fra 60 e 400.`)
  }

  // Un modulo che ha gli stessi CFU del padre e nessun fratello è
  // sospetto: probabile errore di annidamento.
  for (const i of p.insegnamenti) {
    const somma = i.moduli.reduce((n, m) => n + m.cfu, 0)
    if (i.moduli.length && somma !== i.cfu) {
      e.avvisi.push(`«${i.nome}»: i moduli fanno ${somma} CFU, il padre ${i.cfu}.`)
    }
  }
  return e
}

export function controllaAppelli(a: Appelli, precedente?: Appelli): Esito {
  const e: Esito = { ok: true, errori: [], avvisi: [] }
  confronta(`Appelli di ${a.codiceCorso}`, a.appelli.length, precedente?.appelli.length, e)

  const oggi = new Date().toISOString().slice(0, 10)
  const futuri = a.appelli.filter(x => x.data >= oggi).length
  if (a.appelli.length > 0 && futuri === 0) {
    e.avvisi.push('Nessun appello futuro: la pagina potrebbe non essere ancora aggiornata.')
  }

  for (const x of a.appelli) {
    if (x.prenotazioniDal && x.prenotazioniAl && x.prenotazioniAl < x.prenotazioniDal) {
      e.avvisi.push(`«${x.nome}» ${x.data}: le prenotazioni chiudono prima di aprire.`)
    }
    if (x.prenotazioniAl && x.prenotazioniAl > x.data) {
      e.avvisi.push(`«${x.nome}» ${x.data}: le prenotazioni chiudono dopo l'appello.`)
    }
  }

  // Un alias che punta a sé stesso o che forma una catena manderebbe
  // in confusione l'abbinamento nell'app.
  for (const [da, verso] of Object.entries(a.alias)) {
    if (da === verso) { e.errori.push(`Alias circolare: ${da}`); e.ok = false }
    if (a.alias[verso]) { e.errori.push(`Catena di alias: ${da} → ${verso} → ${a.alias[verso]}`); e.ok = false }
  }
  return e
}

export function riassumi(nome: string, e: Esito): string {
  const parti = [`${e.ok ? 'ok' : 'BLOCCATO'} · ${nome}`]
  for (const x of e.errori) parti.push(`  errore: ${x}`)
  for (const x of e.avvisi) parti.push(`  avviso: ${x}`)
  return parti.join('\n')
}
