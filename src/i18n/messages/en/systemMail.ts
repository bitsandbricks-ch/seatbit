export const systemMail = {
  adminTitle: "Fixed mails",
  adminHint: "System mails with a fixed text, in every language. They use the same layout as the templates above but can't be edited here.",
  fact: { server: "SMTP server", instance: "Instance" },
  smtpTest: {
    title: "Test mail",
    when: "A platform admin presses Send test mail in the email settings.",
    subject: "Seatbit test mail",
    body: "This is a test mail from the Seatbit platform settings at {url}. If you can read it, email works.",
    button: "Open email settings",
    note: "You get this because you pressed Send test mail.",
  },
  passwordReset: {
    title: "Password reset",
    when: "Someone asks for a new password (only with email login on).",
    subject: "Reset your Seatbit password",
    body: "Someone asked to reset the password of your Seatbit account. Choose a new one with the button below. The link works only for a short time.",
    button: "Choose a new password",
    note: "If you didn't ask for this, ignore this mail. Your password stays the same.",
  },
  notice: {
    title: "Notifications",
    when: "Everything else Seatbit mails you: join requests, role changes, seat swaps, event changes, upgrade notes for platform admins and more. The text is the notification, the button opens the page it is about.",
    exampleSubject: "Anna wants to join The dark lizzards gizzards wizzards",
    exampleBody: "Anna asked to join The dark lizzards gizzards wizzards. Approve or decline the request on the clan's member page.",
  },
};
