import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ContactEmail, LegalPage, Operator } from "@/components/legal-page";
import { getLegal } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of Service · Seatbit",
  description: "The rules for using Seatbit and the Seatbit Discord bot.",
};

// Reads the operator settings on every request.
export const dynamic = "force-dynamic";

export default function TermsPage() {
  const legal = getLegal();
  // Operators can use their own document instead of the built-in one.
  if (legal.termsUrl) redirect(legal.termsUrl);
  return (
    <LegalPage title="Terms of Service">
      <p>
        Seatbit helps a group of friends (a &quot;clan&quot;) coordinate who goes to which LAN party, who has bought a
        ticket, and who sits where. These terms apply to the Seatbit website and to the Seatbit Discord bot
        (together, the &quot;Service&quot;). By signing in or adding the bot to a Discord server, you agree to them.
      </p>

      <h2>1. Who runs Seatbit</h2>
      <Operator />
      <p>
        This site runs Seatbit, free and open-source software by{" "}
        <a href="https://bitsandbricks.ch" target="_blank" rel="noreferrer">
          bitsandbricks.ch
        </a>{" "}
        (<a href={legal.sourceUrl} target="_blank" rel="noreferrer">source code</a>). The operator named above runs
        this instance and is responsible for it; the authors of the software are not, unless they are the operator.
        Seatbit is not affiliated with, endorsed by or run on behalf of Discord or any LAN party organiser. Tickets and seats at a LAN party are always sold and allocated by its organiser; Seatbit only
        helps your group keep track of them.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>You sign in with your Discord account. You need to meet Discord&apos;s minimum age and, where the law of your country requires it, have your parents&apos; consent.</li>
        <li>Give your real first name and surname. Your clan uses them to match you to tickets and seats.</li>
        <li>Keep your Discord account secure. You are responsible for what happens under your account.</li>
        <li>You can delete your account at any time on your <Link href="/profile">profile</Link> (see the <Link href="/privacy">Privacy Policy</Link>).</li>
      </ul>

      <h2>3. Clans, orgas and admins</h2>
      <p>
        Anyone can create a clan. Clan admins decide who can join, manage LAN types and events, and may approve,
        add or remove members. Orgas of an event can see and edit the attendance, ticket status, seat wishes and seat
        assignments of that event. Clan admins and orgas must only use this information to organise the group&apos;s
        trip to the LAN, and must not copy it elsewhere for other purposes.
      </p>

      <h2>4. The Discord bot</h2>
      <ul>
        <li>Only someone who manages a clan in Seatbit may link a Discord channel to that clan (with <code>/seatbit here</code>).</li>
        <li>Once linked, the bot posts event announcements, reminders and the list of attendee nicknames in that channel. Everyone who can read the channel can see them.</li>
        <li>Whoever adds the bot to a server is responsible for having the right to do so and for telling the server&apos;s members about it.</li>
        <li>You can unlink a channel at any time with <code>/seatbit stop</code>, in the clan settings, or by removing the bot from the server.</li>
        <li>Your use of Discord is also governed by Discord&apos;s own Terms of Service and policies.</li>
      </ul>

      <h2>5. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>post content that is illegal, offensive, harassing, or that infringes someone else&apos;s rights (this includes nicknames, notes, clan names and avatars);</li>
        <li>enter data about other people that they have not agreed to share;</li>
        <li>try to access data or clans you are not a member of, or disrupt, overload or probe the Service;</li>
        <li>use the Service to send spam or for commercial purposes without our permission.</li>
      </ul>
      <p>We may remove content, clans or accounts and block access when these terms are broken.</p>

      <h2>6. Your content</h2>
      <p>
        You keep all rights to what you enter. You allow us to store and show it to the members of your clans, and in
        Discord channels linked to those clans, as far as needed to run the Service.
      </p>

      <h2>7. Availability and changes</h2>
      <p>
        The Service is provided free of charge, &quot;as is&quot; and &quot;as available&quot;. We may change, pause or
        shut it down at any time. We will try to give notice before shutting it down so you can export your data, but
        we do not promise any particular uptime. Always check important dates (ticket sales, deadlines) with the LAN
        party organiser as well.
      </p>

      <h2>8. Liability</h2>
      <p>
        To the extent permitted by law, we are not liable for any damage resulting from using or not being able to use
        the Service, in particular for missed tickets, seats, deadlines or reminders, or for lost data. Liability for
        intent and gross negligence, and any liability that cannot be excluded by law, remains unaffected.
      </p>

      <h2>9. Changes to these terms</h2>
      <p>
        We may update these terms. The date at the top shows the current version. If a change is significant, we will
        tell you in the app or by email. If you keep using the Service after a change, you accept the new terms.
      </p>

      <h2>10. Law and jurisdiction</h2>
      <p>
        These terms are governed by {legal.governingLaw ?? "the law of the country where the operator is based"}. The
        courts at the operator&apos;s place of residence or registered office have jurisdiction, unless mandatory
        consumer protection law gives you the right to sue in your own country.
      </p>

      <h2>11. Contact</h2>
      <p>
        Questions about these terms: <ContactEmail />.
      </p>
    </LegalPage>
  );
}
