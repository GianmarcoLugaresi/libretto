# MySapienza → app per tutti gli studenti Sapienza

Prompt di lavoro per Claude Code. Leggilo tutto prima di iniziare e rileggilo all'inizio di ogni fase.

**Obiettivo in una frase:** trasformare l'app attuale (funzionante, con i dati di Design L-4 inseriti una volta sola) in un'app per tutti i corsi Sapienza, *local-first*, con dati pubblici aggiornati ogni giorno senza AI e con la carriera dello studente sincronizzata da Infostud solo quando serve.

---

## 0. Come devi lavorare

- Sei lo sviluppatore principale di questa app. L'app esiste, funziona e ha una UI che mi piace: il lavoro è farla evolvere, **non rifarla**.
- Lavora **a fasi** (sezione 8), una alla volta. All'inizio di ogni fase presentami il piano dettagliato. Alla fine: build + test, commit con messaggi chiari, riepilogo (cosa hai fatto, file toccati, come lo verifico io passo per passo, cosa ti serve da me). Poi **fermati e aspetta il mio ok**.
- La **Fase 0 è solo analisi**: non modificare nessun file finché non approvo il piano.
- Non inventare mai dati che non hai (endpoint Infostud, struttura di pagine che non hai visto, selettori). Crea un'interfaccia, un mock con dati finti, un `TODO` chiaro, e chiedimelo.
- Mantieni le convenzioni già presenti nel progetto (lingua dei nomi nel codice, struttura cartelle, stile, librerie). I testi dell'interfaccia sono in italiano. I nomi di entità e file in questo documento sono indicativi: adattali al progetto.
- Tieni aggiornato `docs/PROGRESS.md`: stato delle fasi, decisioni prese e perché, TODO aperti. Deve bastare per riprendere il lavoro da una sessione nuova.
- In Fase 0 proponimi un `CLAUDE.md` con le regole della sezione 3 e i comandi di build/test, così restano valide in ogni sessione.
- Costi: preferisci soluzioni gratuite o quasi (es. GitHub Actions e GitHub Pages o equivalenti).
- Se qualcosa in questo documento è in conflitto con quello che trovi nel codice o ti sembra sbagliato, dimmelo invece di forzarlo.

---

## 1. Contesto

**Stato attuale**
- App funzionante con UI completa. Mostra i dati del corso di Design (L-4, codice 33426) scaricati **una volta sola** e messi nel progetto in modo statico (piano/programma ed eventuali orari). Nessun collegamento a Infostud.
- Se l'app salva già esami o statistiche dell'utente, quei dati vanno **migrati senza perderli**.

**Obiettivo**
- App per **tutti** gli studenti Sapienza: qualsiasi corso, coorte, anno, canale.
- **Local-first**: l'app legge sempre dal database locale, si apre subito e funziona offline.
- Dati pubblici (corsi, piani di studio, programmi, appelli, orari dove disponibili) aggiornati **ogni giorno, automaticamente, senza AI**, da una pipeline che produce JSON statici.
- Carriera dello studente (esami sostenuti, voti, prenotazioni) da **Infostud solo su richiesta**, tipicamente dopo un esame. Per il resto del tempo nessun login.
- Deve distinguersi da Studenti Roma (app non ufficiale esistente che richiede l'accesso a Infostud a ogni utilizzo) per: dati salvati in locale, sync intelligente, statistiche fatte bene, notifiche utili, privacy (nessun dato personale lascia il telefono).

---

## 2. Fatti già verificati

Non devi riscoprirli, ma verificali quando implementi le parti che li usano.

### Catalogo dei corsi — https://corsidilaurea.uniroma1.it (pubblico, HTML)
- `/it` elenca i corsi con codice e classe (es. `33426 · L-4`).
- `/it/course/{codice}` è la scheda del corso; `/it/course/{codice}/announcements` gli avvisi; `/it/archive/` l'archivio delle coorti precedenti.
- `/it/course/{codice}/attendance/lessons-plan` elenca tutti gli insegnamenti con codice, nome, SSD, lingua, anno, semestre e CFU. Ha un **selettore dell'anno di riferimento (coorte)**. Per Design la coorte 2024/2025 ha codice corso **31807**, mentre 2025/2026 e 2026/2027 hanno **33426**. Quindi il piano dipende dalla coorte e il codice corso può cambiare tra coorti.
  - **Corsi integrati**: la riga padre ha codice e CFU totali (es. FONDAMENTI DI DISEGNO, 12 CFU). I moduli sotto non hanno codice (GEOMETRIA DESCRITTIVA 6 CFU, DISEGNO DIGITALE 6 CFU). Voto e CFU appartengono al padre; i moduli servono per lezioni e orari. **Non contare due volte i CFU.**
  - **Gruppi opzionali**: es. "1° gruppo opzionale: lo studente deve acquisire 12 CFU fra i seguenti esami".
  - **Attività senza voto** (idoneità, tirocinio, prova finale), spesso con codici `AAF…` (es. AAF1101 Lingua inglese).
- **Pagina insegnamento**: `/it/course/{codice}/attendance/lesson/{uuid}/{anno}/{semestre}/{uuid}[/{uuid}]`, con scelta del canale tramite `?channel=0`, `?channel=1`… I link si ricavano dalla pagina lessons-plan. La pagina del canale contiene:
  - docenti, programma, testi, modalità d'esame e frequenza;
  - un riepilogo con codice insegnamento, anno e semestre, SSD, CFU e ore.
- **Appelli**: `/it/course/{codice}/attendance/exams`. Sono raggruppati per insegnamento ("codice | NOME"), con una tabella: Codice corso, Docente, Data inizio prenotazione, Data fine prenotazione, Data appello.
  - Contiene righe di **più coorti** nella stessa pagina (codice corso 33426 e 31807).
  - Lo **stesso esame compare con codici diversi** tra ordinamenti (es. Teoria della forma 10600096 e 10622522; Istituzioni di Matematica 10622515 e 1026553). Serve una tabella di alias.
  - Lo stesso appello ha più righe, una per docente/canale. Deduplica per (codice, data) tenendo la lista dei docenti.
- A inizio anno il catalogo avvisa che i contenuti del nuovo anno accademico sono in aggiornamento. Dati parziali sono normali: la pipeline deve tollerarli e riprovare.

### Orari delle lezioni
- Non esiste una fonte unica né un'API ufficiale: ogni facoltà pubblica a modo suo (pagine HTML, PDF, siti propri).
- **Architettura (Design)**: web app `https://app.arc.uniroma1.it/didattica/orario/{slug}` (Design triennale = `de`). Ha una legenda delle sedi: V via Gramsci 53, Y via Fortuny, F via Flaminia 70, G via Gianturco 2, B piazza Borghese 9. Gli orari 2026/27 sono pubblicati come provvisori.
- **Robots.txt**: nei miei test il robots.txt di `app.arc.uniroma1.it` e quello di `gomp.uniroma1.it` non consentono l'accesso automatico. Verificalo e rispettalo: **non fare scraping di queste pagine**. Ti fornirò io una copia HTML salvata dal browser per scrivere e testare il parser. L'adattatore resta disattivato finché non ottengo il permesso dalla Facoltà.
- Le aule possono cambiare all'ultimo momento. Mostra sempre la data di aggiornamento e il link alla fonte ufficiale.

### Infostud
- Non c'è un'API pubblica. L'accesso a Infostud è **solo con SPID o CIE** (obbligo di legge); matricola e password non valgono per Infostud.
- Le librerie non ufficiali esistenti (OpenStud Driver e simili) usano matricola e password. **Non usarle**: non è verificato che funzionino ancora, e OpenStud è GPL-3.0.
- Infostud ha un frontend moderno (PWA). Con buona probabilità i dati arrivano da chiamate JSON: le individuerò io dagli strumenti per sviluppatori del browser.

### Marchio
- Il logo Sapienza è un marchio registrato: **non usarlo**. L'app deve dichiarare chiaramente di non essere ufficiale.

---

## 3. Regole non negoziabili

1. **Local-first.** La UI legge solo dal DB locale. La rete serve solo per gli aggiornamenti in background e per la sync Infostud avviata dall'utente.
2. **Niente AI/LLM**, né nella pipeline né nell'app: parsing deterministico con regole esplicite.
3. **Privacy.** I dati personali (esami, voti, prenotazioni, profilo) non lasciano mai il telefono. Nessun backend riceve dati personali, e niente analytics o crash report che li contengano.
4. **Credenziali.** Mai salvare password, cookie, token o sessioni Infostud. La sessione della WebView viene distrutta a fine sync.
5. **WebView.** Esegui JavaScript solo quando la pagina è su un host Infostud consentito, mai sulle pagine del provider SPID/CIE. Lo script è incluso nell'app, mai scaricato da remoto.
6. **Fonti pubbliche.** Regole di cortesia per la pipeline:
   - rispetta robots.txt;
   - al massimo 1 richiesta al secondo per host;
   - User-Agent descrittivo con email di contatto (placeholder);
   - cache con ETag/Last-Modified;
   - stop con backoff su 403/429/5xx.
7. L'app deve funzionare **completamente anche senza Infostud** (inserimento manuale).
8. **Non ridisegnare la UI esistente.** Riusa componenti, stile e navigazione; le nuove schermate devono sembrare parte della stessa app.
9. **Nome e disclaimer.** Il nome dell'app sta in un'unica costante di configurazione, perché potrei cambiarlo. Nessun logo Sapienza. Il disclaimer "App non ufficiale, non affiliata a Sapienza Università di Roma" compare in onboarding e impostazioni.
10. **Dati di test.** Non chiedermi mai credenziali reali, cookie o dati personali non anonimizzati, e non committare fixture con dati personali reali.

---

## 4. Architettura target

```
Fonti pubbliche Sapienza (catalogo, appelli, orari consentiti)
  │  pipeline giornaliera (cron) — parsing deterministico, niente AI
  ▼
JSON statici versionati (index.json + file per corso/coorte) su hosting statico
  │  sync pubblica in background: scarica solo i file cambiati
  ▼
App → DB locale → UI (orari, esami, statistiche, notifiche locali)
          ▲
          │  sync Infostud solo su richiesta (WebView SPID/CIE, sessione usa-e-getta)
      Infostud
```

---

## 5. Modello dati

### Dati pubblici (arrivano dalla pipeline, sovrascrivibili)
- `Course`:
  - codice, nome, classe (es. L-4), facoltà, durata, coorti disponibili;
  - CFU totali dal catalogo se presenti, altrimenti dal tipo di corso (laurea 180, magistrale 120, ciclo unico 300 o 360).
- `Cohort`: anno di immatricolazione (es. 2026/2027) → codice corso di quella coorte, curricula.
- `Teaching` (insegnamento = unità d'esame):
  - codice, nome, anno, semestre, CFU, SSD, lingua;
  - tipo (`graded` | `pass_fail` | `other`), gruppo opzionale se c'è, moduli.
- `Module`: nome, CFU, SSD, canali.
- `Channel`: indice (`channel=N`), etichetta, intervallo di lettere se ricavabile (es. A-Li), docenti, riferimento al programma.
- `Syllabus`: contenuti della pagina del canale (programma, testi, modalità d'esame, frequenza…), caricato solo quando serve.
- `OptionalGroup`: nome, CFU richiesti, insegnamenti.
- `ExamSession` (appello): codice insegnamento, codice corso, docenti[], apertura e chiusura prenotazioni, data appello.
- `CodeAlias`: codice → codice canonico (stesso esame tra ordinamenti diversi).
- `Lesson` (orario): insegnamento/modulo, canale, giorno o data, inizio, fine, aula, sede, fonte, data di aggiornamento.

### Dati dello studente (solo locali)
- `StudentProfile`:
  - corso, coorte, anno di corso, curriculum;
  - scelte nei gruppi opzionali, canale scelto per ogni insegnamento.
- `OfficialExamRecord` (da Infostud, sovrascritto a ogni sync): codice, nome, CFU, voto, lode, idoneità, data, `fetchedAt`.
- `ManualExamEntry` (inserito a mano): stessi campi più un flag `supersededBy` quando arriva il record ufficiale.
- `UserExamMeta` (mai toccato dalla sync): note, voto obiettivo, preferito.
- `Reservation`: prenotazioni, da Infostud o segnate a mano.
- `SyncState`: ultima sync pubblica, ultima sync Infostud, versioni e hash dei file.

### Regole di merge
- La sync Infostud fa upsert **solo** su `OfficialExamRecord`, per codice risolto con gli alias.
- Se un record ufficiale sparisce da Infostud, non cancellarlo in silenzio: segnalalo come "non più presente" e chiedi all'utente cosa fare.
- Se esiste un inserimento manuale per lo stesso esame, nelle statistiche vince il record ufficiale; quello manuale resta visibile come "sostituito".
- Abbinamento Infostud ↔ piano di studi:
  1. per codice, usando gli alias;
  2. poi per nome normalizzato + CFU;
  3. se resta ambiguo, schermata manuale "collega esame".

### Persistenza
- DB locale con versione dello schema e migrazioni esplicite.
- I dati di Design oggi statici diventano fixture/seed di test.
- Verifica che i dati dell'app rientrino nei backup del sistema operativo. Aggiungi anche esportazione e importazione manuale di un backup JSON, per il cambio telefono.

---

## 6. Pipeline dati pubblici

**Posizione e stack**
- Cartella `pipeline/` nello stesso repo oppure repo separato: proponimi tu.
- Linguaggio coerente con il progetto (es. Node/TypeScript con cheerio, oppure Python con BeautifulSoup/selectolax).

**Esecuzione e frequenze**
- Job giornaliero schedulato (es. GitHub Actions). Il cron è in UTC. Verifica i limiti attuali dei workflow schedulati (es. disattivazione dopo periodi di inattività del repository) e prevedi una contromisura.
- Frequenze:
  - appelli: ogni giorno;
  - elenco corsi, piani e programmi: una volta a settimana, o quando cambia l'hash della pagina;
  - orari: ogni giorno, solo per gli adattatori attivi.
- Scala: parti da una lista configurabile (Design 33426 più 2-3 corsi di facoltà diverse), poi abilita tutti i corsi. Il crawling è incrementale: non riscaricare pagine invariate.

**Parsing e controlli**
- Selettori espliciti, niente euristiche opache.
- Ogni parser ha test su **fixture HTML salvate**: lessons-plan, exams e una pagina canale di Design, più un corso di un'altra facoltà.
- Validazione: uno schema per ogni file di output (es. zod, JSON Schema o pydantic).
- Controlli di plausibilità: se un corso che aveva N insegnamenti ora ne ha 0 o molti meno, non pubblicare quel file. Tieni l'ultima versione buona e fai fallire il job in modo visibile (es. issue o notifica).

**Output** (versionato, con `schemaVersion` in ogni file)
- `data/v1/index.json`: elenco corsi (codice, nome, classe, facoltà, coorti), hash di ogni file, `generatedAt`.
- `data/v1/courses/{codice}/{coorte}/plan.json`: insegnamenti, moduli, canali, gruppi opzionali, alias.
- `data/v1/courses/{codice}/exams.json`: appelli deduplicati.
- `data/v1/courses/{codice}/{coorte}/timetable.json`: solo se c'è una fonte attiva.
- `data/v1/syllabi/{id}.json`: programmi, scaricati dall'app solo quando servono.
- Ogni file contiene `sources` (URL) e `fetchedAt`.
- Hosting statico (es. GitHub Pages). L'URL base è configurabile nell'app.

**Orari: adattatori**
L'interfaccia è `TimetableAdapter`: id, facoltà, `supports(courseCode)`, `fetch()` → `Lesson[]`, `enabled`. Implementa:
1. `ArchitetturaAdapter` per `app.arc.uniroma1.it`: parser scritto e testato sulla fixture che ti darò, **disattivato** (`enabled: false`) finché non ho il permesso.
2. `CuratedAdapter`: legge file mantenuti a mano in `pipeline/curated/timetables/`, in CSV o JSON e in un formato semplice da compilare. Serve per inserire in modo legittimo l'orario di Design (e di altri corsi).
3. Struttura pronta per aggiungere altre facoltà senza toccare il resto.

**README della pipeline**
Deve spiegare come eseguirla in locale, come aggiungere un corso o un adattatore e cosa fare quando un parser si rompe.

---

## 7. App: funzionalità

### Onboarding
- Disclaimer "non ufficiale" e spiegazione breve: i dati restano sul telefono, Infostud è opzionale.
- Ricerca del corso per nome o codice (da `index.json`), poi scelta di coorte (anno di immatricolazione), anno di corso e curriculum.
- Canali:
  - per ogni insegnamento dell'anno lo studente sceglie il canale;
  - se l'intervallo di lettere è noto, suggerisci il canale dall'iniziale del cognome;
  - il cognome non va salvato.
- Scelta tra "Collega Infostud" e "Inserisco a mano / più tardi".

### Orari
- Vista giornaliera e settimanale filtrata per i miei canali.
- "Prossima lezione", aula e sede con legenda, data di ultimo aggiornamento, link alla fonte ufficiale.
- Modifiche evidenziate rispetto alla versione precedente (es. aula cambiata).
- Se per il corso non c'è una fonte: messaggio chiaro, link alla pagina ufficiale e possibilità di aggiungere lezioni a mano.
- Esportazione in `.ics` e nel calendario del telefono.

### Esami e carriera
- Piano completo per anno e semestre, con stato (superato, prenotato, da fare), CFU e avanzamento dei gruppi opzionali (es. 6/12 CFU).
- Inserimento manuale: spunta dell'esame, voto 18–30, lode, idoneità, data.
- Dettaglio esame: programma del mio canale, docenti, prossimi appelli con finestre di prenotazione (evidenzia quelli dei docenti del mio canale), note e voto obiettivo.

### Statistiche (con test unitari sui casi limite)
- CFU acquisiti su totali, in percentuale. Le idoneità contano nei CFU, non nella media.
- Media aritmetica e media ponderata sui CFU, solo sugli esami con voto. La lode vale 30 di default ed è configurabile.
- Base di laurea = media ponderata × 110 / 30, con 2 decimali. I bonus di facoltà sono esclusi e la UI deve dirlo.
- Grafico dell'andamento della media nel tempo.
- Simulatore: aggiungo voti ipotetici e vedo come cambiano le medie.
- Obiettivo: data una media target, voto medio necessario negli esami rimanenti, oppure "non più raggiungibile".

### Notifiche locali (nessun server push)
- Apertura delle prenotazioni per gli esami del mio piano non ancora superati, e promemoria prima della chiusura (es. 2 giorni prima).
- Il giorno dopo un appello a cui sono prenotato: "Com'è andata? Quando è verbalizzato, aggiorna da Infostud". Se dopo la sync il voto non c'è ancora, ripeti dopo 7 giorni, al massimo 3 volte.
- Promemoria delle lezioni: opzionale, disattivato di default.
- Tutto configurabile nelle impostazioni.

### Sync dei dati pubblici
- All'apertura, se l'ultimo controllo risale a più di 6 ore prima, scarica `index.json` (con ETag), poi solo i file cambiati del mio corso.
- Non bloccare mai la UI. Offline, nessun errore invasivo.
- Mostra sempre "aggiornato il…".

### Impostazioni
Cambio di corso, coorte e canali; notifiche; "Cancella tutti i miei dati"; backup JSON (esporta/importa); informazioni, disclaimer e privacy.

---

## 8. Fasi di lavoro

**Fase 0 — Analisi (nessuna modifica ai file)**
- Stack, struttura, dove stanno i dati statici di Design, come vengono salvati oggi i dati utente, dipendenze, build e test esistenti.
- **Se l'app gira solo nel browser come web app**, la sync Infostud non si può fare: il browser non permette di incorporare il login di Infostud né di leggere i dati di un altro sito. In quel caso proponimi le opzioni (es. wrapper nativo come Capacitor, o altro) con pro e contro, e aspetta la mia scelta.
- Consegna:
  - riepilogo e rischi;
  - piano dettagliato delle fasi 1–7 adattato al progetto;
  - proposta di dove far girare la pipeline e dove ospitare i JSON;
  - proposta di `CLAUDE.md`.

**Fase 1 — Fondamenta dati locali**
- DB locale con schema versionato e repository/servizi.
- Migrazione dei dati statici di Design e degli eventuali dati utente. La UI funziona come prima.
- Criterio: test verdi, app identica per l'utente, nessuna regressione.

**Fase 2 — Pipeline dati pubblici**
- Scraper del catalogo: corsi, piani per coorte, insegnamenti, moduli, canali, programmi e appelli.
- Validazione, output JSON, workflow schedulato, fixture e test.
- Framework degli orari con `CuratedAdapter` e `ArchitetturaAdapter` disattivato.
- Criterio: esecuzione locale completa su Design e sui corsi di prova, JSON validi, job che fallisce in modo visibile se un parser si rompe.

**Fase 3 — Multi-corso nell'app**
- Onboarding, scelta di coorte, anno e canali, sync pubblica in background, offline, "aggiornato il".
- Criterio: posso scegliere un corso diverso da Design e vedere piano, appelli e orario (se disponibile). Dopo il primo download funziona anche in modalità aereo.

**Fase 4 — Carriera manuale e statistiche**
- Criterio: test unitari su medie, base di laurea, idoneità, lode, simulatore e obiettivo.

**Fase 5 — Sync Infostud**
- `MockInfostudProvider` con fixture anonimizzate.
- Flusso completo: WebView → estrazione → merge → pulizia della sessione.
- Poi l'implementazione reale, quando ti do endpoint e risposte di esempio.
- Criterio: con il mock il flusso è completo, il riepilogo è corretto e non resta nulla di persistente della sessione. Test sul merge.

**Fase 6 — Notifiche e sync intelligente**
- Notifiche locali, sync intelligente, export `.ics`.
- Widget "prossima lezione" solo se lo stack lo permette senza troppo costo: proponimelo.

**Fase 7 — Rifinitura**
- Gestione degli errori ovunque.
- Accessibilità: dimensione del testo, screen reader, contrasto.
- Stringhe pronte per l'inglese (i18n).
- Disclaimer e bozza di privacy policy (dati solo sul dispositivo, nessuna raccolta).
- README e checklist per la pubblicazione sugli store.

---

## 9. Specifica della sync Infostud

### Configurazione
Il file `infostud.config` contiene valori che ti darò io; finché mancano usa il mock.
- `loginUrl`
- `allowedHosts`: host Infostud su cui è permesso eseguire script.
- `isLoggedIn`: regola per capire che il login è riuscito (URL, elemento in pagina o presenza di un token nello storage).
- `auth`: `cookie` oppure `bearerFromStorage`, con la chiave in cui si trova il token.
- `endpoints`: esami sostenuti, esami da sostenere, prenotazioni, profilo.
- `timeoutMs`

### Flusso
1. Schermata di spiegazione: "Accederai con SPID o CIE sulle pagine ufficiali. L'app non vede né salva le tue credenziali. I dati restano sul telefono."
2. WebView con sessione **non persistente** se la piattaforma lo consente (es. data store non persistente su iOS); altrimenti pulizia completa alla fine.
3. Monitora la navigazione. Quando l'host è in `allowedHosts` e `isLoggedIn` è vero, esegui lo script di estrazione incluso nell'app:
   - chiama gli `endpoints` con `fetch` dalla pagina stessa, dove la sessione è già valida (aggiungendo il token letto dallo storage se `auth` è `bearerFromStorage`);
   - raccoglie le risposte JSON;
   - le passa all'app tramite il bridge della WebView.
4. Chiudi la WebView, mappa le risposte nei modelli (`InfostudMapper`, testato su fixture), fai il merge in una transazione e aggiorna `SyncState`.
5. Distruggi cookie, cache e storage della WebView.
6. Mostra un riepilogo, es. "2 nuovi esami, 1 prenotazione aggiornata".

### Robustezza e sicurezza
- Annullabile dall'utente in ogni momento, con timeout.
- Errori comprensibili: login non riuscito, Infostud non raggiungibile, formato cambiato ("la sincronizzazione va aggiornata, intanto puoi continuare a mano").
- Se il formato delle risposte cambia, il mapper fallisce in modo sicuro senza toccare i dati locali.
- Nessun log con il contenuto delle risposte in produzione; in debug solo dati anonimizzati.
- Interfaccia `InfostudProvider` con due implementazioni, `Mock` e `WebView`, così la UI non dipende dal metodo di login.
- Librerie WebView possibili in base allo stack (verifica che permettano di eseguire script e ricevere messaggi):
  - flutter_inappwebview (Flutter);
  - react-native-webview (React Native);
  - WKWebView (iOS nativo) e WebView (Android nativo);
  - con Capacitor serve un plugin di in-app browser che supporti l'esecuzione di script.

### Cosa ti fornirò io (non chiedermi altro)
- URL di login e host coinvolti.
- Per ogni endpoint: URL, metodo e un esempio di risposta **con dati finti** al posto di quelli veri.
- Una copia HTML della pagina orari di Design salvata dal browser, per la fixture dell'`ArchitetturaAdapter`.

---

## 10. Definizione di "fatto" per ogni fase

- Build senza errori, test verdi, nessuna regressione visibile nella UI esistente.
- Commit piccoli e descrittivi; `docs/PROGRESS.md` aggiornato.
- Riepilogo finale con: cosa è cambiato, come lo provo passo per passo, TODO aperti, cosa ti serve da me.

---

## 11. Assunzioni e cose da rivedere più avanti

- Se Sapienza o la Facoltà forniscono un export ufficiale (CSV, `.ics`, API), sostituisce lo scraping della fonte corrispondente.
- Se Infostud cambia il flusso di accesso, si aggiornano solo il provider WebView e la configurazione.
- Gli orari delle altre facoltà si aggiungono un adattatore alla volta, solo dove consentito.
- Possibili sviluppi futuri: widget, versione inglese completa, orari segnalati dai rappresentanti degli studenti.
