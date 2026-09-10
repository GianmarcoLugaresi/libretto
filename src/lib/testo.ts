/* Piccoli aiuti per il testo italiano. */

/** "1 lezione" / "3 lezioni". Con `conNumero: false` restituisce
 *  solo la parola concordata. */
export function plurale(n: number, singolare: string, plurale: string, conNumero = true): string {
  const parola = n === 1 ? singolare : plurale
  return conNumero ? `${n} ${parola}` : parola
}
