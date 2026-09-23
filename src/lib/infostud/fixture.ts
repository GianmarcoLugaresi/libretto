/* ============================================================
   Risposte finte di Infostud, per i test e per il provider di prova.

   La busta { esito, output, ritorno } e le risposte vuote sono quelle
   viste sulle catture vere del 23/09/2026. I campi di un esame e di una
   prenotazione vengono da ioStudKit (docs/INFOSTUD.md): sono di seconda
   mano. Tutti i valori sono inventati; i codici sono quelli pubblici
   del piano di Design 2026, così l'aggancio al libretto si può provare.
   ============================================================ */

const busta = (ritorno: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  esito: { flagEsito: 0, id: 0, nota: '', ritorno: null },
  // Sulle risposte vere qui c'è la sessione. Lo script nella WebView non
  // la passa mai all'app; nella finta c'è un segnaposto.
  output: '00000000-0000-4000-8000-000000000000',
  ritorno,
  ...extra,
})

export const esamiFinti = busta(
  {
    esami: [
      {
        codiceInsegnamento: '10622516', descrizione: 'FONDAMENTI DI DISEGNO', cfu: 12.0, ssd: 'CEAR-10/A',
        data: '20/01/2027', annoAcca: '2026/2027', esito: { valoreNominale: '28', valoreNonNominale: 28 },
      },
      {
        codiceInsegnamento: '10622518', descrizione: 'STORIA DELLE ARTI APPLICATE', cfu: 6.0, ssd: 'ARTE-01/C',
        data: '03/02/2027', annoAcca: '2026/2027', esito: { valoreNominale: '30', valoreNonNominale: 30 },
      },
      {
        // Idoneità: valoreNonNominale null lo dichiara ioStudKit. Il testo
        // di valoreNominale non l'abbiamo mai visto: il mapper non lo usa.
        codiceInsegnamento: 'AAF1101', descrizione: 'LINGUA INGLESE', cfu: 3.0, ssd: '',
        data: '15/02/2027', annoAcca: '2026/2027', esito: { valoreNominale: 'IDONEO', valoreNonNominale: null },
      },
      {
        // Un esame che nel piano non c'è: finisce fra quelli da collegare.
        codiceInsegnamento: '99999999', descrizione: 'TIPOGRAFIA SPERIMENTALE', cfu: 6.0, ssd: 'CEAR-08/D',
        data: '10/02/2027', annoAcca: '2026/2027', esito: { valoreNominale: '25', valoreNonNominale: 25 },
      },
    ],
  },
  { sessioniErasmus: [], pdSApprovato: true },
)

export const prenotazioniFinte = busta({
  appelli: [
    {
      codIdenVerb: 123456, codAppe: 1, codCorsoStud: '33426', descCorsoStud: 'DESIGN',
      descrizione: 'TEORIA DELLA FORMA', crediti: 6, canale: 'NESSUNA CANALIZZAZIONE',
      docente: 'DOCENTE DI PROVA', facolta: 'ARCHITETTURA', annoAcca: '2026/2027',
      dataAppe: '10/02/2027', note: '', numeroPrenotazione: 3,
      dataprenotazione: '20/01/2027', dataInizioPrenotazione: '10/01/2027', dataFinePrenotazione: '05/02/2027',
    },
  ],
})

/** Come le risposte vere viste finora: carriera appena cominciata. */
export const esamiVuoti = busta({ esami: [] }, { sessioniErasmus: null, pdSApprovato: false })
export const prenotazioniVuote = busta({ appelli: [] })
