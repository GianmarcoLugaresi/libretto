/* ============================================================
   Deposito locale.

   Due archivi, perché i due tipi di dato hanno esigenze opposte:

   - la CARRIERA (voti, prenotazioni, profilo) è piccola — qualche
     decina di KB — e serve subito all'avvio: resta in localStorage,
     che è sincrono e non fa sfarfallare la prima schermata;
   - il CATALOGO (318 corsi, piani, appelli, programmi) è grande e
     arriva dalla rete: va in IndexedDB, che è asincrono, ha
     transazioni vere e non ha il soffitto dei 5 MB.

   La regola che tiene insieme tutto: la sincronizzazione pubblica
   scrive solo nel catalogo, non tocca mai la carriera.
   ============================================================ */

import type { Stato, StatoSync } from './types'

export const VERSIONE_SCHEMA = 3
const CHIAVE_CARRIERA = 'mysapienza:carriera'
/** Lo schema v1 stava tutto qui: serve solo più a migrare. */
export const CHIAVE_V1 = 'libretto:v1'

/** Quello che finisce su disco per la carriera: è lo stato stesso
 *  dell'app, così non esistono due modelli da tenere allineati. */
export type Carriera = Stato
export type { StatoSync }

/* ---------------- Carriera (localStorage) ---------------- */

export interface DepositoCarriera {
  leggiGrezzo(): unknown | null
  scrivi(c: Carriera): void
  cancella(): void
}

export function depositoCarriera(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = localStorage,
): DepositoCarriera {
  return {
    leggiGrezzo() {
      try {
        // Prima lo schema nuovo; se manca, si guarda il vecchio:
        // la migrazione decide poi cosa farne.
        const nuovo = storage.getItem(CHIAVE_CARRIERA)
        if (nuovo) return JSON.parse(nuovo)
        const vecchio = storage.getItem(CHIAVE_V1)
        return vecchio ? JSON.parse(vecchio) : null
      } catch {
        // Dati illeggibili o storage negato (Safari privato): si
        // riparte puliti invece di lasciare l'app in pagina bianca.
        return null
      }
    },
    scrivi(c) {
      try { storage.setItem(CHIAVE_CARRIERA, JSON.stringify(c)) } catch { /* quota o storage negato */ }
    },
    cancella() {
      try { storage.removeItem(CHIAVE_CARRIERA); storage.removeItem(CHIAVE_V1) } catch { /* ignora */ }
    },
  }
}

/* ---------------- Catalogo (IndexedDB) ---------------- */

export const ARCHIVI = ['corsi', 'piani', 'appelli', 'orari', 'programmi', 'meta'] as const
export type Archivio = (typeof ARCHIVI)[number]

const NOME_DB = 'mysapienza'

export interface DepositoCatalogo {
  metti(archivio: Archivio, chiave: string, valore: unknown): Promise<void>
  mettiMolti(archivio: Archivio, voci: { chiave: string; valore: unknown }[]): Promise<void>
  prendi<T>(archivio: Archivio, chiave: string): Promise<T | undefined>
  tutti<T>(archivio: Archivio): Promise<T[]>
  chiavi(archivio: Archivio): Promise<string[]>
  togli(archivio: Archivio, chiave: string): Promise<void>
  svuota(archivio: Archivio): Promise<void>
  chiudi(): void
}

function promessa<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((ok, no) => {
    req.onsuccess = () => ok(req.result)
    req.onerror = () => no(req.error)
  })
}

/** Apre il database e applica le migrazioni di schema.
 *  Ogni versione aggiunge i suoi archivi senza toccare i dati già
 *  presenti: `onupgradeneeded` è l'unico posto dove la struttura
 *  può cambiare, e va tenuto esplicito. */
export function apriCatalogo(indexedDB_: IDBFactory = indexedDB): Promise<DepositoCatalogo> {
  return new Promise((ok, no) => {
    const req = indexedDB_.open(NOME_DB, VERSIONE_SCHEMA)

    req.onupgradeneeded = () => {
      const db = req.result
      for (const a of ARCHIVI) {
        if (!db.objectStoreNames.contains(a)) db.createObjectStore(a)
      }
    }
    req.onerror = () => no(req.error)
    req.onsuccess = () => {
      const db = req.result
      const con = <T>(archivio: Archivio, modo: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
        const tx = db.transaction(archivio, modo)
        return promessa(f(tx.objectStore(archivio)))
      }
      ok({
        metti: (a, k, v) => con(a, 'readwrite', s => s.put(v, k)).then(() => undefined),
        mettiMolti: (a, voci) => new Promise((fatto, errore) => {
          // Una transazione sola per tutte le voci: o entrano tutte
          // o non entra niente.
          const tx = db.transaction(a, 'readwrite')
          const store = tx.objectStore(a)
          for (const { chiave, valore } of voci) store.put(valore, chiave)
          tx.oncomplete = () => fatto()
          tx.onerror = () => errore(tx.error)
          tx.onabort = () => errore(tx.error)
        }),
        prendi: <T,>(a: Archivio, k: string) => con<T | undefined>(a, 'readonly', s => s.get(k) as IDBRequest<T | undefined>),
        tutti: <T,>(a: Archivio) => con<T[]>(a, 'readonly', s => s.getAll() as IDBRequest<T[]>),
        chiavi: a => con<IDBValidKey[]>(a, 'readonly', s => s.getAllKeys()).then(k => k.map(String)),
        togli: (a, k) => con(a, 'readwrite', s => s.delete(k)).then(() => undefined),
        svuota: a => con(a, 'readwrite', s => s.clear()).then(() => undefined),
        chiudi: () => db.close(),
      })
    }
  })
}
