/**
 * The one way a person is shown in Seatbit (pages, seat map, emails, Discord):
 * Mike "Reyki" Keller. The nick is left out when it is just the real name (or missing).
 * Use the LAN's nick (event > LAN type > default) where there is one: see getDisplayNames
 * in lib/lans.ts, which does that lookup.
 */
export function personLabel(u: { firstName: string; lastName: string; name: string }, nick?: string | null) {
  const first = u.firstName.trim();
  const last = u.lastName.trim();
  const n = nick?.trim();
  if (!first && !last) return n && n !== u.name ? `"${n}" ${u.name}`.trim() : u.name;
  const showNick = n && n !== u.name && n !== first && n !== `${first} ${last}`.trim();
  return [first, showNick ? `"${n}"` : "", last].filter(Boolean).join(" ");
}
