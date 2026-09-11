# Libretto

App personale per il percorso alla Sapienza: libretto degli esami, appelli,
orario delle lezioni e statistiche di carriera. È una **PWA**: si installa
sulla Home dell'iPhone e si comporta come un'app nativa, senza App Store e
senza account sviluppatore.

I dati stanno **solo sul tuo telefono** (localStorage del browser). Niente
server, niente account, niente sincronizzazione. Il rovescio della medaglia:
se cancelli i dati del sito perdi il libretto → usa l'export dalle
impostazioni per i backup.

## Avvio

```bash
npm install && npm run dev
```

Il terminale stampa due indirizzi: `Local` (questo Mac) e `Network`
(raggiungibile dall'iPhone sulla stessa Wi‑Fi).

## Installazione sull'iPhone

Il modo migliore è pubblicarla: serve HTTPS perché funzioni offline.

```bash
npm run build
```

Poi carica la cartella `dist/` su un hosting statico gratuito (Netlify Drop,
Vercel, GitHub Pages). Dall'URL, su Safari: **Condividi → Aggiungi a Home**.
Da lì parte a schermo intero, con la sua icona, e funziona anche senza rete.

In alternativa, per provarla al volo in casa: apri l'indirizzo `Network` da
Safari sull'iPhone mentre `npm run dev` gira. Su HTTP semplice il service
worker non si registra, quindi niente modalità offline.

## Linguaggio visivo

Nero cinematografico come base; il colore lo portano i corsi, ognuno con
la sua tinta e un bordo luminoso. Le azioni sono pill bianche, la
navigazione una capsula di vetro sul bordo destro, a portata di pollice.

- La home apre su un **poster a mezzo schermo** del corso in arrivo:
  un'opera a tema (Bauhaus, Piranesi, Leonardo, Muybridge, l'ENIAC…)
  gradata nella tinta del corso, con l'anello dell'icona e una grana
  fotografica. Le immagini sono tutte di pubblico dominio o CC0
  (`public/poster/CREDITI.md`), due-tre per tema a rotazione giornaliera;
  da "Modifica corso" puoi mettere un URL tuo, anche di un'immagine
  generata con l'AI. Se la foto non c'è, resta il poster generato dal
  colore.
- **Liquid glass** (`components/Vetro.tsx`, porting in React del
  LiquidGlass.vue di Aiutly): riempimento translucido, sfocatura di ciò
  che sta dietro, bordo speculare a gradiente, alone sotto il dito; premuto
  si ingrandisce di un soffio e trascinato si lascia tirare, tornando a
  posto al rilascio. La rifrazione sul bordo (`backdrop-filter: url()` +
  `feDisplacementMap`) la disegna Chromium; WebKit la ignora (bug 245510),
  quindi su iPhone resta la versione sfocata. Nella capsula il disco
  bianco segue il dito e scatta sulla scheda più vicina, come la barra di
  iOS 26.
- **Scala 18→30**: la barra arcobaleno con la manopola. Lo stesso colore
  torna nell'anello del voto nel libretto e nelle barre dell'istogramma.
- Tema chiaro disponibile dalle impostazioni: stessa grammatica, invertita.

Anton è self-hosted in `public/fonts/` (licenza OFL) così l'app funziona
anche offline.

## Struttura

```
src/
├── lib/
│   ├── types.ts      modello dati (esami, appelli, lezioni, profilo)
│   ├── store.tsx     stato + persistenza su localStorage
│   ├── stats.ts      medie, CFU, proiezione voto di laurea, simulatore
│   ├── query.ts      selettori derivati ("cosa ho oggi?")
│   ├── catalogo.ts   piani di studio ufficiali + orari
│   └── date.ts       date in locale, sessioni, anno accademico
├── components/       guscio schermo, sheet, schede di modifica
├── screens/          Oggi · Libretto · Esami · Orario · Statistiche
└── styles/           token di design, base, componenti, schermate
```

## Come vengono calcolate le medie

- **Media ponderata** = Σ(voto × CFU) ÷ ΣCFU, sui soli esami superati con voto.
- Le **idoneità** portano CFU ma non entrano in media.
- La **lode** vale quanto imposti (default 30, come di norma alla Sapienza).
- **Base di laurea** = media ponderata × 110 ÷ 30.
- **Proiezione** = base + i punti che stimi per tesi e percorso (li decidi tu:
  i punti veri li assegna la commissione).
- Un esame può essere escluso dalla media pur portando i CFU (convalide).

## Catalogo dei corsi

In `catalogo.ts` entrano **solo** piani trascritti dal catalogo ufficiale
Sapienza e verificati riga per riga: la somma dei CFU deve tornare per anno e
per semestre. Un piano "plausibile" ma ricostruito a mano fa più danni che
comodo, perché da lì si aggiungono esami al libretto vero e CFU sbagliati
falsano media e proiezione.

Attualmente verificato:

| Corso | Classe | Fonte | A.A. |
|---|---|---|---|
| Design | L-4 | `corsidilaurea.uniroma1.it/it/course/33426/study-plan` | 2026/27 |
| Design — orario 1° semestre | | `app.arc.uniroma1.it/didattica/orario/de` | 2026/27 |

Per gli altri corsi si parte da zero e si aggiungono gli esami a mano dal
Libretto.
