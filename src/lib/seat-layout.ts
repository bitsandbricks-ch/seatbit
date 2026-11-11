import type Database from "better-sqlite3";

/**
 * Seats are stored by their label: each letter is one row and a seat sits at its number
 * (row = position of the letter in the block, col = number - 1). So "F1-F20, F25-F30" is one row
 * with a gap, and the unique (lan, row, col) index also keeps every letter+number unique.
 */
export function parseSeatLabel(label: string): { letter: string; num: number } | null {
  const m = label.trim().match(/^([A-Za-z]+)\s*(\d{1,4})$/);
  return m ? { letter: m[1].toUpperCase(), num: Number(m[2]) } : null;
}

type Row = { id: string; lan_id: string; row: number; col: number; label: string; user_id: string | null };

/**
 * Brings older seat blocks (laid out as a free grid, so one letter could span two rows and numbers
 * didn't match columns) into the letter/number layout. Runs on startup and only touches LANs that need it.
 * Labels that aren't letter+number, and duplicate labels, go to extra rows at the end unchanged.
 */
export function normalizeSeatLayout(sqlite: Database.Database) {
  const all = sqlite.prepare("SELECT id, lan_id, row, col, label, user_id FROM seat ORDER BY lan_id, row, col").all() as Row[];
  const byLan = new Map<string, Row[]>();
  for (const s of all) byLan.set(s.lan_id, [...(byLan.get(s.lan_id) ?? []), s]);

  const setPos = sqlite.prepare("UPDATE seat SET row = ?, col = ? WHERE id = ?");
  const setLan = sqlite.prepare("UPDATE lan SET seat_rows = ?, seat_cols = ? WHERE id = ?");
  for (const [lanId, seats] of byLan) {
    const letters: string[] = [];
    const taken = new Set<string>();
    const target = new Map<string, { row: number; col: number }>();
    const rest: Row[] = [];
    // Seated people win a duplicate label.
    for (const s of [...seats].sort((a, b) => Number(!!b.user_id) - Number(!!a.user_id))) {
      const p = parseSeatLabel(s.label);
      const key = p && `${p.letter}${p.num}`;
      if (!p || taken.has(key!)) {
        rest.push(s);
        continue;
      }
      taken.add(key!);
      target.set(s.id, { row: -1, col: p.num - 1 });
    }
    // Letters in the order they appear in the old layout.
    for (const s of seats) {
      const p = target.has(s.id) ? parseSeatLabel(s.label)! : null;
      if (p && !letters.includes(p.letter)) letters.push(p.letter);
    }
    for (const s of seats) {
      const t = target.get(s.id);
      if (t) t.row = letters.indexOf(parseSeatLabel(s.label)!.letter);
    }
    rest.sort((a, b) => a.row - b.row || a.col - b.col).forEach((s, i) => target.set(s.id, { row: letters.length, col: i }));
    if (rest.length) letters.push("?");

    if (seats.every((s) => target.get(s.id)!.row === s.row && target.get(s.id)!.col === s.col)) continue;
    sqlite.transaction(() => {
      // Move everything out of the way first so the unique (lan, row, col) index never clashes midway.
      seats.forEach((s, i) => setPos.run(-1 - i, -1 - i, s.id));
      for (const s of seats) setPos.run(target.get(s.id)!.row, target.get(s.id)!.col, s.id);
      const maxCol = Math.max(0, ...[...target.values()].map((t) => t.col + 1));
      setLan.run(letters.length, maxCol, lanId);
    })();
  }
}
