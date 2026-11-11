/** Row letter for seat labels: 0 -> A, 25 -> Z, 26 -> AA. */
export function rowLetter(row: number): string {
  let s = "";
  let n = row;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

export function seatLabel(row: number, col: number) {
  return `${rowLetter(row)}${col + 1}`;
}

