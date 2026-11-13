# Email

Seatbit sends reminders, invites for guests and notices like "you moved up from the waitlist" by email. Set up an SMTP relay under **Admin → Platform settings → Email** (or with the `SMTP_*` variables, see [Configuration](configuration.md)) and click **Send test mail to me**.

![Email settings](../screenshots/desktop-admin-mail.png){ .shot }

Without an SMTP host, emails are written to the server log instead, which is handy for trying things out.

Use a sender address on a domain you control (`MAIL_FROM`, e.g. `Seatbit <lan@example.com>`) and set up SPF/DKIM for it with your mail provider, or reminders end up in spam.

## Mail templates

Under **Mail templates**, change the wording of every email Seatbit sends. They share one layout: the clan in the header, "Hi name,", your text, a box with the event facts, a button and a footer with links to the privacy policy and terms. Placeholders like `{firstName}` are filled in per person. **Reset** brings back the built-in text, and you can send yourself a test.

Below the editable templates, **Fixed mails** shows the mails whose text is built in: the SMTP test mail, the password reset and the layout for notifications (join requests, role changes, seat swaps, event changes, upgrade notes for platform admins, ...). They use the same layout and go out in the recipient's language, but can't be edited. Each has a preview and a test button.

Each template has an English and a German text; the switch above the templates picks which one you edit. Every mail goes out in its recipient's [language](../features/languages.md#mails).

![Mail templates](../screenshots/desktop-admin-templates.png){ .shot }

Members turn reminder emails off on their profile.
