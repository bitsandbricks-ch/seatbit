import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ContactEmail, LegalPage, Operator } from "@/components/legal-page";
import { getLegal, type Legal } from "@/lib/legal";
import { billingEnabled } from "@/lib/billing";
import { getLocale, getT } from "@/i18n/server";
// i18n-ignore-file: the policy is written once per language, below.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: `${t("footer.privacy")} · Seatbit`, description: t("legal.privacyDescription") };
}

// Reads the operator settings on every request.
export const dynamic = "force-dynamic";

export default async function PrivacyPage() {
  const legal = getLegal();
  // Operators can use their own document instead of the built-in one.
  if (legal.privacyUrl) redirect(legal.privacyUrl);
  // Stripe only appears where the operator turned on Supporter payments.
  const payments = billingEnabled();
  return (await getLocale()) === "de" ? <PrivacyDe legal={legal} payments={payments} /> : <PrivacyEn legal={legal} payments={payments} />;
}

type Props = { legal: Legal; payments: boolean };

function PrivacyEn({ legal, payments }: Props) {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        This policy explains what personal data Seatbit (the website and the Seatbit Discord bot) processes, why, for
        how long, and what rights you have. It is written for the Swiss Federal Act on Data Protection (FADP / nDSG)
        and, where it applies, the EU General Data Protection Regulation (GDPR).
      </p>

      <h2>1. Controller</h2>
      <p>The controller responsible for your data is:</p>
      <Operator />
      <p>Contact us at this address for any question or request about your data.</p>

      <h2>2. What data we process</h2>

      <h3>Your account (from Discord)</h3>
      <p>
        You sign in with Discord. With your permission Discord sends us your Discord user ID, username / display name,
        avatar picture and email address. We store these together with the login tokens Discord issues, so we can
        recognise you and link your Discord account to your Seatbit account. We do not get your Discord password, your
        server list or your messages.
      </p>

      <h3>Your profile</h3>
      <ul>
        <li>First name and surname</li>
        <li>Your nickname (gamer tag) and, if you set them, other nicknames for certain LAN types or events</li>
        <li>Your choice whether to get reminder emails</li>
        <li>Your language, if you picked one</li>
      </ul>

      <h3>Clans and LAN events</h3>
      <ul>
        <li>Which clans you belong to, and your role there (member, admin, waiting for approval)</li>
        <li>For each event: whether you are coming, unsure or not coming, whether you bought a ticket, whether a lead confirmed it, and any note you add</li>
        <li>Seat wishes (people you want to sit near or not next to, preferred position or seat) and the seat you are assigned</li>
        <li>Whether you are a lead of an event</li>
        <li>If a lead adds you as a guest before you have an account: the name, nickname and (if they have it) email address they enter, and your answers and seat for their events. The email is only used to send you the invite and to recognise you: when you sign in with a Discord account whose verified email matches, or through your claim link, this moves to your own account and the guest entry is deleted. If a lead tells the Discord bot which Discord member you are, we also keep your Discord user ID with the guest entry, send you one DM with your claim link, and move everything over when you sign in with that Discord account.</li>
        <li>Content clan admins enter: clan name, description and avatar, LAN types, events, invite links</li>
      </ul>

      <h3>Discord bot</h3>
      <ul>
        <li>For each linked channel: the Discord server ID, channel ID and name, which clan it belongs to, and the Discord user ID of whoever linked it</li>
        <li>The IDs of the announcement messages the bot posted, so it can keep them up to date</li>
        <li>When you use a command or button, Discord sends us your Discord user ID, the server and channel. We use it to find your Seatbit account and, for example, save your answer to an event. For <code>/claim</code> it also sends your server nickname, display name and username, which we compare with the clan&apos;s guests and don&apos;t store. The bot does not read or store other messages.</li>
      </ul>

      {payments && (
        <>
          <h3>Supporter payments</h3>
          <p>
            If a clan admin chooses to support this instance, the payment is made on Stripe&apos;s checkout page. Stripe
            collects the payer&apos;s name, email address and payment details (card, TWINT or wallet). We never see card
            numbers or TWINT details. We store only, for the clan: the Stripe customer and subscription IDs, whether it
            pays yearly or monthly, and until when it is paid. The audit log of the clan notes when it became a
            Supporter.
          </p>
        </>
      )}

      <h3>Technical data</h3>
      <ul>
        <li>Login sessions, with the IP address and browser (user agent) they were created from</li>
        <li>A log of which reminders were sent, so nobody gets the same one twice</li>
        <li>An audit log of changes leads and admins make (for example who moved a seat, changed someone&apos;s answer, confirmed a ticket, changed a role or edited a guest), with the time, who made the change and who it was about</li>
        <li>Server logs (time, requested page, IP address, error messages) that our server keeps for a short time</li>
      </ul>

      <h2>3. Why we process it and on what legal basis</h2>
      <ul>
        <li><strong>To run the Service for you and your clan</strong> (account, events, tickets, seats, Discord bot). Legal basis: performing our agreement with you (Art. 6(1)(b) GDPR).</li>
        <li><strong>To send you reminders</strong> about deadlines and upcoming events, by email and in linked Discord channels. Legal basis: our agreement with you; you can switch off emails on your profile.</li>
        <li><strong>To keep the Service secure</strong> and fix problems (sessions, logs, backups). Legal basis: our legitimate interest in a working, secure service (Art. 6(1)(f) GDPR).</li>
        {payments && (
          <li><strong>To handle voluntary Supporter payments</strong> and keep the required bookkeeping records. Legal basis: our agreement with the payer and our legal obligations (Art. 6(1)(b) and (c) GDPR).</li>
        )}
        <li><strong>To meet legal obligations.</strong> Legal basis: Art. 6(1)(c) GDPR.</li>
      </ul>
      <p>
        We do not sell your data, do not show ads, do not use tracking or analytics tools, and do not use your data for
        automated decisions or profiling. Seatbit only sets the cookie needed to keep you signed in and, if you pick a
        language in the footer, a cookie that remembers it.
      </p>

      <h2>4. Who can see your data</h2>
      <ul>
        <li><strong>Members of your clans</strong> see your name, nickname, avatar and whether you are coming to that clan&apos;s events. Once the seat plan is final they see who sits where.</li>
        <li><strong>Clan admins and event leads</strong> also see ticket status, notes and seat wishes for their events, and can export the attendee list. Clan admins see their clan&apos;s audit log.</li>
        <li><strong>People in a linked Discord channel</strong> see the bot&apos;s announcements, including the nicknames of who is coming, unsure or on the waitlist.</li>
        <li><strong>Platform admins</strong> of this Seatbit instance can see all data to run and support the Service.</li>
      </ul>

      <h2>5. Service providers and transfers abroad</h2>
      <p>
        {legal.hostingLocation
          ? `This Seatbit instance runs on a server in ${legal.hostingLocation}.`
          : "This Seatbit instance runs on a server chosen by its operator."}{" "}
        We share data with these providers only as needed:
      </p>
      <ul>
        <li>
          <strong>Discord Inc.</strong> (USA) for sign-in and the bot. Discord processes your data under its own{" "}
          <a href="https://discord.com/privacy" target="_blank" rel="noreferrer">
            privacy policy
          </a>
          . Your avatar picture is loaded from Discord&apos;s servers.
        </li>
        <li>
          <strong>Our email provider</strong>, which delivers reminder emails and receives your email address, name and
          the reminder text.
        </li>
        {payments && (
          <li>
            <strong>Stripe Payments Europe, Ltd.</strong> (Ireland), together with Stripe, Inc. (USA), processes Supporter
            payments as our payment provider and keeps the payment records it must keep by law. See Stripe&apos;s{" "}
            <a href="https://stripe.com/privacy" target="_blank" rel="noreferrer">
              privacy policy
            </a>
            .
          </li>
        )}
      </ul>
      <p>
        Where data goes to a country without adequate data protection (such as the USA), the transfer relies on the
        Swiss-U.S. and EU-U.S. Data Privacy Framework where the recipient is certified, or on the standard contractual
        clauses approved by the EU Commission and recognised by the Swiss FDPIC.
      </p>

      <h2>6. How long we keep data</h2>
      <ul>
        <li>Account, profile and event data: as long as your account exists. When you leave a clan, your membership is removed.</li>
        <li>Login sessions: until you sign out or they expire.</li>
        <li>Discord channel links: until the channel is unlinked or the bot is removed.</li>
        <li>Audit log entries: one year.</li>
        {payments && (
          <li>Supporter details of a clan: as long as the clan exists. Payment records (receipts, amounts, dates): as long as bookkeeping law requires, usually ten years.</li>
        )}
        <li>Server logs: a few days. Database backups: up to 14 days.</li>
      </ul>
      <p>
        You can delete your account yourself on your <Link href="/profile?tab=data">profile</Link> (Your data, Delete my
        account). We then delete your name, email, picture, Discord link, login sessions, nicknames, LAN IDs, clan
        memberships, lead roles, seat wishes, seats, rides, packing lists and your answers to upcoming events. Your
        answers to past events (coming or not, ticket) stay with an anonymous &ldquo;Deleted member&rdquo; that
        can&apos;t be traced back to you, so your clan&apos;s event history still adds up; audit log entries show the
        same &ldquo;Deleted member&rdquo;. A clan where nobody else with a login is left is deleted with your account.
        Backups are overwritten within 14 days.
      </p>

      <h2>7. Your rights</h2>
      <p>You have the right to:</p>
      <ul>
        <li>get information about the data we hold about you, and a copy of it;</li>
        <li>have wrong data corrected (you can edit most of it yourself on your <Link href="/profile">profile</Link>);</li>
        <li>have your data deleted, or its processing restricted;</li>
        <li>receive your data in a common machine-readable format (Download my data on your profile gives you everything as a JSON file);</li>
        <li>object to processing based on our legitimate interest;</li>
        <li>withdraw any consent you gave, with effect for the future.</li>
      </ul>
      <p>
        Downloading your data and deleting your account work directly on your profile. For anything else, email{" "}
        <ContactEmail />. You can also complain to a data protection
        authority: in Switzerland the Federal Data Protection and Information Commissioner (FDPIC,{" "}
        <a href="https://www.edoeb.admin.ch" target="_blank" rel="noreferrer">
          edoeb.admin.ch
        </a>
        ), in the EU the authority in your country.
      </p>
      <p>
        You can also remove Seatbit&apos;s access to your Discord account at any time in Discord under User Settings,
        Authorized Apps.
      </p>

      <h2>8. Security</h2>
      <p>
        All connections use HTTPS. Secrets such as bot tokens and SMTP passwords are stored encrypted. Access to the
        server is limited to the operator.
      </p>

      <h2>9. Children</h2>
      <p>
        Seatbit is not meant for children below Discord&apos;s minimum age. If you think a child has given us data
        without permission, contact us and we will delete it.
      </p>

      <h2>10. Changes</h2>
      <p>
        We may update this policy when Seatbit changes. The date at the top shows the current version. See also our{" "}
        <Link href="/terms">Terms of Service</Link>.
      </p>
    </LegalPage>
  );
}

function PrivacyDe({ legal, payments }: Props) {
  return (
    <LegalPage title="Datenschutzerklärung">
      <p>
        Diese Erklärung beschreibt, welche Personendaten Seatbit (die Website und der Seatbit-Discord-Bot) bearbeitet,
        warum, wie lange und welche Rechte du hast. Sie richtet sich nach dem Schweizer Datenschutzgesetz (DSG) und, wo
        sie anwendbar ist, der EU-Datenschutz-Grundverordnung (DSGVO).
      </p>

      <h2>1. Verantwortlicher</h2>
      <p>Verantwortlich für deine Daten ist:</p>
      <Operator />
      <p>Wende dich mit allen Fragen und Anliegen zu deinen Daten an diese Adresse.</p>

      <h2>2. Welche Daten wir bearbeiten</h2>

      <h3>Dein Konto (von Discord)</h3>
      <p>
        Du meldest dich mit Discord an. Mit deiner Erlaubnis schickt uns Discord deine Discord-Benutzer-ID, deinen
        Benutzer- bzw. Anzeigenamen, dein Profilbild und deine E-Mail-Adresse. Wir speichern sie zusammen mit den
        Login-Tokens von Discord, damit wir dich erkennen und dein Discord-Konto mit deinem Seatbit-Konto verbinden
        können. Dein Discord-Passwort, deine Serverliste und deine Nachrichten bekommen wir nicht.
      </p>

      <h3>Dein Profil</h3>
      <ul>
        <li>Vor- und Nachname</li>
        <li>Dein Nickname (Gamertag) und, falls gesetzt, weitere Nicknames für bestimmte LAN-Typen oder Events</li>
        <li>Deine Wahl, ob du Erinnerungen per E-Mail bekommst</li>
        <li>Deine Sprache, falls du eine gewählt hast</li>
      </ul>

      <h3>Clans und LAN-Events</h3>
      <ul>
        <li>Zu welchen Clans du gehörst und deine Rolle dort (Mitglied, Admin, wartet auf Freigabe)</li>
        <li>Pro Event: ob du kommst, unsicher bist oder nicht kommst, ob du ein Ticket gekauft hast, ob ein Lead es bestätigt hat, und deine Notiz</li>
        <li>Platzwünsche (neben wem du sitzen willst oder nicht, bevorzugte Position oder Platz) und dein zugeteilter Platz</li>
        <li>Ob du Lead eines Events bist</li>
        <li>Wenn dich ein Lead als Gast hinzufügt, bevor du ein Konto hast: Name, Nickname und (falls bekannt) E-Mail-Adresse, die er einträgt, sowie deine Antworten und dein Platz bei seinen Events. Die E-Mail dient nur dazu, dir die Einladung zu schicken und dich zu erkennen: Meldest du dich mit einem Discord-Konto an, dessen bestätigte E-Mail übereinstimmt, oder über deinen Übernahme-Link, wandert alles auf dein eigenes Konto und der Gasteintrag wird gelöscht. Sagt ein Lead dem Discord-Bot, welches Discord-Mitglied du bist, speichern wir zusätzlich deine Discord-Benutzer-ID beim Gasteintrag, schicken dir eine DM mit deinem Übernahme-Link und übertragen alles, sobald du dich mit diesem Discord-Konto anmeldest.</li>
        <li>Inhalte, die Clan-Admins eintragen: Clan-Name, Beschreibung und Avatar, LAN-Typen, Events, Einladungslinks</li>
      </ul>

      <h3>Discord-Bot</h3>
      <ul>
        <li>Pro verknüpftem Kanal: die Discord-Server-ID, Kanal-ID und -Name, zu welchem Clan er gehört, und die Discord-Benutzer-ID der Person, die ihn verknüpft hat</li>
        <li>Die IDs der Ankündigungen, die der Bot gepostet hat, damit er sie aktuell halten kann</li>
        <li>Wenn du einen Befehl oder Button nutzt, schickt uns Discord deine Discord-Benutzer-ID, den Server und den Kanal. Damit finden wir dein Seatbit-Konto und speichern zum Beispiel deine Antwort zu einem Event. Bei <code>/claim</code> kommen auch dein Server-Nickname, Anzeigename und Benutzername dazu, die wir mit den Gästen des Clans vergleichen und nicht speichern. Andere Nachrichten liest und speichert der Bot nicht.</li>
      </ul>

      {payments && (
        <>
          <h3>Supporter-Zahlungen</h3>
          <p>
            Unterstützt ein Clan-Admin diese Instanz, läuft die Zahlung über die Bezahlseite von Stripe. Stripe erhebt
            Name, E-Mail-Adresse und Zahlungsdaten (Karte, TWINT oder Wallet) der zahlenden Person. Kartennummern oder
            TWINT-Daten sehen wir nie. Wir speichern für den Clan nur: die Kunden- und Abo-IDs bei Stripe, ob er jährlich
            oder monatlich zahlt und bis wann bezahlt ist. Das Protokoll des Clans hält fest, wann er Supporter wurde.
          </p>
        </>
      )}

      <h3>Technische Daten</h3>
      <ul>
        <li>Login-Sitzungen mit der IP-Adresse und dem Browser (User Agent), mit denen sie erstellt wurden</li>
        <li>Ein Protokoll, welche Erinnerungen verschickt wurden, damit niemand dieselbe zweimal bekommt</li>
        <li>Ein Protokoll der Änderungen von Leads und Admins (zum Beispiel wer einen Platz verschoben, eine Antwort geändert, ein Ticket bestätigt, eine Rolle geändert oder einen Gast bearbeitet hat), mit Zeit, wer die Änderung gemacht hat und wen sie betrifft</li>
        <li>Server-Logs (Zeit, aufgerufene Seite, IP-Adresse, Fehlermeldungen), die unser Server kurz aufbewahrt</li>
      </ul>

      <h2>3. Zweck und Rechtsgrundlage</h2>
      <ul>
        <li><strong>Um den Dienst für dich und deinen Clan zu betreiben</strong> (Konto, Events, Tickets, Plätze, Discord-Bot). Rechtsgrundlage: Erfüllung unserer Vereinbarung mit dir (Art. 6 Abs. 1 lit. b DSGVO).</li>
        <li><strong>Um dir Erinnerungen zu schicken</strong> zu Fristen und kommenden Events, per E-Mail und in verknüpften Discord-Kanälen. Rechtsgrundlage: unsere Vereinbarung mit dir; E-Mails kannst du in deinem Profil ausschalten.</li>
        <li><strong>Um den Dienst sicher zu halten</strong> und Probleme zu beheben (Sitzungen, Logs, Backups). Rechtsgrundlage: unser berechtigtes Interesse an einem funktionierenden, sicheren Dienst (Art. 6 Abs. 1 lit. f DSGVO).</li>
        {payments && (
          <li><strong>Um freiwillige Supporter-Zahlungen abzuwickeln</strong> und die vorgeschriebenen Buchhaltungsbelege aufzubewahren. Rechtsgrundlage: unsere Vereinbarung mit der zahlenden Person und unsere gesetzlichen Pflichten (Art. 6 Abs. 1 lit. b und c DSGVO).</li>
        )}
        <li><strong>Um gesetzliche Pflichten zu erfüllen.</strong> Rechtsgrundlage: Art. 6 Abs. 1 lit. c DSGVO.</li>
      </ul>
      <p>
        Wir verkaufen deine Daten nicht, zeigen keine Werbung, nutzen keine Tracking- oder Analyse-Tools und treffen
        keine automatisierten Entscheidungen und kein Profiling. Seatbit setzt nur das Cookie, das dich angemeldet hält,
        und, wenn du im Footer eine Sprache wählst, ein Cookie, das sie sich merkt.
      </p>

      <h2>4. Wer deine Daten sieht</h2>
      <ul>
        <li><strong>Mitglieder deiner Clans</strong> sehen deinen Namen, Nickname, Avatar und ob du an die Events dieses Clans kommst. Sobald der Sitzplan fixiert ist, sehen sie, wer wo sitzt.</li>
        <li><strong>Clan-Admins und Event-Leads</strong> sehen zusätzlich Ticketstatus, Notizen und Platzwünsche ihrer Events und können die Teilnehmerliste exportieren. Clan-Admins sehen das Protokoll ihres Clans.</li>
        <li><strong>Leute in einem verknüpften Discord-Kanal</strong> sehen die Ankündigungen des Bots, inklusive der Nicknames derer, die kommen, unsicher sind oder auf der Warteliste stehen.</li>
        <li><strong>Plattform-Admins</strong> dieser Seatbit-Instanz können alle Daten sehen, um den Dienst zu betreiben und zu unterstützen.</li>
      </ul>

      <h2>5. Dienstleister und Übermittlung ins Ausland</h2>
      <p>
        {legal.hostingLocation
          ? `Diese Seatbit-Instanz läuft auf einem Server in ${legal.hostingLocation}.`
          : "Diese Seatbit-Instanz läuft auf einem Server, den ihr Betreiber gewählt hat."}{" "}
        Mit diesen Dienstleistern teilen wir Daten nur, soweit nötig:
      </p>
      <ul>
        <li>
          <strong>Discord Inc.</strong> (USA) für die Anmeldung und den Bot. Discord bearbeitet deine Daten nach seiner
          eigenen{" "}
          <a href="https://discord.com/privacy" target="_blank" rel="noreferrer">
            Datenschutzerklärung
          </a>
          . Dein Profilbild wird von den Servern von Discord geladen.
        </li>
        <li>
          <strong>Unser E-Mail-Anbieter</strong>, der die Erinnerungen zustellt und dafür deine E-Mail-Adresse, deinen
          Namen und den Text der Erinnerung erhält.
        </li>
        {payments && (
          <li>
            <strong>Stripe Payments Europe, Ltd.</strong> (Irland), zusammen mit Stripe, Inc. (USA), wickelt als unser
            Zahlungsanbieter die Supporter-Zahlungen ab und bewahrt die gesetzlich vorgeschriebenen Zahlungsbelege auf.
            Siehe die{" "}
            <a href="https://stripe.com/privacy" target="_blank" rel="noreferrer">
              Datenschutzerklärung
            </a>{" "}
            von Stripe.
          </li>
        )}
      </ul>
      <p>
        Gehen Daten in ein Land ohne angemessenen Datenschutz (wie die USA), stützt sich die Übermittlung auf das
        Swiss-U.S. bzw. EU-U.S. Data Privacy Framework, wo der Empfänger zertifiziert ist, oder auf die von der
        EU-Kommission genehmigten und vom EDÖB anerkannten Standardvertragsklauseln.
      </p>

      <h2>6. Wie lange wir Daten aufbewahren</h2>
      <ul>
        <li>Konto-, Profil- und Eventdaten: solange dein Konto besteht. Verlässt du einen Clan, wird deine Mitgliedschaft entfernt.</li>
        <li>Login-Sitzungen: bis du dich abmeldest oder sie ablaufen.</li>
        <li>Verknüpfungen mit Discord-Kanälen: bis der Kanal getrennt oder der Bot entfernt wird.</li>
        <li>Protokolleinträge: ein Jahr.</li>
        {payments && (
          <li>Supporter-Angaben eines Clans: solange der Clan besteht. Zahlungsbelege (Quittungen, Beträge, Daten): solange es das Buchhaltungsrecht verlangt, meist zehn Jahre.</li>
        )}
        <li>Server-Logs: ein paar Tage. Datenbank-Backups: bis zu 14 Tage.</li>
      </ul>
      <p>
        Du kannst dein Konto selbst in deinem <Link href="/profile?tab=data">Profil</Link> löschen (Deine Daten, Mein
        Konto löschen). Dann löschen wir Name, E-Mail, Bild, Discord-Verknüpfung, Login-Sitzungen, Nicknames, LAN-IDs,
        Clan-Mitgliedschaften, Lead-Rollen, Platzwünsche, Plätze, Fahrten, Packlisten und deine Antworten zu kommenden
        Events. Deine Antworten zu vergangenen Events (kommt oder nicht, Ticket) bleiben bei einem anonymen «Gelöschtes
        Mitglied», das sich nicht auf dich zurückführen lässt, damit die Event-Geschichte deines Clans aufgeht;
        Protokolleinträge zeigen dasselbe «Gelöschtes Mitglied». Ein Clan, in dem sonst niemand mit Login übrig ist, wird
        mit deinem Konto gelöscht. Backups werden innert 14 Tagen überschrieben.
      </p>

      <h2>7. Deine Rechte</h2>
      <p>Du hast das Recht:</p>
      <ul>
        <li>Auskunft über die Daten zu erhalten, die wir über dich haben, und eine Kopie davon;</li>
        <li>falsche Daten berichtigen zu lassen (das meiste kannst du in deinem <Link href="/profile">Profil</Link> selbst ändern);</li>
        <li>deine Daten löschen oder ihre Bearbeitung einschränken zu lassen;</li>
        <li>deine Daten in einem gängigen maschinenlesbaren Format zu erhalten («Meine Daten herunterladen» im Profil gibt dir alles als JSON-Datei);</li>
        <li>einer Bearbeitung zu widersprechen, die auf unserem berechtigten Interesse beruht;</li>
        <li>eine erteilte Einwilligung mit Wirkung für die Zukunft zu widerrufen.</li>
      </ul>
      <p>
        Daten herunterladen und Konto löschen funktionieren direkt in deinem Profil. Für alles andere schreib an{" "}
        <ContactEmail />. Du kannst dich auch bei einer Datenschutzbehörde beschweren: in der Schweiz beim
        Eidgenössischen Datenschutz- und Öffentlichkeitsbeauftragten (EDÖB,{" "}
        <a href="https://www.edoeb.admin.ch" target="_blank" rel="noreferrer">
          edoeb.admin.ch
        </a>
        ), in der EU bei der Behörde deines Landes.
      </p>
      <p>
        Den Zugriff von Seatbit auf dein Discord-Konto kannst du jederzeit in Discord unter Benutzereinstellungen,
        Autorisierte Apps, entfernen.
      </p>

      <h2>8. Sicherheit</h2>
      <p>
        Alle Verbindungen laufen über HTTPS. Secrets wie Bot-Tokens und SMTP-Passwörter werden verschlüsselt gespeichert.
        Zugriff auf den Server hat nur der Betreiber.
      </p>

      <h2>9. Kinder</h2>
      <p>
        Seatbit ist nicht für Kinder unter dem Mindestalter von Discord gedacht. Wenn du denkst, dass uns ein Kind ohne
        Erlaubnis Daten gegeben hat, melde dich, und wir löschen sie.
      </p>

      <h2>10. Änderungen</h2>
      <p>
        Wir können diese Erklärung anpassen, wenn sich Seatbit ändert. Das Datum oben zeigt die aktuelle Fassung. Siehe
        auch unsere <Link href="/terms">Nutzungsbedingungen</Link>.
      </p>
    </LegalPage>
  );
}
