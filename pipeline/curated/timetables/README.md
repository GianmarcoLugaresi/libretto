# Orari curati a mano

Qui dentro vanno i CSV degli orari che nessuna fonte automatica può dare:
le facoltà che pubblicano in PDF, o le lezioni che il feed del catalogo
non attribuisce a un anno e a un canale.

Un file per corso (o per facoltà), con questa intestazione:

```csv
corso,anno,canale,nome,giorno,inizio,fine,aula,edificio,dal,al,saltate
33426,2,2º canale,Teoria e storia del design,mar,14:30,18:30,Aula 9,RM064,2026-09-28,2027-01-13,2026-12-08;2026-12-29
```

- **corso** — il codice del corso di quella coorte (Design 2026/27 = `33426`)
- **anno** — 1…6. Lasciarlo vuoto solo se davvero non si sa: la lezione
  finirà fra le "non attribuite" e l'app la mostrerà a parte
- **canale** — come lo scrive la facoltà (`1º canale`, `A-Li`…), vuoto se
  l'insegnamento non è canalizzato
- **giorno** — `lun mar mer gio ven sab dom`, oppure 1…7
- **dal / al** — periodo delle lezioni, in formato `aaaa-mm-gg`
- **saltate** — date senza lezione (ponti, vacanze), separate da `;`
- **docenti** — separati da `;`

Righe vuote e righe che iniziano con `#` vengono ignorate. Se una riga è
sbagliata la pipeline la salta e dice quale e perché, invece di
pubblicare un orario a metà.
