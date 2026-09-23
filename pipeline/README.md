# Pipeline dei dati pubblici

Prende i dati pubblici del catalogo Sapienza e li scrive come JSON che
l'app scarica. Nessuna AI: solo parser deterministici. Lo stesso HTML
in ingresso dà sempre lo stesso JSON in uscita.

I dati personali dello studente **non passano di qui**. Quelli vengono
da Infostud, restano sul telefono, e la pipeline non li vede mai.

## Provare

```bash
npm run pipeline -- --solo 33426 --compiti appelli --radice /tmp/prova
```

Quanto costerebbe un giro, senza fare richieste:

```bash
npm run pipeline:secco
```

## Argomenti

| Argomento | Cosa fa |
|---|---|
| `--compiti indice,appelli,piani,orari` | Quali parti fare |
| `--solo 33426,31807` | Solo questi codici corso |
| `--fetta oggi` \| `0`…`6` \| `-1` | Quale settimo del catalogo (`-1` = tutto) |
| `--limite 20` | Tetto di richieste, per le prove |
| `--radice data/v1` | Dove scrivere |
| `--cache pipeline/.cache/etag.json` | Dove tenere gli ETag |
| `--curati pipeline/curated/timetables` | Cartella dei CSV orari |
| `--secco` | Non scrive niente, stima e basta |

## Regole di cortesia

Non sono una formalità: se ci comportiamo male ci bloccano, e l'app
resta senza dati.

- **robots.txt.** `corsidilaurea.uniroma1.it` dichiara `Crawl-delay: 10`,
  e `pipeline/src/http.ts` lo rispetta contando gli intervalli per host.
- **Host esclusi.** `app.arc.uniroma1.it` e `gomp.uniroma1.it` hanno un
  robots.txt che non consente l'accesso automatico: sono in
  `HOST_ESCLUSI` e ogni tentativo solleva `HostNonConsentito`. Gli orari
  arrivano invece da `/it/services/gomp/timetable-data/…`, che sta
  sull'host consentito.
- **Un host alla volta.** Un host non elencato in `HOST_CONSENTITI`
  viene rifiutato: aggiungerne uno è una decisione, non una svista.
- **User-Agent** descrittivo, con un contatto. Va messo uno vero prima
  di far girare la cosa sul serio (`UA` in `http.ts`).
- **ETag.** Una pagina non cambiata costa un 304. Scadono dopo 7 giorni,
  così un cambiamento che il server non segnala bene non resta nascosto
  per sempre.
- **Backoff** su 429 e 5xx, con `Retry-After` se c'è.

## Il tempo che ci vuole

Con Crawl-delay 10, 318 corsi:

| Cosa | Pagine | Tempo |
|---|---|---|
| Appelli, tutto il catalogo | 318 | ~53 min |
| Piani, una fetta su sette, una pagina per coorte | ~115 | ~19 min |
| Orari, una fetta su sette | ~230 | ~38 min |

Il **primo giro** va lanciato a mano con `fetta -1` e compiti
`indice,appelli,piani` (~1.100 pagine, circa 3 ore: più del limite di un
job, quindi conviene dividerlo in due, per esempio prima `indice,piani`
e poi `appelli`). Da lì in poi le notti bastano.

Per questo i piani ruotano: in una settimana passano tutti esattamente
una volta, e ogni notte il giro sta dentro un job. Gli appelli invece si
rifanno tutti i giorni, perché cambiano di continuo.

`fettaDi()` deriva la fetta dal codice corso con uno sha1: un corso cade
sempre nella stessa fetta, e le fette restano di dimensione simile senza
dover tenere uno stato da qualche parte.

I **programmi degli insegnamenti** non stanno qui. Sono ~8.000 pagine,
22 ore di richieste: l'app li chiede uno alla volta quando servono.

## Non pubblicare un dato rotto

Uno scraper raramente esplode: più spesso restituisce zero righe, o
metà. `controlli.ts` guarda il file nuovo accanto a quello pubblicato e
**blocca** la scrittura se:

- le voci sono scese a zero, o sotto la metà di ieri;
- ci sono codici duplicati;
- gli alias formano una catena o un anello.

Quando blocca, il file di ieri resta dov'è e il job fallisce in modo
visibile. **Meglio un dato di ieri che un dato falso oggi.** Anche
`index.json` passa da qui: un indice dimezzato nasconderebbe corsi che
stanno benissimo.

Cali più lievi e stranezze (CFU fuori scala, moduli che non tornano col
padre, prenotazioni che chiudono prima di aprire) diventano avvisi nel
registro, senza bloccare.

## Cosa esce

```
data/v1/
  index.json                            elenco corsi, coorti, hash di tutto
  courses/33426/exams.json              appelli + alias fra ordinamenti
  courses/33426/2026/plan.json          piano di studi di una coorte
  courses/33426/2026/timetable.json     orario settimanale
  courses/33426/syllabi/1055957.json    programma (a richiesta, non dal giro)
```

Ogni file porta `schemaVersion`, `sources` e `fetchedAt`: l'app deve
poter dire da dove viene un dato, quando è stato preso, e rifiutare uno
schema che non sa leggere.

`fetchedAt` dice quando **quel contenuto** è stato preso, non quando
abbiamo guardato l'ultima volta: un file identico non viene riscritto,
altrimenti git rimemorizzerebbe tutto il catalogo ogni notte. Quando
abbiamo guardato lo dice `generatedAt` dell'indice.

Gli `hash` nell'indice sono l'impronta del contenuto **senza** le date,
così l'app scarica solo quello che è davvero cambiato.

## Coorti

Ogni coorte ha il suo piano, e i piani cambiano davvero (Design: 27
insegnamenti per il 2026, 26 per il 2025, 25 per il 2024). La pagina del
corso mostra solo la più recente, più l'elenco di tutte nel
`<select id="edit-year-course">`. Le altre si aprono con

```
/it/course/<codice corso>/attendance/lessons-plan?year=<anno>&code=<codice della coorte>
```

che è l'indirizzo a cui il form del sito stesso rimanda: GET, senza
sessione. Attenzione: la pagina «nuda» di un codice vecchio
(`/it/course/31807/...`) **non** dà il piano di quella coorte ma un piano
vuoto intestato all'anno in corso, e non si visita.

Il file viene scritto sotto il codice e l'anno che **la pagina dichiara**;
se la pagina risponde con una coorte diversa da quella chiesta, non si
pubblica niente.

Le coorti di un corso finiscono nell'indice. Nelle notti in cui il corso
non si visita (fette, 304, giri senza piani) restano quelle già
pubblicate.

## Orari

Non esiste una fonte unica: ogni facoltà pubblica a modo suo. Un
`TimetableAdapter` incapsula una fonte e dichiara per quali corsi vale.

- **`curato`** legge i CSV in `curated/timetables/` (formato nel README
  lì dentro). Viene per primo: un orario controllato a mano vince su un
  feed che etichetta a metà.
- **`gomp-catalogo`** legge il feed del calendario del catalogo.

E qui c'è la cosa che conta più di tutte. **Il feed etichetta anno e
canale solo per una parte delle lezioni.** Nel primo semestre 2026/27 di
Design, `filters` dichiara `course_years: [1, 2]` e più di metà degli
eventi ha `course_years: []`. Dedurre l'anno dalle righe non etichettate
produce lezioni del secondo anno attribuite al primo — è già successo,
ed è per questo che la regola sta in `CLAUDE.md`. Le righe senza
etichetta finiscono in `nonAttribuite` e ci restano: l'app le mostra a
parte, non le indovina.

## Struttura

```
src/
  tipi.ts          schemi zod, VERSIONE_SCHEMA
  http.ts          crawl-delay, ETag, backoff, host consentiti
  cache.ts         ETag e Last-Modified fra un giro e l'altro
  controlli.ts     cosa non si pubblica
  pubblica.ts      scrittura atomica, impronte, ultima versione buona
  esegui.ts        runner e argomenti
  parser/          indice.ts, piano.ts, appelli.ts
  orari/           tipi.ts, gomp.ts, curato.ts
  strumenti/       har.ts, anonimizza-har.ts (niente a che fare col giro)
fixture/           pagine vere di Sapienza, per i test
curated/           orari mantenuti a mano
```

`giro.test.ts` fa un giro intero sulle fixture, dall'indice ai file
finali: serve a vedere che i pezzi combacino, non solo che funzionino
da soli.

```bash
npm test                              # tutto
npx vitest run pipeline               # solo la pipeline
npm run typecheck                     # app + pipeline
```

## Provare l'app sui dati veri

```bash
npm run pipeline -- --solo 33426,33501 --radice /tmp/dati/v1
DATI_LOCALI=/tmp/dati VITE_DATI_URL=/dati-locali/v1/ npx vite
```

Il server di sviluppo serve la cartella sotto `/dati-locali/`, e l'app la
usa al posto delle Pages. Non entra mai nella build.

## Strumenti

`strumenti/` non fa parte del giro notturno. Contiene
`anonimizza-har.ts`, che ripulisce una cattura di rete del browser
prima che diventi una fixture:

```bash
npx tsx pipeline/src/strumenti/anonimizza-har.ts ~/Desktop/cattura.har
```

Serve alla Fase 5: un HAR contiene cookie e token di sessione, e la
procedura per catturarlo senza farsi male è in
[`docs/INFOSTUD.md`](../docs/INFOSTUD.md).

## Il giro notturno

`.github/workflows/dati.yml`, ogni notte alle 04:17 UTC. Scrive sul ramo
`data`, non su `main`: codice e dati hanno ritmi diversi e non devono
sporcarsi la storia a vicenda.

Un'avvertenza su GitHub: i workflow schedulati vengono disattivati dopo
60 giorni senza attività nel repository. Se arriva quella mail, basta
riattivarlo, o lanciarlo a mano da *Actions → Dati → Run workflow*.
