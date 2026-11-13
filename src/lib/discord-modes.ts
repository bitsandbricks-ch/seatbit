/**
 * Where the Discord bot puts a LAN type's events. Kept out of the schema so client forms can import it.
 * channel: post and reminders in the linked channel. thread: post in the linked channel, reminders and
 * news in a thread on it. event_channel: a new channel per event (next to the linked one) for all of it.
 */
export const DISCORD_MODES = ["channel", "thread", "event_channel"] as const;
export type DiscordMode = (typeof DISCORD_MODES)[number];

