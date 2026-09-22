# Come prendere i dati per la Fase 5 (sync Infostud)

Questo documento serve a te, Giamma. Spiega cosa devo sapere di
Infostud per scrivere la sync, come tirarlo fuori dal tuo browser, e
come ripulirlo prima di mandarmelo.

Il punto di partenza è che **Infostud non ha un'API pubblica** e
l'accesso è solo con SPID o CIE. Non esiste un manuale da leggere: il
solo modo onesto di sapere come parla è guardare cosa fa il tuo browser
mentre lo usi. Per questo serve il tuo aiuto: io queste pagine non le
vedo, e **non devo inventarmele**.

---

## Le regole, prima di tutto

Queste valgono sempre, e valgono anche se ti sembra scomodo.

**Non mandarmi mai:**

- password, PIN, codici SPID o CIE;
- cookie di sessione, token, JWT, `Authorization`, `Set-Cookie`;
- il tuo codice fiscale, la tua matricola, il tuo indirizzo, la tua email;
- i tuoi voti veri;
- un file HAR non anonimizzato.

**Io non ti chiederò mai** credenziali reali, e se te le chiedessi
sarebbe il segnale che qualcosa non va.

**Non eseguire nessuno script sulle pagine di SPID o CIE.** Quelle sono
le pagine del tuo fornitore di identità: lì non si tocca niente, né tu
né l'app. Tutto quello che c'è scritto qui vale solo *dopo* il login,
quando sei tornato su un dominio Infostud.

Il motivo per cui queste regole sono rigide non è la forma. È che il
file di esempio che mi manderai finirà come **fixture in un repository
pubblico**, e da lì non si torna indietro.

---

## Cosa mi serve, in breve

Sei risposte. Sono le stesse che nel progetto formano `infostud.config`:

```ts
interface InfostudConfig {
  loginUrl: string          // da dove si parte
  allowedHosts: string[]    // su quali host posso eseguire lo script
  isLoggedIn: Regola        // come capisco che il login è riuscito
  auth: 'cookie' | { bearerFromStorage: string }
  endpoints: {
    esamiSostenuti: string
    esamiDaSostenere: string
    prenotazioni: string
    profilo: string
  }
  timeoutMs: number
}
```

Finché non ce le ho, la Fase 5 userà un `MockInfostudProvider` con dati
finti. L'app funziona lo stesso: la sync è un *di più*, l'inserimento a
mano resta sempre possibile. Quindi non c'è fretta, e non c'è motivo di
fare le cose di corsa e male.

---

## La cattura, passo per passo

Falla dal **computer**, non dal telefono: gli strumenti per
sviluppatori del browser sono molto più comodi e Safari su iPhone non
dà la stessa vista. Va bene Chrome o Safari su Mac; qui uso Chrome
perché i menu sono più semplici da indicare.

### 1. Prepara la registrazione

1. Apri Chrome in una **finestra di navigazione in incognito**. Non è
   un vezzo: così parti senza cookie vecchi e vedi tutta la sequenza
   del login dall'inizio, e alla fine chiudendo la finestra la sessione
   sparisce.
2. Apri gli strumenti per sviluppatori: `Cmd+Option+I`.
3. Vai sulla scheda **Network** (Rete).
4. Spunta **Preserve log**. Senza questo, ogni cambio di pagina
   cancella quello che hai registrato — e il login cambia pagina un
   sacco di volte.
5. Lascia il filtro su **Fetch/XHR**. Sono le chiamate che portano
   dati; il resto è grafica.

### 2. Accedi normalmente

Vai su Infostud e fai il login con SPID o CIE come fai sempre.

Mentre lo fai, **segnati l'indirizzo della pagina da cui sei partito**:
quello è il `loginUrl`.

Passerai per il sito del tuo fornitore SPID. Lì non guardare niente e
non toccare niente: quella parte non ci riguarda e non deve finire nel
file.

### 3. Segnati dove sei atterrato

Appena il login è finito e vedi la tua pagina, copia **l'indirizzo
della barra**. Mi serve sapere:

- su che **host** sei finito (`qualcosa.uniroma1.it`) — quello va in
  `allowedHosts`;
- se l'indirizzo ha una forma riconoscibile (per esempio finisce con
  `/home` o `/dashboard`) — quella può diventare la regola `isLoggedIn`.

Se gli host sono più d'uno (capita: uno per il login, uno per l'app),
segnali tutti.

### 4. Gira nelle quattro schermate che mi servono

Una alla volta, e con calma. Dopo ognuna guarda la lista in Network e
nota quali chiamate sono comparse.

| Schermata | Cosa cerco |
|---|---|
| Libretto / esami sostenuti | `endpoints.esamiSostenuti` |
| Esami da sostenere / piano | `endpoints.esamiDaSostenere` |
| Prenotazioni appelli | `endpoints.prenotazioni` |
| Il tuo profilo / dati anagrafici | `endpoints.profilo` |

Se una di queste schermate non esiste, o si chiama in un altro modo,
dimmelo: vuol dire che il modello va adattato, non forzato.

**Come capire quale chiamata è quella giusta.** Clicca su una riga
della lista e guarda la scheda **Response** (o **Preview**). Se vedi i
tuoi esami con codici e CFU, è quella. Molte righe saranno rumore
(analytics, immagini, configurazioni): le ignoriamo.

**Se non vedi nessuna chiamata JSON** e la pagina arriva già pronta in
HTML, dimmelo subito: cambia parecchio l'approccio, perché allora lo
script dovrà leggere il DOM invece di chiamare degli endpoint. Non è un
problema, ma è una strada diversa e va decisa prima.

### 5. Scopri come funziona l'autenticazione

Questo è il punto che decide `auth`, ed è il più delicato.

Ci sono due possibilità:

- **`cookie`** — la sessione sta in un cookie. Lo script chiama gli
  endpoint dalla pagina stessa e il browser allega il cookie da solo.
- **`bearerFromStorage`** — c'è un token in `localStorage` o
  `sessionStorage` che va messo nell'header `Authorization`. In questo
  caso mi serve **il nome della chiave**, non il token.

Per capirlo, guarda una delle chiamate buone che hai trovato al punto 4
e apri **Headers → Request Headers**:

- se c'è `Authorization: Bearer ...` → è un token, e va cercato nello
  storage;
- se c'è solo `Cookie: ...` → è una sessione a cookie.

Per trovare dove sta il token, apri la scheda **Console** — **solo se
sei su un dominio uniroma1.it**, mai sulla pagina SPID — e incolla
questo. Stampa **soltanto i nomi delle chiavi e la forma dei valori**,
mai i valori:

```js
for (const [dove, s] of [['localStorage', localStorage], ['sessionStorage', sessionStorage]]) {
  for (const k of Object.keys(s)) {
    const v = s.getItem(k) || ''
    const forma = /^eyJ[\w-]+\./.test(v) ? 'sembra un JWT'
      : v.startsWith('{') ? 'JSON, ' + v.length + ' caratteri'
      : 'testo, ' + v.length + ' caratteri'
    console.log(dove, '->', k, ':', forma)
  }
}
console.log('cookie visibili da JS:',
  document.cookie.split(';').map(c => c.split('=')[0].trim()).filter(Boolean))
```

Mandami **l'output di questo**, che è fatto apposta per essere
innocuo. Se una riga dice `sembra un JWT`, il nome di quella chiave è
quello che va in `bearerFromStorage`.

Una nota: i cookie marcati `HttpOnly` **non** compaiono in
`document.cookie`. Se la lista dei cookie esce vuota ma nelle richieste
c'è un header `Cookie`, vuol dire che sono HttpOnly — ed è una buona
notizia, perché significa che il sito è fatto bene.

### 6. Esporta il file

Nella scheda Network, clic destro in un punto qualsiasi della lista →
**Save all as HAR with content**.

**Salvalo fuori dal progetto.** Per esempio sulla Scrivania. Quel file
contiene la tua sessione: finché non è anonimizzato va trattato come
una password.

### 7. Anonimizzalo

Dalla cartella del progetto:

```bash
npx tsx pipeline/src/strumenti/anonimizza-har.ts ~/Desktop/infostud.har
```

Ti scrive accanto `infostud.anonimo.har` e ti dice cosa ha tolto.
L'originale non lo tocca.

Lo strumento lavora **al contrario di come verrebbe da fare**: invece
di avere una lista di cose da togliere, ha una lista di cose da tenere
(codici insegnamento, CFU, anni, semestri, date, nomi di materie,
stato, forma delle risposte). Tutto il resto viene sostituito. Così un
campo che non ho mai visto — proprio quello che rischierebbe di
sfuggire — viene redatto e non tenuto per sbaglio.

Nel dettaglio:

- **cookie**: eliminati, non redatti. Non c'è niente da imparare dal
  loro contenuto.
- **header di autenticazione**: il nome resta (mi serve sapere *che*
  c'erano), il valore diventa `«tolto»`.
- **matricola, nome, cognome, codice fiscale**: sostituiti. Un numero
  resta un numero con lo stesso numero di cifre, così vedo la forma
  senza vedere il dato.
- **voti e medie**: sostituiti con numeri plausibili fra 18 e 30. Il
  tipo si conserva: se un voto era `null` resta `null`, se era una
  stringa resta una stringa, e la lode resta com'era. Mi serve per
  scrivere un mapper che regge tutti i casi.
- **JWT, codici fiscali, email, numeri di cellulare, stringhe lunghe**:
  cercati e tolti anche se compaiono in mezzo a un testo qualsiasi,
  perché a volte i token viaggiano in posti strani.
- **valori nella query e identificatori nel percorso**: sostituiti, ma
  i *nomi* dei parametri restano, perché è quella la struttura
  dell'endpoint.

Lo stesso valore dà sempre lo stesso segnaposto, quindi si continua a
vedere che il `«matricola-1»` di una risposta è lo stesso dell'altra —
che è un'informazione utile — senza che io veda mai la matricola.

C'è una batteria di test che prende una risposta finta piena di dati
sensibili finti e verifica che **nessuno di quei valori sopravviva** nel
risultato, cercandoli a tappeto nel file prodotto
(`pipeline/src/strumenti/har.test.ts`).

### 8. Guardalo comunque

Apri `infostud.anonimo.har` e scorrilo. Se riconosci qualcosa come tuo,
fermati e dimmelo: vuol dire che c'è un campo che lo strumento non
copre e va aggiunto alla lista.

**Il controllo automatico è una rete, non una garanzia.** L'ultimo
sguardo è il tuo.

---

## Cosa mandarmi alla fine

1. `infostud.anonimo.har`
2. L'output del blocco della Console (nomi di chiavi e forme)
3. Questo, compilato:

```
loginUrl:        https://…
host visti:      …
dopo il login atterro su: https://…
autenticazione:  cookie  /  token in <nome chiave>
le quattro schermate esistono?  sì / no, perché …
i dati arrivano in JSON?        sì / no, sono HTML
```

---

## Cosa ne faccio

Con questa roba scrivo, in Fase 5:

1. `infostud.config` con i valori veri.
2. `InfostudMapper`, che traduce le risposte nei modelli dell'app, con
   i test fatti sulla fixture anonima.
3. `WebViewInfostudProvider` che, dentro l'app iOS, apre una WebView
   con sessione **non persistente**, ti fa accedere sulle pagine
   ufficiali, e solo quando l'host è fra quelli consentiti esegue lo
   script — **incluso nell'app**, mai scaricato da internet — che
   chiama gli endpoint e passa le risposte all'app.
4. Alla fine: cookie, cache e storage della WebView distrutti. Nessuna
   credenziale salvata, mai.

La sync tocca **solo** i record ufficiali degli esami, per codice
risolto con gli alias. Quello che hai scritto a mano — note, voti
inseriti da te, prenotazioni segnate — non viene sovrascritto. E se un
record ufficiale sparisce da Infostud non lo cancello in silenzio: te
lo segnalo e decidi tu.

Se il formato cambia, il mapper fallisce senza toccare niente di quello
che hai in locale, e l'app ti dice che la sincronizzazione va
aggiornata — intanto continui a mano.

---

## Se qualcosa non torna

**Non trovo nessuna chiamata JSON.** Probabile che il frontend renda
l'HTML sul server. Dimmelo: si cambia strada, lo script leggerà il DOM.
Serviranno allora pezzi di HTML anonimizzati invece che risposte JSON.

**Il login passa per più domini.** Normale con SPID. Mi servono tutti
gli host *Infostud*; quelli del fornitore di identità no, e non devono
finire in `allowedHosts`.

**Ci sono endpoint che sembrano utili ma non sono nell'elenco.** Dimmelo
lo stesso. Meglio sapere che esistono.

**Il file anonimo è enorme.** Lo strumento butta via immagini, font e
CSS da solo. Se resta grosso, rifai la cattura visitando solo le quattro
schermate, senza girare per il sito.

**Non te la senti di fare questa cosa.** Va benissimo. L'app funziona
completamente senza Infostud: la Fase 5 salta e resta l'inserimento a
mano, che è comunque la strada che ogni utente deve poter usare.
