import type { Messages } from "../en";

export const settingGroups: Messages["settingGroups"] = {
  general: { title: "Allgemein", help: "Wer sich registrieren kann, wer globaler Admin ist, und die Währung für Essensbestellungen." },
  mail: { title: "E-Mail (SMTP-Relay)", help: "Für Erinnerungen und Passwort-Resets. Ohne Host werden Mails nur ins Server-Log geschrieben." },
  discord: { title: "Discord", help: "Eine Discord-Application dient für den Login-Button und den Bot." },
  google: { title: "Google-Login", help: "OAuth-Client für den Button «Mit Google anmelden»." },
  automation: { title: "Erinnerungen, Cron & Metriken", help: "Wie fällige Erinnerungen ausgelöst werden, und der Prometheus-Metrik-Endpunkt." },
  backup: { title: "Backups", help: "Seatbit kopiert seine Datenbank im laufenden Betrieb in den Backup-Ordner. Häng diesen Ordner als eigenes Volume ein und kopiere die Dateien auch weg vom Server." },
  billing: { title: "Supporter-Zahlungen", help: "Optional. Clans können diese Instanz mit einer freiwilligen jährlichen oder monatlichen Zahlung unterstützen, und alle können einmalig spenden, über Stripe. Supporter und Spender bekommen ein Abzeichen und ein Dankeschön, nie zusätzliche Funktionen. Standardmässig aus." },
  ops: { title: "Plattform-Discord", help: "Optional. Kanäle auf deinem eigenen Discord-Server, in denen der Bot dem Plattform-Team sagt, was auf dieser Instanz passiert. Der Bot muss auf diesem Server sein." },
  maintenance: { title: "Wartungsbanner", help: "Ein Banner auf jeder Seite, z.B. vor einem Upgrade. Es verschwindet von selbst, wenn die Endzeit vorbei ist." },
  connect: { title: "Online-Zahlungen für Clans", help: "Optional. Clans verbinden ihr eigenes Stripe-Konto und Mitglieder bezahlen, was sie dem Clan schulden, online (Karte, TWINT). Das Geld geht direkt an den Clan; diese Instanz ist die Stripe-Connect-Plattform. Nutzt den Stripe Secret Key der Supporter-Zahlungen. Standardmässig aus." },
  legal: { title: "Betreiber & Rechtliches", help: "Wer diese Seatbit-Instanz betreibt. Erscheint in den Nutzungsbedingungen und der Datenschutzerklärung. Füll das aus, bevor du Leute einlädst, oder verlink stattdessen deine eigenen Dokumente." },
};
