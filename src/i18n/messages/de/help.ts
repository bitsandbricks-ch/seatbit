import type { Messages } from "../en";

export const help: Messages["help"] = {
  title: "Hilfe",
  intro: "Wie Seatbit funktioniert, Schritt für Schritt.",
  back: "Hilfe",
  nav: "Hilfe-Themen",
  flowTitle: "So läuft ein Event",
  flow: "Antworten → Ticket → Platz → Plan definitiv → An der LAN",
  stillStuck: "Nicht gefunden? Frag einen Organisator deines Clans.",
  sections: {
    start: {
      title: "Erste Schritte",
      status: "Konto, Nick, Clan beitreten",
      items: {
        a: { q: "Was ist Seatbit?", a: "Seatbit hilft deinem Clan, gemeinsam an LAN-Partys zu gehen: wer kommt, Tickets, Plätze, Anreise, Packliste und Kosten, alles an einem Ort. Die LAN selbst führt ihr eigenes Team durch; Seatbit ist für eure Gruppe." },
        b: { q: "Wie melde ich mich an?", a: "Mit deinem Discord-Konto. Beim ersten Mal gibst du Vorname, Nachname und den Nick ein, den du an LANs benutzt." },
        c: { q: "Wie trete ich meinem Clan bei?", a: "Öffne die Clan-Seite über einen Link von einem Organisator oder such sie unter Clans. Bei manchen Clans bist du sofort dabei, bei anderen bestätigt dich zuerst ein Organisator." },
        d: { q: "Ein Organisator hat mich schon als Gast eingetragen. Und jetzt?", a: "Nimm den Link von deinem Organisator oder tippe auf der Clan-Seite auf «Das bin ich». Deine Antworten und Plätze vom Gast gehen auf dein Konto über." },
      },
    },
    events: {
      title: "Events und Anmeldung",
      status: "Antworten, Warteliste, Tickets",
      items: {
        a: { q: "Wie melde ich mich an?", a: "Öffne das Event und antworte mit «Ich komme», «Unsicher» oder «Nicht dabei». Antworte vor der Frist, die in den Details steht." },
        b: { q: "Was ist eine Interessensabfrage?", a: "Bevor die Anmeldung öffnet, fragen die Organisatoren vielleicht «Wärst du dabei?». Das ist nicht verbindlich: Es hilft ihnen zu entscheiden, wie viele Plätze sie anfragen. Deine Antwort wird übernommen, sobald die Anmeldung öffnet." },
        c: { q: "Was passiert, wenn die Gruppe voll ist?", a: "Neue Antworten kommen auf die Warteliste. Wird ein Platz frei, rückt je nach Event die erste Person automatisch nach, oder die Organisatoren entscheiden. Du bekommst so oder so eine E-Mail und eine Discord-DM." },
        d: { q: "Wie funktionieren Tickets?", a: "Du kaufst dein Ticket selbst im Ticketshop des Events und hakst dann in deiner Checkliste «Ich habe mein Ticket» ab. Ab dann ist deine Antwort fix; sag einem Organisator Bescheid, wenn sich etwas ändert. Auf der Warteliste wartest du, bis du nachrückst." },
        e: { q: "Wofür ist die Checkliste?", a: "Sie zeigt den Schritt, der jetzt zählt, mit einem Knopf, der dich hinführt. Tippe darauf, um alle Schritte zu sehen. «So läuft dieses Event» darunter erklärt den ganzen Ablauf für dieses Event." },
      },
    },
    seats: {
      title: "Plätze",
      status: "Wünsche, selbst wählen, definitiv, tauschen",
      items: {
        a: { q: "Woher kommen unsere Plätze?", a: "Das Event gibt der Gruppe einen Platzblock. Die Organisatoren tragen ihn in Seatbit ein, und alle bekommen einen Platz in diesem Block." },
        b: { q: "Was sind Platzwünsche?", a: "Sag den Organisatoren, neben wem du direkt oder in der Nähe sitzen möchtest, oder einen Platz, eine Reihe, den Rand oder die Mitte. Dein oberster Wunsch zählt am meisten; zieh die Wünsche, um die Reihenfolge zu ändern. Du kannst auch sagen, neben wem du lieber nicht direkt sitzt: Das sehen nur die Organisatoren." },
        c: { q: "Kann ich meinen Platz selbst wählen?", a: "Wenn die Organisatoren das für das Event eingeschaltet haben, ja: Tippe im Tab «Plätze» auf einen freien Platz und dann auf «Diesen Platz nehmen». Dafür musst du zuerst dein Ticket abhaken." },
        d: { q: "Was heisst «definitiv»?", a: "Die Organisatoren prüfen den Plan und machen ihn definitiv. Danach ändert sich dein Platz nur noch, wenn du fragst. Hat das Event einen eigenen Sitzplan, buchen die Organisatoren dort danach alle Plätze." },
        e: { q: "Wer möchte neben mir sitzen?", a: "Hat sich jemand gewünscht, neben oder in deiner Nähe zu sitzen, zeigt das der Tab «Plätze», und du kannst die Person mit einem Tipp zu deinen eigenen Wünschen hinzufügen. Wünsche «Nicht direkt neben» sieht die genannte Person nie." },
        f: { q: "Kann ich Plätze tauschen?", a: "Sobald der Plan definitiv ist, frag jemanden im Tab «Plätze». Wenn die Person zustimmt, bestätigt ein Organisator den Tausch." },
      },
    },
    trip: {
      title: "Reise",
      status: "Fahrten, Schlafplätze, Packliste, Games, Kosten",
      items: {
        a: { q: "Wann erscheint der Tab «Reise»?", a: "Einige Wochen vor dem Event (30 Tage, ausser deine Instanz hat es geändert), oder früher, sobald jemand dort etwas eingetragen hat." },
        b: { q: "Fahrten und Schlafplätze", a: "Biete freie Plätze in deinem Auto oder einen Schlafplatz an, oder trag ein, von wo du eine Fahrt brauchst. Die Einträge sind nach Ort gruppiert." },
        c: { q: "Packliste", a: "Deine eigene Liste: Hak ab, was gepackt ist, und füg eigene Sachen hinzu. Niemand sonst sieht sie." },
        d: { q: "Games", a: "Stimm ab, was du spielen möchtest, und hak ab, sobald es installiert ist: Das Internet an der LAN ist oft langsam." },
        e: { q: "Geteilte Kosten", a: "Trag ein, was du für die Gruppe bezahlt hast (Benzin, ein Zimmer, Snacks), teil es auf und sieh, wer wem was schuldet. Rechnet ab, sobald ihr euch das Geld zurückgegeben habt." },
      },
    },
    lan: {
      title: "An der LAN",
      status: "Einchecken, Bestellungen",
      items: {
        a: { q: "Einchecken", a: "Tipp auf «Ich bin da», wenn du ankommst, damit die anderen sehen, wer schon da ist." },
        b: { q: "Bestellungen", a: "Pizza holen oder in den Supermarkt: Wer geht, startet eine Bestellung, alle tragen ein, was sie möchten, und die Liste zeigt, wer wie viel schuldet. Der Tab «Bestellungen» erscheint, sobald das Event beginnt." },
      },
    },
    roles: {
      title: "Wer macht was",
      status: "Mitglieder, Organisatoren, Clan-Rollen",
      items: {
        a: { q: "Was sind Organisatoren?", a: "Leute aus deinem Clan, die die Reise an ein Event planen: Sie kümmern sich um die Anmeldung, die Plätze, die News und die Buchung. Jedes Event zeigt seine Organisatoren mit Discord und E-Mail." },
        b: { q: "Clan-Rollen", a: "Admins führen den Clan. Event-Manager erstellen und führen die Events des Clans. Recruiter bestätigen Beitrittsanfragen und tragen Mitglieder und Gäste ein. Mitglieder antworten auf Events und können trotzdem Organisator einzelner Events sein." },
        c: { q: "Wer führt die LAN selbst durch?", a: "Das Team des Events. Seatbit ist nur für die Reise eurer Gruppe dorthin." },
      },
    },
    discord: {
      title: "Discord",
      status: "Anmeldung, DMs, Bot",
      items: {
        a: { q: "Warum Discord?", a: "Du meldest dich damit an, und der Seatbit-Bot kann dir Erinnerungen und News als DM schicken. Die DMs kannst du in deinem Profil ausschalten." },
        b: { q: "/verify", a: "Führ /verify auf dem Discord-Server deines Clans aus (oder tippe in deinem Profil auf «Bestätigen»), damit Seatbit weiss, dass das Discord-Konto wirklich dir gehört. Dann bekommst du ein grünes Discord-Abzeichen." },
      },
    },
    account: {
      title: "Benachrichtigungen und Daten",
      status: "E-Mails, DMs, Notfallkontakt, Konto löschen",
      items: {
        a: { q: "Benachrichtigungen", a: "Wähl in deinem Profil, welche E-Mails und Discord-DMs du bekommst." },
        b: { q: "Notfallkontakt und Ernährung", a: "Freiwillig, in deinem Profil. Nur die Organisatoren der Events, an die du gehst, sehen die Angaben." },
        c: { q: "Sprache und Darstellung", a: "Wechsle oben auf der Seite zwischen Deutsch und Englisch und zwischen hell und dunkel." },
        d: { q: "Deine Daten", a: "Lade alles herunter, was Seatbit über dich speichert, oder lösch dein Konto: in deinem Profil unter «Deine Daten»." },
      },
    },
    leads: {
      title: "Für Organisatoren",
      status: "Event erstellen, Plätze planen, definitiv machen, buchen",
      items: {
        a: { q: "Event erstellen", a: "Starte bei einem LAN-Typ, dann werden Plätze, Fristen und To-dos übernommen. Neue Events sind zuerst Entwürfe, die nur Organisatoren sehen; veröffentliche sie, wenn sie bereit sind." },
        b: { q: "Plätze planen", a: "Trag den Platzblock unter Verwalten → Plätze ein. Mitglieder schicken Wünsche oder wählen selbst; die Planung verteilt den Rest nach ihren Wünschen. Speichere Varianten, um Pläne zu vergleichen." },
        c: { q: "Definitiv machen und buchen", a: "Stimmt der Plan, mach ihn definitiv: Wünsche und Selbstwahl schliessen, und alle sehen ihren Platz. Dann buch die Plätze auf der Seite des Events und hak jede Person ab." },
        d: { q: "Alle auf dem Laufenden halten", a: "Schreib News, schick Erinnerungen und nutz die Organisator-Checkliste und die To-dos unter Verwalten → Übersicht, damit nichts vergessen geht." },
      },
    },
  },
};
