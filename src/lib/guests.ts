/** Guests get a made-up address on a reserved domain, so they never receive mail. */
export const GUEST_EMAIL_DOMAIN = "guest.seatbit.invalid";
export const guestEmail = (id: string) => `${id}@${GUEST_EMAIL_DOMAIN}`;
export const isGuestEmail = (email: string) => email.toLowerCase().endsWith(`@${GUEST_EMAIL_DOMAIN}`);
