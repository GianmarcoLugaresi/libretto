# MySapienza — regole di lavoro

App locale-first per studenti Sapienza. React + TypeScript + Vite, wrapper
iOS con Capacitor. Il documento di riferimento è `PROMPT_MYSAPIENZA.md`;
lo stato del lavoro è in `docs/PROGRESS.md`: leggili entrambi a inizio
sessione.

## Non negoziabili

1. **Local-first.** La UI legge solo dal deposito locale. La rete serve per
   gli aggiornamenti in background e per la sync Infostud avviata
   dall'utente.
2. **Niente AI/LLM**, né nella pipeline né nell'app: parsing deterministico
   con regole esplicite.
3. **Privacy.** I dati personali non lasciano il dispositivo. Nessun backend
   li riceve, nessun analytics o crash report li contiene.
4. **Credenziali.** Mai salvare password, cookie, token o sessioni Infostud.
   La sessione della WebView si distrugge a fine sync.
5. **WebView.** Eseguire JavaScript solo su host Infostud consentiti, mai
   sulle pagine SPID/CIE. Lo script è incluso nell'app, mai scaricato.
6. **Fonti pubbliche.** Rispettare robots.txt — `corsidilaurea.uniroma1.it`
   impone `Crawl-delay: 10`, non una richiesta al secondo. User-Agent
   descrittivo con contatto, cache ETag/Last-Modified, stop con backoff su
   403/429/5xx. **Non fare scraping di `app.arc.uniroma1.it` né di
   `gomp.uniroma1.it`**: i loro robots.txt non lo consentono.
7. L'app deve funzionare **del tutto anche senza Infostud** (inserimento
   manuale).
8. **Non ridisegnare la UI esistente.** Riusare componenti, stile e
   navigazione; le schermate nuove devono sembrare parte della stessa app.
9. **Nome e disclaimer.** Il nome dell'app sta in un'unica costante. Nessun
   logo Sapienza. Il disclaimer "App non ufficiale, non affiliata a Sapienza
   Università di Roma" in onboarding e impostazioni.
10. **Dati di test.** Mai chiedere credenziali reali o dati personali non
    anonimizzati; mai committare fixture con dati personali reali.

## Regole nate dal lavoro sul codice

- **Mai dedurre un dato che la fonte non dichiara.** Il feed orari di GOMP
  etichetta anno e canale solo per una parte delle lezioni: le righe senza
  etichetta restano "non attribuite", non si indovinano. Attribuire una
  lezione all'anno sbagliato è peggio che non mostrarla.
- **Chiavi stabili.** L'id di un insegnamento è derivato dal dato
  (`src/lib/chiavi.ts`), mai casuale: è ciò che permette al catalogo di
  aggiornare il piano e a Infostud di agganciare gli esami. Gli id di
  appelli e lezioni restano casuali: sono entità locali senza identità
  esterna.
- **La sync pubblica non tocca mai la carriera.** Voti, note e prenotazioni
  sono dello studente; il catalogo aggiorna solo i dati pubblici.
- **Dati dello studente prima di tutto.** Qualunque migrazione conserva
  invece di scartare; se qualcosa non si capisce si tiene e si segnala.
- **Meglio un dato di ieri che un dato falso oggi.** Uno scraper raramente
  esplode: più spesso restituisce zero righe, o metà. `pipeline/src/controlli.ts`
  confronta col file già pubblicato e **blocca** la scrittura quando le voci
  crollano. Resta la versione buona e il job fallisce in modo visibile.
- **Il nome di un file segue il dato, non la richiesta.** Un piano si scrive
  sotto il codice corso che la *pagina dichiara*, non sotto quello che
  abbiamo chiesto: dopo un redirect i due divergono, e un file il cui nome
  contraddice il contenuto è peggio di un file mancante.
- **Una sola porta verso la rete.** Tutto passa da `pipeline/src/http.ts` e
  dal `prendi` del runner, che impongono crawl-delay, cache e tetto di
  richieste. Un modulo che scarica per conto suo aggira la cortesia senza
  che nessuno se ne accorga — è già successo col `gompAdapter`.
- **Si redige per lista di ciò che si tiene**, non di ciò che si toglie
  (`pipeline/src/strumenti/har.ts`). Un campo mai visto deve essere redatto,
  non tenuto per sbaglio: davanti all'ignoto si sbaglia verso la prudenza.
- **Un'ipotesi sulla fonte si prova sui dati veri prima di fidarsene.**
  In Fase 2 si pensava che la pagina di un codice di coorte vecchio desse il
  piano di quella coorte: dava un piano vuoto. Lo hanno visto i controlli.
- **I CFU di laurea li fissa la legge, non la somma del piano** (180, 120,
  300/360). La somma si porta dietro le stranezze della fonte e resta solo
  un controllo.
- **Dati pubblici: l'app legge dal telefono, la rete solo aggiorna.** La
  sincronizzazione non blocca mai la UI e senza rete non mostra errori
  invadenti, solo «aggiornato il…».
- **Il record ufficiale non sovrascrive mai quello scritto a mano.** Sta
  nell'area `infostud`; `esameDi` è l'unico punto che decide quale vale.
- **Dalla pagina di Infostud all'app passano solo `esito` e `ritorno`.**
  Matricola, sessione (`ingresso`) e `output` (che è la sessione rimandata
  indietro) restano nella WebView e muoiono con lei.
- **Una verifica di assenza vale solo con un controllo positivo.** Cercare
  «nessuna traccia» su disco senza prima trovare qualcosa che deve esserci
  non prova niente: WebKit salva lo storage in UTF-16.
- **Niente caratteri di controllo o combinanti grezzi nel sorgente**: si
  scrivono con gli escape (`new RegExp('[\\u0300-\\u036f]', 'g')`).
  Nel codice sono invisibili e si perdono nei passaggi.

## Convenzioni

- Nomi di entità, funzioni e file **in italiano**, come il codice esistente.
- Testi dell'interfaccia in italiano.
- Commenti solo dove spiegano un *perché* non ovvio.
- I test accompagnano il codice (`*.test.ts` accanto al modulo).

## Comandi

```bash
npm run dev        # sviluppo (Vite, --host per il telefono in Wi-Fi)
npm run build      # tsc -b && vite build
npm test           # vitest run (app + pipeline)
npm run test:watch # vitest in ascolto
npm run typecheck  # tsc dell'app e della pipeline
npm run pipeline       # giro dei dati pubblici (vedi pipeline/README.md)
npm run pipeline:secco # stima il costo di un giro senza fare richieste
npm run ipa        # build + sync iOS + IPA per AltStore
npx cap sync ios   # porta la build web nel progetto iOS
npx cap open ios   # apre Xcode
```

## Metodo

Una fase alla volta (sezione 8 di `PROMPT_MYSAPIENZA.md`). Piano prima,
poi build + test + commit, poi riepilogo e stop in attesa di conferma.
Aggiornare `docs/PROGRESS.md` a ogni fase. Mai inventare endpoint,
selettori o strutture di pagine non viste: creare un'interfaccia, un mock
e un TODO, e chiedere.
