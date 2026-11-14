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


/** The row a seat is in, as people see it: the letters its label starts with ("F" for F7). */
export function seatRow(seat: { label: string; row: number }): string {
  return (seat.label.match(/^[A-Za-z]+/)?.[0] ?? rowLetter(seat.row)).toUpperCase();
}
