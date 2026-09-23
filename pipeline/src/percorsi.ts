/** Dove sta ogni file dentro `data/v1/`. È il contratto fra pipeline e
 *  app: la pipeline ci scrive, l'app ci legge. */
export const percorsi = {
  indice: () => 'index.json',
  piano: (codice: string, coorte: number) => `courses/${codice}/${coorte}/plan.json`,
  appelli: (codice: string) => `courses/${codice}/exams.json`,
  orario: (codice: string, coorte: number) => `courses/${codice}/${coorte}/timetable.json`,
  programma: (codice: string, insegnamento: string, canale?: string) =>
    `courses/${codice}/syllabi/${insegnamento}${canale ? `-${canale}` : ''}.json`,
}
