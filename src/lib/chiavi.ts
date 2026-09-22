/* ============================================================
   Chiavi stabili e normalizzazione dei nomi.

   Oggi l'id di un insegnamento è casuale: nasce all'onboarding e
   non significa niente. Così il catalogo non può aggiornare il
   piano di chi ce l'ha già, e non c'è nulla su cui agganciare gli
   esami che arriveranno da Infostud.

   Da qui in poi l'id è *derivato* dal dato: stesso insegnamento →
   stessa chiave, su qualunque telefono e dopo qualunque
   reinstallazione.
   ============================================================ */

/** Toglie accenti, punteggiatura e doppi spazi: serve a confrontare
 *  nomi che le fonti scrivono in modi diversi
 *  ("Storia dell’industria" / "STORIA DELL'INDUSTRIA"). */
export function normalizza(testo: string): string {
  return testo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')      // via gli accenti
    .toLowerCase()
    .replace(/['’`´]/g, ' ')              // apostrofi come separatori
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/** Versione compatta adatta a entrare in una chiave. */
export function slug(testo: string, max = 48): string {
  return normalizza(testo).replace(/ /g, '-').slice(0, max)
}

/* ---------------- Costruzione delle chiavi ---------------- */

/** Insegnamento che viene dal catalogo, con il suo codice ufficiale.
 *  È la chiave migliore: sopravvive ai cambi di nome. */
export function chiaveDaCodice(codice: string): string {
  return `cat:${codice.trim().toLowerCase()}`
}

/** Insegnamento dal catalogo di cui non conosciamo ancora il codice
 *  (è il caso del piano Design finché la pipeline non lo porta).
 *  Dipende dal corso, così due corsi con un esame omonimo restano
 *  distinti. */
export function chiaveDaPiano(corsoId: string, nome: string): string {
  return `piano:${corsoId}:${slug(nome)}`
}

/** Insegnamento aggiunto a mano. Porta un suffisso casuale perché
 *  nulla vieta di inserire due volte lo stesso nome. */
export function chiaveManuale(nome: string, casuale: () => string): string {
  return `man:${slug(nome, 32)}:${casuale()}`
}

/** Una chiave nata a mano non va mai sovrascritta dal catalogo. */
export function eManuale(chiave: string): boolean {
  return chiave.startsWith('man:')
}

/** Una chiave "piano:" è provvisoria: quando la pipeline porta il
 *  codice ufficiale va promossa a "cat:". */
export function eProvvisoria(chiave: string): boolean {
  return chiave.startsWith('piano:')
}

/* ---------------- Abbinamento ---------------- */

export interface Abbinabile {
  chiave: string
  nome: string
  cfu: number
  codice?: string
}

export type EsitoAbbinamento<T> =
  | { esito: 'codice'; voce: T }
  | { esito: 'nome_cfu'; voce: T }
  | { esito: 'ambiguo'; candidati: T[] }
  | { esito: 'nessuno' }

/** Cerca fra `voci` quella che corrisponde a `cercata`.
 *  L'ordine è quello indicato nel progetto: prima il codice (con gli
 *  alias), poi nome normalizzato più CFU. Se restano più candidati
 *  non sceglie: lo dice, e deciderà una schermata di conferma.
 *  Non c'è nessun abbinamento "per somiglianza": indovinare qui
 *  significa attribuire un voto all'esame sbagliato. */
export function abbina<T extends Abbinabile>(
  cercata: { nome: string; cfu?: number; codice?: string },
  voci: T[],
  alias: Record<string, string> = {},
): EsitoAbbinamento<T> {
  if (cercata.codice) {
    const canonico = alias[cercata.codice] ?? cercata.codice
    const perCodice = voci.filter(v => {
      if (!v.codice) return false
      return (alias[v.codice] ?? v.codice) === canonico
    })
    if (perCodice.length === 1) return { esito: 'codice', voce: perCodice[0] }
    if (perCodice.length > 1) return { esito: 'ambiguo', candidati: perCodice }
  }

  const n = normalizza(cercata.nome)
  let perNome = voci.filter(v => normalizza(v.nome) === n)
  if (perNome.length > 1 && cercata.cfu != null) {
    const conCfu = perNome.filter(v => v.cfu === cercata.cfu)
    if (conCfu.length > 0) perNome = conCfu
  }
  if (perNome.length === 1) return { esito: 'nome_cfu', voce: perNome[0] }
  if (perNome.length > 1) return { esito: 'ambiguo', candidati: perNome }

  return { esito: 'nessuno' }
}
