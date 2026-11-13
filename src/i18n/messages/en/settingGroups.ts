export const settingGroups = {
  general: { title: "General", help: "Who can sign up, who is a global admin, and the currency for food orders." },
  mail: { title: "Email (SMTP relay)", help: "Used for reminders and password resets. Without a host, mails are only printed to the server log." },
  discord: { title: "Discord", help: "One Discord application is used for both the login button and the bot." },
  google: { title: "Google login", help: "OAuth client for the \"Sign in with Google\" button." },
  automation: { title: "Reminders, cron & metrics", help: "How due reminders are triggered, and the Prometheus metrics endpoint." },
  backup: { title: "Backups", help: "Seatbit copies its database to the backup folder while it runs. Mount that folder on its own volume and copy the files off the server too." },
  billing: { title: "Supporter payments", help: "Optional. Lets clans support this instance with a voluntary yearly or monthly payment, and people give one-off donations, through Stripe. Supporters and donors get a badge and a thank-you, never extra features. Off by default." },
  ops: { title: "Platform Discord", help: "Optional. Channels on your own Discord server where the bot tells the platform team what happens on this instance. The bot must be in that server." },
  maintenance: { title: "Maintenance banner", help: "A banner on every page, e.g. before an upgrade. It disappears on its own when the end time has passed." },
  connect: { title: "Online payments for clans", help: "Optional. Clans connect their own Stripe account and members pay what they owe the clan online (card, TWINT). The money goes straight to the clan; this instance is the Stripe Connect platform. Uses the Stripe secret key from Supporter payments. Off by default." },
  legal: { title: "Operator & legal", help: "Who runs this Seatbit instance. Shown on the Terms of Service and Privacy Policy pages. Fill this in before you invite people, or link your own documents instead." },
};
