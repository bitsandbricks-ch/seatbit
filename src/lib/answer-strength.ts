import type { Attendance } from "@/db/schema";

type Answer = Pick<Attendance, "status" | "paid" | "ticketBought">;

/**
 * How far along an answer is: a confirmed ticket beats a reported one, which beats a plain
 * "coming", then waitlist, "unsure" and "not coming". Used when two people turn out to be one
 * (a guest merged into a member) and both answered the same event.
 */
export function answerStrength(a: Answer) {
  if (a.status === "declined") return 0;
  if (a.paid) return 6;
  if (a.ticketBought) return 5;
  return { going: 4, waitlist: 3, maybe: 2 }[a.status];
}

/** Whether the guest's answer should replace the member's. On a tie the member's stays. */
export function guestAnswerWins(guest: Answer, member: Answer) {
  return answerStrength(guest) > answerStrength(member);
}
