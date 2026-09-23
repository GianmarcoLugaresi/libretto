# Stato del lavoro

Aggiornato: 23 settembre 2026 · fase corrente: **5 conclusa (fatta prima della 4, su tua richiesta)**

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

## Fase 2 — Pipeline dati pubblici ✅

`pipeline/` in Node + TypeScript, nessuna AI: parser deterministici, lo
stesso HTML dà sempre lo stesso JSON. Dettagli operativi in
[`pipeline/README.md`](../pipeline/README.md). 128 test propri, 219 in
totale con quelli dell'app.

**Cosa c'è**

| File | Cosa fa |
|---|---|
| `src/tipi.ts` | Schemi zod, `VERSIONE_SCHEMA = 1`. Ogni file porta `schemaVersion`, `sources`, `fetchedAt` |
| `src/http.ts` | Crawl-delay per host, ETag, backoff su 429/5xx, host consentiti ed esclusi |
| `src/cache.ts` | ETag e Last-Modified fra un giro e l'altro, con scadenza a 7 giorni |
| `src/controlli.ts` | Cosa **non** si pubblica |
| `src/pubblica.ts` | Scrittura atomica, impronte, ultima versione buona |
| `src/esegui.ts` | Runner, argomenti, rotazione a fette |
| `src/parser/` | `indice.ts` (318 corsi), `piano.ts`, `appelli.ts` |
| `src/orari/` | `curato.ts` (CSV a mano), `gomp.ts` (feed del catalogo) |

**Verificato sul sito vero**, non solo sulle fixture: un giro
`--solo 33426 --compiti indice,appelli` ha prodotto 318 corsi
nell'indice e 212 appelli per Design con date e docenti reali.

**Le tre decisioni che contano**

1. *Una coorte è un altro codice corso*, non un parametro. Design 2024/25
   è `31807`, dal 2025/26 è `33426`. Si leggono dal
   `<select id="edit-year-course">` e si visita il codice di ciascuna. Il
   file viene scritto sotto il codice che **la pagina dichiara**, non
   sotto quello richiesto: dopo un redirect i due divergono, e un file il
   cui nome contraddice il contenuto è peggio di un file mancante.
2. *I piani ruotano su sette fette*, gli appelli no. Con Crawl-delay 10
   gli appelli di tutto il catalogo sono ~53 min e cambiano di continuo:
   si rifanno ogni notte. I piani cambiano una volta l'anno: `fettaDi()`
   li distribuisce con uno sha1 del codice, così in una settimana passano
   tutti una volta e ogni giro sta dentro un job.
3. *Un file identico non si riscrive.* Cambierebbe solo `fetchedAt`, ma
   basterebbe a far rimemorizzare a git tutto il catalogo ogni notte.
   Quindi `fetchedAt` = quando quel contenuto è stato preso,
   `generatedAt` dell'indice = quando abbiamo guardato.

**La rete di sicurezza.** Uno scraper raramente esplode: più spesso
restituisce zero righe, o metà. `controlli.ts` confronta il file nuovo
con quello pubblicato e blocca la scrittura se le voci crollano sotto
metà, se ci sono codici duplicati o se gli alias formano una catena.
Blocca anche `index.json`: un indice dimezzato nasconderebbe corsi che
stanno benissimo. Quando blocca, resta il file di ieri e il job fallisce
in modo visibile.

**Difetti trovati dai test durante il lavoro**

- Il `gompAdapter` scaricava per conto suo, fuori dal tetto di richieste
  e dalla cache del runner. Ora l'adattatore riceve il `prendi` del
  runner: una sola porta verso la rete, una sola politica di cortesia.
- Un orario CSV con `9:00` veniva rifiutato: la validazione confrontava
  `fine <= inizio` come stringhe **prima** di normalizzare, e `"11:00"` è
  minore di `"9:00"` in ordine alfabetico.
- L'indice veniva scritto senza passare dai controlli. Se ne è accorto il
  type-check, notando `controllaIndice` importato e mai usato.
- Il messaggio «indice non cambiato» compariva anche quando era
  `--limite` a fermare il giro: due cose diverse non devono leggersi
  uguali nel registro.

### TODO aperti dalla Fase 1

- [ ] Le chiavi `piano:` senza corrispondenza nel piano vero vanno
  **retrocesse a `man:`**. Ora che la pipeline produce i codici veri si
  può fare: tocca alla Fase 3, quando l'app leggerà il catalogo.
- [ ] `libretto:v1` resta su disco come rete di sicurezza. Da rimuovere
  dopo qualche versione.
- [x] Il catalogo IndexedDB è pronto ma vuoto → lo riempie la Fase 3
  leggendo i file della pipeline.
- [x] `Insegnamento.codice` ora ce l'ha chi lo produce: la pipeline.

### Rimasto da decidere

- **Lo `User-Agent` ha un contatto finto** (`placeholder@example.com` in
  `http.ts`). Prima di far girare il giro notturno sul serio va messo un
  indirizzo vero: è la cortesia minima verso chi gestisce il server.
- **Dove leggerà l'app.** I file vanno sul ramo `data`. Per servirli
  serve scegliere fra `raw.githubusercontent.com` (CORS aperto, cache 5
  min) e includerli nel deploy Pages. Decisione della Fase 3.

---

## Fase 3 — App multi-corso ✅

L'app legge il catalogo pubblico: tutti i 318 corsi, con piano, appelli e
orario della propria coorte, anche offline dopo il primo download.
301 test in totale.

**Cosa c'è**

| File | Cosa fa |
|---|---|
| `src/lib/dati.ts` | Funzioni leggere sul catalogo: disponibilità, coorte, appelli della coorte (con alias), ricerca |
| `src/lib/catalogoRemoto.ts` | Scarica, valida con gli schemi zod della pipeline, conserva in IndexedDB. Caricato dopo il primo disegno: zod pesa 27 KB |
| `src/lib/catalogoContesto.tsx` | Contesto React: sync in background ogni 6 ore e al ritorno in primo piano, mai bloccante |
| `src/lib/daCatalogo.ts` | Dal catalogo al libretto: nomi leggibili, tipi, CFU, orario, appelli, ricollegamento |
| `src/lib/app.ts` | Nome dell'app e disclaimer in una costante sola (regola 9) |

**Schermate**

- *Onboarding*: ricerca fra i 318 corsi per nome, codice o classe; scelta
  della coorte (con l'indicazione di quali hanno il piano); libretto
  riempito dal piano ufficiale di quella coorte, senza le alternative dei
  gruppi opzionali. Senza rete al primo avvio resta Design statico o
  «da zero». Disclaimer al primo passo.
- *Esplora*: tutti i corsi divisi per triennali e magistrali; per ognuno
  piano per anno e coorte, appelli in arrivo, orario (con le lezioni
  senza anno in una sezione a parte). «Aggiornato il…» sempre in fondo.
- *Dettaglio esame*: i prossimi appelli ufficiali di quell'insegnamento,
  con finestra di prenotazione. Toccarne uno compila la prenotazione;
  si scrive nel libretto solo con Salva.
- *Orario*: il foglio d'importazione accetta anche l'orario del catalogo.
  Quello trascritto a mano (Design) resta prioritario.
- *Profilo*: sezione «Dati pubblici» (aggiornato il…, aggiorna ora) e
  «Collega il libretto al catalogo» per chi ha un libretto nato prima.

**Verificato nel browser** con dati veri scaricati dalla pipeline per tre
corsi (Design, Ingegneria informatica, Medicina «A»): onboarding, Esplora,
dettaglio esame, e modalità aereo simulata. Offline il piano di Medicina
si apre dal telefono, e «Aggiorna ora» dice solo «ultimo tentativo senza
rete».

**Le scoperte fatte sui dati veri**

1. *Le coorti precedenti non erano raggiungibili.* La pagina del piano
   mostra solo la coorte più recente, e la pagina «nuda» di un codice
   vecchio (31807) dà un piano vuoto. Il form del sito rimanda a
   `lessons-plan?year=<anno>&code=<codice>`, in GET e senza sessione: ora
   la pipeline apre quello per ogni coorte. Le coorti hanno davvero piani
   diversi (Design: 27, 26 e 25 insegnamenti), quindi usare quello di
   un'altra sarebbe stato sbagliato.
2. *Le coorti sparivano dall'indice* nelle notti in cui un corso non veniva
   visitato (fette, 304, altri compiti). Ora si ereditano.
3. *La fetta toccava anche gli appelli*, che si sarebbero aggiornati una
   volta a settimana invece che ogni notte.
4. *Gli appelli delle coorti vecchie venivano scartati* (Design: 252 righe
   di 31807 accanto alle 212 di 33426). Ora si pubblicano tutti, e l'app
   filtra per la coorte dello studente. Due codici che la fonte dichiara
   alias, stessa data, sono lo stesso appello e si mostrano una volta.
5. *Il periodo degli orari veniva dall'anno solare*: da marzo avrebbe
   chiesto l'autunno dopo. Ora dipende dal semestre.
6. *I CFU di laurea non si prendono dalla somma del piano*: Medicina 2026
   somma 391 (due esami su due anni con codici diversi), Design 2024
   dichiara gruppi da «6 CFU» fra esami da 12. Li fissa la legge per tipo
   di corso; la somma resta un controllo.
7. *Per Ingegneria informatica e Medicina il feed degli orari non dichiara
   l'anno di nessuna lezione* (75 e 65). Tutto finisce fra le «senza anno»,
   dove lo studente sceglie; il piano dice l'anno solo come indicazione.

### TODO aperti

- [ ] **Primo giro completo.** Il ramo `data` non esiste ancora: il giro
  notturno non è mai partito. Il primo va lanciato a mano con tutte le fette
  (`fetta -1`, compiti `indice,appelli,piani`), circa 2 ore e mezza.
  Aspetta il tuo ok, perché sono ~900 richieste al sito Sapienza a nome del
  progetto.
- [ ] Medicina: esami con lo stesso nome in due anni consecutivi e codici
  diversi (Anatomia umana, Biochimica). Non li unisco senza vedere la
  pagina: se sono un esame solo, il libretto li conta due volte.
- [ ] Canali per insegnamento all'onboarding: il catalogo non li pubblica
  nel piano. Oggi il canale si sceglie importando l'orario.
- [ ] `libretto:v1` resta su disco come rete di sicurezza. Da rimuovere
  dopo qualche versione.

---

## Fase 5 — Sync Infostud ✅

Fatta prima della 4, su richiesta: i commit restano locali finché non
c'è anche Infostud. 339 test.

**Come funziona**

1. Profilo → «Aggiorna da Infostud» (solo nell'app per iPhone: il browser
   non può incorporare il login di un altro sito).
2. Spiegazione, col testo del prompt: SPID o CIE sulle pagine ufficiali,
   l'app non vede né salva le credenziali, i dati restano sul telefono.
3. Una WKWebView con archivio **non persistente** apre Infostud. In alto
   si vede sempre il dominio. Lo script dell'app gira solo a pagina
   caricata su `www.studenti.uniroma1.it`, mai sulle pagine SPID/CIE.
4. Dopo l'accesso la pagina chiama da sé `/phoenixws/studente/<matricola>/…
   ?ingresso=<sessione>` (visto sulle catture). Lo script ne ricava il
   prefisso, chiede `esamiall` e `prenotazioni`, e all'app passa **solo**
   `esito` e `ritorno`: matricola, sessione e `output` restano nella pagina.
5. La WebView si chiude dopo aver svuotato l'archivio; mapper e merge; il
   riepilogo («2 nuovi esami, 1 da collegare…»).

**Dove sta cosa**

| File | Cosa fa |
|---|---|
| `src/lib/infostud/mapper.ts` | Busta e campi; si ferma su tutto ciò che non torna |
| `src/lib/infostud/unisci.ts` | Merge con le regole del prompt, collegamento a mano |
| `src/lib/infostud/provider.ts` | Interfaccia, errori, `MockInfostudProvider` con scenari |
| `src/lib/infostud/webview.ts` | `WebViewInfostudProvider`, lato JS del plugin |
| `src/lib/infostud/script.ts` | Lo script nella pagina, provato come testo |
| `src/lib/infostud/config.ts` | `infostud.config`: cosa è visto e cosa da confermare |
| `plugins/infostud-webview/` | Plugin Capacitor locale in Swift |
| `src/components/SchedaInfostud.tsx`, `DaCollegare.tsx` | Il flusso e il collegamento a mano |

Schema v3: arriva l'area `infostud`, separata da ciò che scrive lo
studente. `esameDi` è l'unico punto che decide l'esito effettivo: il voto
ufficiale vince nelle statistiche, l'inserimento a mano resta com'era.

**Verificato**

- *Nel browser*, col provider di prova: flusso completo, riepilogo,
  collegamento di un esame fuori piano, statistiche coi voti ufficiali
  (media ponderata 27,75 = (12×28 + 6×30 + 6×25) / 24).
- *Sul simulatore iPhone*, col plugin vero contro un Infostud finto del
  server di sviluppo (con un finto SPID su un altro host): tutto il giro,
  due volte. La seconda dice solo «1 da collegare, 1 prenotazione».
- *Sul disco del simulatore*, cercando in UTF-8 e UTF-16 con un controllo
  positivo: nessun cookie della sessione (nemmeno uno persistente per un
  anno), niente storage della pagina, né sessione né matricola. Né durante
  né dopo. È il criterio della fase.

**Cosa resta da confermare sul vero**

- La pagina da cui parte il login (`config.ts`: `/phoenix/`). Se l'accesso
  comincia altrove, lo studente ci arriva navigando nella WebView.
- La forma di un esame vero e la lode: gli array di Giamma sono vuoti. Il
  mapper accetta le varianti delle fonti di terzi e, su un voto che non sa
  leggere, lo mostra com'è e chiede di controllare invece di indovinare.

### Come provarlo

- *Col provider di prova* (browser): `npm run dev`, Profilo → «Prova con
  dati finti», con cinque scenari fra cui gli errori.
- *Col plugin nativo sul simulatore*: server di sviluppo sulla porta 5174
  (`npx vite --port 5174 --host`), poi
  `VITE_INFOSTUD_PROVA=1 npm run build && npx cap sync ios`, e l'app dal
  simulatore. Ricordarsi di rifare la build normale dopo.
- *Sul vero*: `npm run ipa`, e sul telefono Profilo → «Aggiorna da
  Infostud». Con la carriera vuota di oggi il risultato atteso è «Nessuna
  novità»; un errore dice cosa sistemare.

---

## Prossima: Fase 4 — Carriera manuale e statistiche


Da `PROMPT_MYSAPIENZA.md`: piano con stato e avanzamento dei gruppi
opzionali (es. 6/12 CFU), inserimento manuale completo, statistiche coi
casi limite testati (idoneità, lode configurabile, base di laurea),
simulatore e obiettivo.

**Serve da te**: l'ok per il primo giro completo della pipeline e per il
push; una prova vera di «Aggiorna da Infostud» sul telefono.
