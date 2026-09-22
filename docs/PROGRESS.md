# Stato del lavoro

Aggiornato: 22 settembre 2026 · fase corrente: **1 conclusa, in attesa di ok per la 2**

---

## Fase 0 — Analisi ✅

Nessun file modificato. Riepilogo di quel che è emerso e che vale anche
per le fasi successive.

**Stack.** React 18 + TypeScript 5.7 + Vite 6, nessuna libreria UI, CSS
scritto a mano con design token. 5.508 righe in `src/`. Wrapper iOS con
Capacitor 8 già funzionante, notifiche locali incluse.

**I tre nodi strutturali trovati**

1. *Dati pubblici e personali erano la stessa cosa.* All'onboarding il
   piano del catalogo veniva clonato nello stato utente con **id casuali**,
   e il campo `codice` non era mai valorizzato. Nessun aggiornamento del
   catalogo poteva raggiungere il piano, e non c'era nulla su cui agganciare
   Infostud. → risolto in Fase 1.
2. *Il modello non aveva i concetti necessari*: coorte, moduli, gruppi
   opzionali, alias di codice, stato delle sync. → parzialmente risolto
   (sync), il resto arriva con la pipeline in Fase 2.
3. *`localStorage` non regge il multi-corso*: 4 KB oggi con un corso solo,
   ma 318 corsi con piani, appelli e programmi sfondano i 5 MB. → risolto
   in Fase 1 con IndexedDB per il catalogo.

**Decisioni prese**

| Decisione | Perché |
|---|---|
| Carriera in localStorage, catalogo in IndexedDB | La carriera è piccola e serve subito all'avvio (sincrona, niente sfarfallio); il catalogo è grande, arriva dalla rete e ha bisogno di transazioni e spazio |
| Chiavi derivate dal dato, non casuali | È l'unico modo perché il catalogo aggiorni il piano e Infostud trovi dove agganciarsi |
| Pipeline in `pipeline/` nello stesso repo, su GitHub Actions | Il repo è pubblico → minuti Actions gratis e illimitati; su repo privato i 53 min/giorno degli appelli sforerebbero i 2.000 min/mese |
| JSON su GitHub Pages accanto all'app | Stesso dominio, niente CORS, URL base configurabile |
| Programmi dei canali **a richiesta** | 318 corsi × ~25 insegnamenti = ~8.000 pagine × 10 s = 22 ore: non stanno in un job giornaliero. Li scarica l'app quando apri un esame |
| Sync Infostud solo nell'app nativa | Il browser non può incorporare il login né leggere i dati di un altro sito. Il sito resta pienamente usabile con inserimento manuale (punto 7 del progetto) |

**Fatti verificati sulle fonti**

- `corsidilaurea.uniroma1.it/robots.txt` **consente** `/it/course/` (vietati
  solo admin, user, search) ma impone **`Crawl-delay: 10`**, non 1 req/s.
  Budget: appelli di tutti i corsi ≈ 53 min/giorno; piani su 2 coorti
  ≈ 1,8 h/settimana; programmi ≈ 22 h → a richiesta.
- Il catalogo elenca **318 corsi in una pagina sola**, senza paginazione.
- La pagina appelli di Design ha **42 tabelle, 646 righe** e mescola due
  codici corso (33426 e 31807): serve il filtro per coorte e la tabella
  di alias, come previsto.
- **L'orario non richiede `app.arc.uniroma1.it`.** La pagina orario del
  catalogo carica gli eventi da
  `corsidilaurea.uniroma1.it/it/services/gomp/timetable-data/{codice}`,
  cioè da un host che il robots.txt consente. L'`ArchitetturaAdapter`
  diventa superfluo: al suo posto un `GompAdapter`.
- **Il feed GOMP etichetta anno e canale solo per una parte delle
  lezioni.** Il campo `filters` di Design dichiara `course_years: [1, 2]`,
  e ~12 insegnamenti su 20 hanno `course_years: []`. Un primo tentativo di
  dedurre l'anno per quelle righe ha prodotto lezioni del secondo anno
  attribuite al primo, ed è stato annullato. Regola: si usano solo le righe
  con anno e canale dichiarati.
- I workflow schedulati vengono disattivati dopo **60 giorni senza commit**
  su repo pubblici. La pipeline committa dati ogni giorno e si tiene viva
  da sola; se i dati non cambiano non c'è commit → serve un file di
  battito con la data dell'esecuzione.

---

## Fase 1 — Fondamenta dati locali ✅

**1. Test prima di toccare.** Vitest + happy-dom + fake-indexeddb. Scritti
**90 test** che fissano il comportamento esistente *prima* del refactor:
medie ponderate e aritmetiche, idoneità, lode, esclusioni dalla media, base
di laurea, simulatore, andamento, date (inclusi cambio d'ora e anni
bisestili), selettori delle lezioni. Da qui in poi nessun calcolo di
carriera cambia per sbaglio.

**2. Chiavi stabili** (`src/lib/chiavi.ts`). L'id di un insegnamento è
derivato dal dato:

- `cat:{codice}` — dal catalogo, con codice ufficiale (arriverà in Fase 2);
- `piano:{corso}:{slug}` — dal piano, finché il codice non c'è;
- `man:{slug}:{casuale}` — aggiunto a mano, mai sovrascritto dal catalogo.

Nello stesso modulo l'abbinamento a tre livelli richiesto dal progetto:
codice (con alias) → nome normalizzato + CFU → ambiguo. **Non esiste un
abbinamento "per somiglianza"**: indovinare significherebbe attribuire un
voto all'esame sbagliato.

**3. Deposito** (`src/lib/deposito.ts`). Carriera in localStorage,
catalogo in IndexedDB con schema versionato (`VERSIONE_SCHEMA = 2`) e sei
archivi (`corsi`, `piani`, `appelli`, `orari`, `programmi`, `meta`).
Scritture multiple in una transazione sola. Testato con 6 MB di dati, cioè
oltre il soffitto di localStorage.

**4. Migrazione** (`src/lib/migrazione.ts`). v1 → v2 riscrive gli id
casuali in chiavi stabili e con essi tutti i riferimenti di esami, appelli
e lezioni. Verificata sull'app reale: voto e note personali, lode,
prenotazione col suo appello, lezione — tutto conservato, media invariata.
È idempotente e regge dati corrotti, array vuoti, esami orfani e nomi
duplicati (due omonimi non si fondono: si perderebbe un voto).

**Due difetti trovati dai test durante il lavoro**

- Un array vuoto in `localStorage` passava per stato valido e faceva
  **saltare l'onboarding** con zero dati.
- L'avviso sulle voci illeggibili non veniva mai emesso, perché il filtro
  avveniva prima del conteggio.

### TODO aperti

- [ ] In v1 non c'è modo di distinguere un insegnamento aggiunto a mano da
  uno del piano: la migrazione assegna a tutti una chiave `piano:` quando
  il profilo ha un corso. Quando la Fase 2 porterà il piano vero, le chiavi
  `piano:` senza corrispondenza andranno **retrocesse a `man:`**.
- [ ] La chiave `libretto:v1` resta su disco dopo la migrazione, come rete
  di sicurezza. Da rimuovere dopo qualche versione.
- [ ] Il catalogo IndexedDB è pronto ma ancora vuoto: lo riempie la Fase 2.
- [ ] `Insegnamento.codice` esiste ma nessuno lo valorizza: lo farà la
  pipeline.

---

## Prossima: Fase 2 — Pipeline dati pubblici

In attesa di conferma. Previsto: `pipeline/` in Node+TypeScript con
cheerio, scraper di indice, piani per coorte e appelli, validazione con
zod, fixture HTML reali, controlli di plausibilità, workflow schedulato.
Per gli orari: `CuratedAdapter` (file mantenuti a mano) e `GompAdapter`
(endpoint JSON su host consentito, solo righe con anno e canale
dichiarati).

**Serve da te**: nulla per iniziare. Per la Fase 5 (Infostud): URL di
login, host coinvolti, endpoint e risposte di esempio con dati finti.
