import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ContactEmail, LegalPage, Operator } from "@/components/legal-page";
import { getLegal } from "@/lib/legal";
import { billingEnabled } from "@/lib/billing";

export const metadata: Metadata = {
  title: "Privacy Policy · Seatbit",
  description: "What personal data Seatbit and the Seatbit Discord bot process, why, and your rights.",
};

// Reads the operator settings on every request.
export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  const legal = getLegal();
  // Operators can use their own document instead of the built-in one.
  if (legal.privacyUrl) redirect(legal.privacyUrl);
  // Stripe only appears where the operator turned on Supporter payments.
  const payments = billingEnabled();
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
      </ul>

      <h3>Clans and LAN events</h3>
      <ul>
        <li>Which clans you belong to, and your role there (member, admin, waiting for approval)</li>
        <li>For each event: whether you are coming, unsure or not coming, whether you bought a ticket, whether an orga confirmed it, and any note you add</li>
        <li>Seat wishes (people you want to sit near or not next to, preferred position or seat) and the seat you are assigned</li>
        <li>Whether you are an orga of an event</li>
        <li>If an orga adds you as a guest before you have an account: the name, nickname and (if they have it) email address they enter, and your answers and seat for their events. The email is only used to send you the invite and to recognise you: when you sign in with a Discord account whose verified email matches, or through your claim link, this moves to your own account and the guest entry is deleted.</li>
        <li>Content clan admins enter: clan name, description and avatar, LAN types, events, invite links</li>
      </ul>

      <h3>Discord bot</h3>
      <ul>
        <li>For each linked channel: the Discord server ID, channel ID and name, which clan it belongs to, and the Discord user ID of whoever linked it</li>
        <li>The IDs of the announcement messages the bot posted, so it can keep them up to date</li>
        <li>When you use a command or button, Discord sends us your Discord user ID, the server and channel. We use it to find your Seatbit account and, for example, save your answer to an event. The bot does not read or store other messages.</li>
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
        <li>An audit log of changes orgas and admins make (for example who moved a seat, changed someone&apos;s answer, confirmed a ticket, changed a role or edited a guest), with the time, who made the change and who it was about</li>
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
        automated decisions or profiling. Seatbit only sets the cookie needed to keep you signed in.
      </p>

      <h2>4. Who can see your data</h2>
      <ul>
        <li><strong>Members of your clans</strong> see your name, nickname, avatar and whether you are coming to that clan&apos;s events. Once the seat plan is final they see who sits where.</li>
        <li><strong>Clan admins and event orgas</strong> also see ticket status, notes and seat wishes for their events, and can export the attendee list. Clan admins see their clan&apos;s audit log.</li>
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
        You can delete your account yourself on your <Link href="/profile">profile</Link> (Your data, Delete my
        account). We then delete your name, email, picture, Discord link, login sessions, nicknames, LAN IDs, clan
        memberships, orga roles, seat wishes, seats, rides, packing lists and your answers to upcoming events. Your
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
