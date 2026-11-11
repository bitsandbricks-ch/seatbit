/**
 * How a person is shown wherever orgas pick someone: Mike "Reyki" Keller.
 * The nick is left out when it is just the real name (or missing).
 */
export function personLabel(u: { firstName: string; lastName: string; name: string }, nick?: string | null) {
  const first = u.firstName.trim();
  const last = u.lastName.trim();
  const n = nick?.trim();
  if (!first && !last) return n && n !== u.name ? `"${n}" ${u.name}`.trim() : u.name;
  const showNick = n && n !== u.name && n !== first && n !== `${first} ${last}`.trim();
  return [first, showNick ? `"${n}"` : "", last].filter(Boolean).join(" ");
}
