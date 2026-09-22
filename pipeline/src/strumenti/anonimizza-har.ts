/* ============================================================
   Riga di comando per anonimizzare un HAR.

     npx tsx pipeline/src/strumenti/anonimizza-har.ts cattura.har

   Scrive `cattura.anonimo.har` accanto all'originale e stampa cosa
   ha tolto. L'originale non viene toccato — e non va mai messo nel
   repository: aggiungilo a .gitignore o tienilo fuori dal progetto.
   ============================================================ */

import { readFile, writeFile } from 'node:fs/promises'
import { anonimizzaHar, soloDati, stampaRapporto } from './har'

async function main(argv: string[]) {
  const ingresso = argv[0]
  if (!ingresso) {
    console.error('Uso: anonimizza-har.ts <file.har> [--tutto]')
    console.error('  --tutto  tiene anche immagini, font e CSS (di solito inutili)')
    process.exit(2)
  }

  const grezzo = JSON.parse(await readFile(ingresso, 'utf8'))
  const filtrato = argv.includes('--tutto') ? grezzo : soloDati(grezzo)
  const { har, rapporto } = anonimizzaHar(filtrato)

  const uscita = ingresso.replace(/\.har$/i, '') + '.anonimo.har'
  await writeFile(uscita, JSON.stringify(har, null, 1), 'utf8')

  const prima = (grezzo.log?.entries ?? []).length
  const dopo = (har as { log: { entries: unknown[] } }).log.entries.length
  console.log(`${ingresso} → ${uscita}`)
  console.log(`Chiamate: ${prima} nel file originale, ${dopo} tenute`)
  console.log(stampaRapporto(rapporto))
  console.log('\nApri il file prima di mandarlo e controlla che non ci sia')
  console.log('niente che riconosci come tuo. Il controllo automatico è una')
  console.log('rete, non una garanzia.')
}

if (process.argv[1]?.includes('anonimizza-har')) {
  main(process.argv.slice(2)).catch(e => { console.error(e.message); process.exit(1) })
}
