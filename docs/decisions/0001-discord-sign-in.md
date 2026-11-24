# 0001 Sign-in with Discord only

**Context:** the bot, the DMs, `/verify` and taking over a guest by a verified Discord email all need a linked Discord account.

**Decision:** people sign in with Discord OAuth through Better Auth. Email and password are only switched on for development and tests.

**Consequences:** no passwords to store or reset. Seatbit has no second factor of its own; an account is as safe as its Discord account. The handbook asks for MFA for admins; whether that is enough is an open question (see `AGENTS.md`).
