import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ContactEmail, LegalPage, Operator } from "@/components/legal-page";
import { getLegal, type Legal } from "@/lib/legal";
import { billingEnabled } from "@/lib/billing";
import { getSetting } from "@/lib/settings";
import { getLocale, getT } from "@/i18n/server";
// i18n-ignore-file: the terms are written once per language, below.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: `${t("footer.terms")} · Seatbit`, description: t("legal.termsDescription") };
}

// Reads the operator settings on every request.
export const dynamic = "force-dynamic";

export default async function TermsPage() {
  const legal = getLegal();
  // Operators can use their own document instead of the built-in one.
  if (legal.termsUrl) redirect(legal.termsUrl);
  // The payments section only exists where the operator turned on Supporter payments.
  const payments = billingEnabled();
  const n = (k: number) => k + (payments && k >= 8 ? 1 : 0);
  const refund = getSetting("billing.refundPolicy")?.trim();
  const props = { legal, payments, n, refund };
  return (await getLocale()) === "de" ? <TermsDe {...props} /> : <TermsEn {...props} />;
}

type Props = { legal: Legal; payments: boolean; n: (k: number) => number; refund?: string };

function TermsEn({ legal, payments, n, refund }: Props) {
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

      <h2>3. Clans, leads and admins</h2>
      <p>
        Anyone can create a clan. Clan admins decide who can join, manage LAN types and events, and may approve,
        add or remove members. Leads of an event can see and edit the attendance, ticket status, seat wishes and seat
        assignments of that event. Clan admins and leads must only use this information to organise the group&apos;s
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
        The Service is provided free of charge{payments && ", with every feature, whether or not your clan is a Supporter (section 8)"},
        &quot;as is&quot; and &quot;as available&quot;. We may change, pause or shut it down at any time. We will try to give notice before shutting it down so you can export your data, but
        we do not promise any particular uptime. Always check important dates (ticket sales, deadlines) with the LAN
        party organiser as well.
      </p>

      {payments && (
        <>
          <h2 id="payments">8. Supporter payments</h2>
          <ul>
            <li>
              Clan admins can choose to support this Seatbit instance on behalf of their clan with a recurring payment
              (yearly or monthly). This is voluntary: the payment goes to the operator named in section 1.
            </li>
            <li>
              Supporters get a Supporter badge on their clan and our thanks. There are no extra features, limits or
              priority support; not paying never restricts a clan.
            </li>
            <li>
              Payments are processed by Stripe. The price and the payment methods (for example card or TWINT) are shown
              before you pay. Stripe&apos;s own terms apply to the payment itself.
            </li>
            <li>
              The payment renews automatically at the end of each period until it is cancelled. Any clan admin can cancel
              at any time in the clan settings (&quot;Manage or cancel&quot;); there are no further charges, and the badge
              stays until the end of the period already paid. Deleting the clan cancels the payment right away.
            </li>
            <li>Refunds: {refund || "write to us and we will find a fair solution."}</li>
            <li>If we shut the Service down, we cancel all payments and refund the unused part of the current period.</li>
          </ul>
        </>
      )}

      <h2>{n(8)}. Liability</h2>
      <p>
        To the extent permitted by law, we are not liable for any damage resulting from using or not being able to use
        the Service, in particular for missed tickets, seats, deadlines or reminders, or for lost data. Liability for
        intent and gross negligence, and any liability that cannot be excluded by law, remains unaffected.
      </p>

      <h2>{n(9)}. Changes to these terms</h2>
      <p>
        We may update these terms. The date at the top shows the current version. If a change is significant, we will
        tell you in the app or by email. If you keep using the Service after a change, you accept the new terms.
      </p>

      <h2>{n(10)}. Law and jurisdiction</h2>
      <p>
        These terms are governed by {legal.governingLaw ?? "the law of the country where the operator is based"}. The
        courts at the operator&apos;s place of residence or registered office have jurisdiction, unless mandatory
        consumer protection law gives you the right to sue in your own country.
      </p>

      <h2>{n(11)}. Contact</h2>
      <p>
        Questions about these terms: <ContactEmail />.
      </p>
    </LegalPage>
  );
}

function TermsDe({ legal, payments, n, refund }: Props) {
  return (
    <LegalPage title="Nutzungsbedingungen">
      <p>
        Seatbit hilft einer Gruppe von Freunden (einem «Clan») abzustimmen, wer an welche LAN-Party geht, wer schon ein
        Ticket gekauft hat und wer wo sitzt. Diese Bedingungen gelten für die Seatbit-Website und den Seatbit-Discord-Bot
        (zusammen der «Dienst»). Wer sich anmeldet oder den Bot zu einem Discord-Server hinzufügt, stimmt ihnen zu.
      </p>

      <h2>1. Wer Seatbit betreibt</h2>
      <Operator />
      <p>
        Diese Seite betreibt Seatbit, freie Open-Source-Software von{" "}
        <a href="https://bitsandbricks.ch" target="_blank" rel="noreferrer">
          bitsandbricks.ch
        </a>{" "}
        (<a href={legal.sourceUrl} target="_blank" rel="noreferrer">Quellcode</a>). Der oben genannte Betreiber führt
        diese Instanz und ist für sie verantwortlich; die Autoren der Software sind es nicht, ausser sie sind selbst der
        Betreiber. Seatbit ist weder mit Discord noch mit einem Veranstalter von LAN-Partys verbunden, von ihnen
        unterstützt oder in ihrem Auftrag betrieben. Tickets und Plätze an einer LAN-Party verkauft und vergibt immer
        deren Veranstalter; Seatbit hilft deiner Gruppe nur, den Überblick zu behalten.
      </p>

      <h2>2. Dein Konto</h2>
      <ul>
        <li>Du meldest dich mit deinem Discord-Konto an. Du musst das Mindestalter von Discord erreichen und, wo es das Recht deines Landes verlangt, die Zustimmung deiner Eltern haben.</li>
        <li>Gib deinen echten Vor- und Nachnamen an. Dein Clan ordnet dich damit Tickets und Plätzen zu.</li>
        <li>Halte dein Discord-Konto sicher. Du bist verantwortlich für das, was unter deinem Konto geschieht.</li>
        <li>Du kannst dein Konto jederzeit in deinem <Link href="/profile">Profil</Link> löschen (siehe <Link href="/privacy">Datenschutzerklärung</Link>).</li>
      </ul>

      <h2>3. Clans, Leads und Admins</h2>
      <p>
        Alle können einen Clan erstellen. Clan-Admins entscheiden, wer beitreten darf, verwalten LAN-Typen und Events
        und können Mitglieder annehmen, hinzufügen oder entfernen. Leads eines Events sehen und bearbeiten Teilnahme,
        Ticketstatus, Platzwünsche und Platzzuteilung dieses Events. Clan-Admins und Leads dürfen diese Angaben nur
        nutzen, um die Reise der Gruppe an die LAN zu organisieren, und sie nicht für andere Zwecke anderswohin kopieren.
      </p>

      <h2>4. Der Discord-Bot</h2>
      <ul>
        <li>Nur wer in Seatbit einen Clan verwaltet, darf einen Discord-Kanal mit diesem Clan verknüpfen (mit <code>/seatbit here</code>).</li>
        <li>Nach dem Verknüpfen postet der Bot in diesem Kanal Event-Ankündigungen, Erinnerungen und die Liste der Nicknames der Teilnehmenden. Alle, die den Kanal lesen können, sehen sie.</li>
        <li>Wer den Bot zu einem Server hinzufügt, ist dafür verantwortlich, dass er dazu berechtigt ist, und informiert die Mitglieder des Servers darüber.</li>
        <li>Du kannst einen Kanal jederzeit mit <code>/seatbit stop</code>, in den Clan-Einstellungen oder durch Entfernen des Bots vom Server trennen.</li>
        <li>Für deine Nutzung von Discord gelten zudem die Nutzungsbedingungen und Richtlinien von Discord.</li>
      </ul>

      <h2>5. Zulässige Nutzung</h2>
      <p>Du verpflichtest dich, nicht:</p>
      <ul>
        <li>Inhalte zu posten, die rechtswidrig, beleidigend oder belästigend sind oder Rechte anderer verletzen (das gilt auch für Nicknames, Notizen, Clan-Namen und Avatare);</li>
        <li>Angaben über andere Personen einzutragen, die diese nicht teilen wollen;</li>
        <li>zu versuchen, auf Daten oder Clans zuzugreifen, in denen du nicht Mitglied bist, oder den Dienst zu stören, zu überlasten oder auszuforschen;</li>
        <li>den Dienst ohne unsere Erlaubnis für Spam oder kommerzielle Zwecke zu nutzen.</li>
      </ul>
      <p>Bei Verstössen gegen diese Bedingungen können wir Inhalte, Clans oder Konten entfernen und den Zugang sperren.</p>

      <h2>6. Deine Inhalte</h2>
      <p>
        Alle Rechte an dem, was du einträgst, bleiben bei dir. Du erlaubst uns, es zu speichern und den Mitgliedern
        deiner Clans sowie in mit diesen Clans verknüpften Discord-Kanälen anzuzeigen, soweit es für den Betrieb des
        Dienstes nötig ist.
      </p>

      <h2>7. Verfügbarkeit und Änderungen</h2>
      <p>
        Der Dienst ist kostenlos{payments && ", mit allen Funktionen, egal ob dein Clan Supporter ist (Abschnitt 8)"} und
        wird so angeboten, «wie er ist» und «wie verfügbar». Wir können ihn jederzeit ändern, pausieren oder einstellen.
        Vor einer Einstellung versuchen wir, rechtzeitig Bescheid zu geben, damit du deine Daten exportieren kannst, aber
        wir versprechen keine bestimmte Verfügbarkeit. Prüf wichtige Daten (Ticketverkauf, Fristen) immer auch beim
        Veranstalter der LAN-Party.
      </p>

      {payments && (
        <>
          <h2 id="payments">8. Supporter-Zahlungen</h2>
          <ul>
            <li>
              Clan-Admins können diese Seatbit-Instanz im Namen ihres Clans mit einer wiederkehrenden Zahlung (jährlich
              oder monatlich) unterstützen. Das ist freiwillig: Die Zahlung geht an den in Abschnitt 1 genannten
              Betreiber.
            </li>
            <li>
              Supporter bekommen ein Supporter-Abzeichen beim Clan und unseren Dank. Es gibt keine zusätzlichen
              Funktionen, Limiten oder bevorzugten Support; wer nicht zahlt, wird nie eingeschränkt.
            </li>
            <li>
              Zahlungen wickelt Stripe ab. Preis und Zahlungsarten (zum Beispiel Karte oder TWINT) werden vor dem
              Bezahlen angezeigt. Für die Zahlung selbst gelten die Bedingungen von Stripe.
            </li>
            <li>
              Die Zahlung verlängert sich am Ende jeder Periode automatisch, bis sie gekündigt wird. Alle Clan-Admins
              können jederzeit in den Clan-Einstellungen kündigen («Verwalten oder kündigen»); es fallen keine weiteren
              Kosten an, und das Abzeichen bleibt bis zum Ende der bereits bezahlten Periode. Wird der Clan gelöscht,
              endet die Zahlung sofort.
            </li>
            <li>Rückerstattung: {refund || "schreib uns, und wir finden eine faire Lösung."}</li>
            <li>Stellen wir den Dienst ein, kündigen wir alle Zahlungen und erstatten den ungenutzten Teil der laufenden Periode.</li>
          </ul>
        </>
      )}

      <h2>{n(8)}. Haftung</h2>
      <p>
        Soweit gesetzlich zulässig, haften wir nicht für Schäden aus der Nutzung oder Nichtverfügbarkeit des Dienstes,
        insbesondere nicht für verpasste Tickets, Plätze, Fristen oder Erinnerungen oder für verlorene Daten. Die Haftung
        für Vorsatz und grobe Fahrlässigkeit sowie jede Haftung, die gesetzlich nicht ausgeschlossen werden kann, bleibt
        unberührt.
      </p>

      <h2>{n(9)}. Änderungen dieser Bedingungen</h2>
      <p>
        Wir können diese Bedingungen anpassen. Das Datum oben zeigt die aktuelle Fassung. Bei wesentlichen Änderungen
        informieren wir dich in der App oder per E-Mail. Nutzt du den Dienst nach einer Änderung weiter, akzeptierst du
        die neuen Bedingungen.
      </p>

      <h2>{n(10)}. Recht und Gerichtsstand</h2>
      <p>
        Diese Bedingungen unterstehen {legal.governingLaw ?? "dem Recht des Landes, in dem der Betreiber seinen Sitz hat"}.
        Zuständig sind die Gerichte am Wohnsitz oder Sitz des Betreibers, ausser zwingendes Konsumentenschutzrecht gibt
        dir das Recht, in deinem eigenen Land zu klagen.
      </p>

      <h2>{n(11)}. Kontakt</h2>
      <p>
        Fragen zu diesen Bedingungen: <ContactEmail />.
      </p>
    </LegalPage>
  );
}
