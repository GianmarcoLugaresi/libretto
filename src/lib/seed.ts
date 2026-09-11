/* ============================================================
   Stato iniziale.
   Si parte vuoti e con l'onboarding acceso: riempire il libretto
   con dati finti e poi farglieli cancellare è il modo più rapido
   per far abbandonare un'app.
   ============================================================ */

import type { Stato, Impostazioni, Profilo } from './types'
import { annoAccademico } from './date'

export const IMPOSTAZIONI_DEFAULT: Impostazioni = {
  valoreLode: 30,        // a Sapienza la lode di norma pesa 30
  puntiTesi: 6,          // stima prudente: tesi + in corso
  tema: 'scuro',
  preavvisoGiorni: 7,
}

export function profiloDefault(): Profilo {
  const aa = Number(annoAccademico().slice(0, 4))
  return {
    nome: '',
    corsoDiLaurea: '',
    facolta: '',
    tipo: 'triennale',
    cfuTotali: 180,
    immatricolazione: aa,
    annoCorrente: 1,
    durataAnni: 3,
  }
}

export function statoIniziale(): Stato {
  return {
    versione: 1,
    profilo: profiloDefault(),
    impostazioni: IMPOSTAZIONI_DEFAULT,
    insegnamenti: [],
    esami: {},
    appelli: [],
    lezioni: [],
    onboarding: true,
  }
}
