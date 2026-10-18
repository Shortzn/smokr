# Smokr Community: Architektur, Einrichtung und Betrieb

Stand: 18. Oktober 2026

## Entscheidung

Das Frontend bleibt auf GitHub Pages unter https://shortzn.github.io/smokr/. Für die Community-Funktionen kommt ein eigener Cloudflare Worker mit D1-Datenbank dazu. Spam-Schutz übernimmt Cloudflare Turnstile.

- Fotos liegen vorerst **in D1**, nicht in R2.
- Eine eigene Domain und Cloudflare Pages sind nicht nötig. Die API läuft unter einer kostenlosen Adresse der Form `smokr-api.<konto>.workers.dev`.

### Vergleich

| Kriterium | Supabase (Free) | Cloudflare Workers + D1 + Turnstile |
|---|---|---|
| Einfachheit | Datenbank, Speicher, Auth und Rechte (RLS) in einem Dashboard. Für anonyme Einsendungen mit Moderation braucht es trotzdem eigene Edge Functions und sorgfältige RLS-Regeln. | Ein einziger Worker mit eigenem, kleinem Code. Eine Datenbank, keine Rechte-Regeln: Der Worker ist das einzige Tor. |
| Sicherheit | Der öffentliche anon key liegt im Browser. Jede Lücke in den RLS-Regeln macht Tabellen direkt angreifbar. | Die Datenbank ist von außen nicht erreichbar. Jede Eingabe läuft durch Prüfcode im Worker. Turnstile ist eingebaut. |
| Kosten | 0 €. Kostenlose Projekte werden nach etwa einer Woche ohne Nutzung pausiert und müssen dann von Hand geweckt werden. | 0 €. Kein Pausieren. Laut Cloudflare-Preisliste nach meinem Wissensstand: Workers 100.000 Anfragen pro Tag, D1 5 GB und 100.000 geschriebene Zeilen pro Tag, Turnstile kostenlos. Bitte vor der Einrichtung im Dashboard gegenprüfen. |
| Wartung | Eine Plattform mehr. Updates von Postgres und Supabase laufen automatisch, Pausieren muss man beobachten. | Kein Server. Abhängigkeiten nur zur Entwicklungszeit (wrangler). |
| Fotos | Storage mit privatem Bucket und signierten URLs ist gut gelöst. | Vorerst in D1 (max. 1,5 MB pro Bild, 5 GB gesamt). Später R2, kostenlos bis 10 GB. R2 lässt sich nach meinem Wissensstand aber nur mit hinterlegter Zahlungsmethode aktivieren, deshalb jetzt nicht. |
| Skalierung | Gut, kostet ab dem Pro-Plan (25 $/Monat). | Workers Paid ab 5 $/Monat hebt alle Grenzen stark an. R2 kann jederzeit dazukommen, ohne die App zu ändern. |

**Ergebnis:** Cloudflare Workers + D1 + Turnstile.

- **Sicherheit:** Die Datenbank ist nie direkt erreichbar.
- **Kosten:** 0 € ohne Pausieren.
- **Wartung:** am geringsten.

R2 kommt erst dazu, wenn du eine Zahlungsmethode freigibst und die Fotos mehr als einige GB brauchen.

## Was gebaut ist

| Teil | Datei | Zweck |
|---|---|---|
| Datenbank | `worker/migrations/0001_init.sql` | Einreichungen, Meldungen, Fotos, gemeldete Fotos, ausgeblendete Plätze, Zähler, Moderationsprotokoll |
| API | `worker/src/index.js` | Öffentliche Endpunkte, Moderation, täglicher Aufräum-Cron |
| Foto-Prüfung | `worker/src/jpeg.js` | Prüft JPEG Segment für Segment, entfernt EXIF, GPS, XMP, Kommentare und angehängte Daten |
| Sicherheit | `worker/src/security.js` | Turnstile, Zähler, gesalzener IP-Hash, PBKDF2-Passwort, HMAC-Sitzung |
| Moderation | `worker/src/admin.js` | Oberfläche unter `/admin` |
| App | `app/community.js`, `app/app.js` | Formulare, Fotoaufbereitung im Browser, Anzeige freigegebener Daten |
| Einstellung | `app/config.js` | Bleibt `api` leer, ist die Community in der App unsichtbar |

### Abläufe

- **Neuer Platz:**
  1. Auf „+“ tippen. Der Platz ist der Kartenmittelpunkt (Nadel). „Meinen Standort verwenden“ springt zum GPS, ohne GPS verschiebst du die Karte.
  2. Art, Tabak und Zugang wählen. Optional Name, Stockwerk oder Ausgang, Hinweise und ein Foto.
  3. Das Formular geht über Turnstile an den Server, der Eintrag ist zunächst `pending`.
  4. Öffentlich wird er erst nach deiner Freigabe.
- **Meldung zu einem Platz:**
  - **Arten:** gefunden, gibt es nicht, vorübergehend geschlossen, falsche Position, Zugang oder Tabak falsch, anderes. Optional mit Kommentar und Foto.
  - **Wirkung:** Erst nach deiner Freigabe zählt „gefunden“ als Bestätigung, und „gibt es nicht“ oder „geschlossen“ erscheint als geprüfter Hinweis.
  - **Ausblenden:** Nur du kannst einen Platz ausblenden. Ein einzelner anonymer Bericht ändert nichts automatisch.
- **Fotos:**
  - **Im Browser:** auf höchstens 1600 px verkleinert und neu als JPEG kodiert. Das entfernt die Metadaten bereits.
  - **Auf dem Server:** Er prüft das JPEG noch einmal vollständig und entfernt Metadaten erneut.
  - **Sichtbarkeit:** Ein nicht freigegebenes Foto liefert auch über die direkte URL `404`.
  - **Ablehnen:** Ein abgelehntes oder zurückgezogenes Foto wird sofort gelöscht, nicht nur versteckt.
  - **Melden:** Jedes öffentliche Foto hat „Foto melden“.
- **Zusammenführung in der App:**
  - Freigegebene Plätze kommen als eigene Einträge mit der Herkunft „Community“ dazu.
  - Bestätigungen hängen sich an bestehende Plätze.
  - Ausgeblendete Plätze verschwinden.
  - Offline nutzt die App den zuletzt geladenen Stand.

### Sicherheit

- **Schreiben** geht nur mit gültigem Turnstile-Token (serverseitig geprüft, Hostname geprüft) und nur von der eigenen Seite (Origin-Prüfung, CORS nur für `https://shortzn.github.io`).
- **Prüfungen:** Jede Eingabe wird auf dem Server geprüft:
  - Koordinaten innerhalb Japans.
  - Feste Auswahllisten für Art, Tabak und Zugang.
  - Längengrenzen für Texte.
  - Steuerzeichen werden entfernt.
  - Links werden abgelehnt.
  - Anfragen über 2 MB werden abgewiesen.
- **Zähler pro Tag und Gerät** (IP nur als täglich wechselnder, gesalzener Hash):
  - 10 neue Plätze, 30 Meldungen, 10 Fotos, 20 Foto-Meldungen.
  - Global 1.500 Schreibvorgänge und 300 Fotos pro Tag, damit das kostenlose Kontingent nie überläuft.
- **Admin:**
  - Passwort nur als PBKDF2-Hash im Secret.
  - Sitzung als signiertes, `HttpOnly`-, `Secure`-, `SameSite=Strict`-Cookie, nur für `/admin`, 12 Stunden gültig.
  - Schreibende Admin-Aufrufe brauchen den eigenen Ursprung und einen eigenen Header (Schutz gegen CSRF).
  - Höchstens 8 Anmeldeversuche pro Tag und Gerät.
  - Strenge Content-Security-Policy, kein Einbetten in Frames.
  - Alle Nutzertexte werden als Text gesetzt, nie als HTML.
- **Keine Secrets im Repository.** Lokal liegen Testwerte in `worker/.dev.vars`, das ist in `.gitignore`.
- **Täglicher Cron:**
  - Löscht Zähler nach 2 Tagen.
  - Entfernt IP-Hashes nach 30 Tagen.
  - Löscht abgelehnte Fotos.
  - Verwirft nie geprüfte Fotos nach 90 Tagen.

### Datenschutz und Recht

- **Daten:**
  - Kein Konto, kein Tracking, keine Werbung.
  - Turnstile lädt erst, wenn jemand ein Formular öffnet.
  - Gespeichert werden der Inhalt der Einsendung und ein kurzlebiger IP-Hash.
- **Lizenz:** Für Fotos und Texte stimmen Einsender einer Veröffentlichung unter CC BY 4.0 nach Prüfung zu.
- **Vor dem Einschalten fehlt noch:**
  - Ein **Impressum**. Als Betreiber einer öffentlichen Website aus Österreich sind Name und Anschrift Pflicht (ECG § 5, MedienG § 25).
  - Eine **Datenschutzerklärung** mit Verantwortlichem und Kontakt.
  - Vorlagen liegen in `docs/legal/`. Ich habe keine persönlichen Daten eingesetzt.
  - Ist beides online, wird die Adresse in `app/config.js` unter `legalUrl` eingetragen.
- **Meldewege (Melde- und Abhilfeverfahren nach DSA):**
  - „Foto melden“ in der App.
  - GitHub Issues als Kontakt.
  - Die Moderation kann Fotos und Einträge jederzeit zurückziehen.

### Sicherung und Wiederherstellung

- **Automatisch:** D1 Time Travel stellt die Datenbank auf einen Zeitpunkt der letzten Tage zurück (`wrangler d1 time-travel restore`).
- **Manuell:** In der Moderation „Sicherung herunterladen“ (JSON aller Einträge ohne Bilddaten) oder `npx wrangler d1 export smokr-community --remote --output backup.sql` (inklusive Bilddaten).

## Einrichtung (deine manuellen Schritte)

Diese Schritte brauchen deinen Cloudflare-Login. Sie lassen sich deshalb nicht automatisieren:

1. **Anmelden:** Im Terminal in `~/Projects/smokr` den folgenden Befehl ausführen. Er öffnet den Browser für den Cloudflare-Login. Ein kostenloses Konto reicht, eine Zahlungsmethode ist nicht nötig.

   ```sh
   npx wrangler login
   ```

2. **Turnstile anlegen:**
   - Im Cloudflare-Dashboard unter **Turnstile** auf „Add widget“ gehen.
   - Name „Smokr“, Hostname `shortzn.github.io`, Modus „Managed“.
   - Site Key und Secret Key notieren.
3. **Admin-Passwort ausdenken:** mindestens 16 Zeichen, nur für die Moderation.
4. **Einrichtungsskript starten:**

   ```sh
   sh worker/tools/setup.sh
   ```

   Es legt die D1-Datenbank an, spielt das Schema ein und fragt nach dem Turnstile-Secret und dem Admin-Passwort. Salz und Sitzungsschlüssel erzeugt es selbst. Dann veröffentlicht es den Worker und zeigt die Adresse.
5. **Mir die Worker-Adresse und den Site Key nennen.** Die Site Key ist öffentlich. Ich trage beides in `app/config.js` ein, teste gegen die echte API und veröffentliche.
6. **Impressum und Datenschutzerklärung** mit deinen Angaben aus den Vorlagen fertigstellen.

Kosten entstehen dabei keine. Kostenpflichtige Dienste (Workers Paid, R2, Images) bleiben aus.

## Tests

```sh
sh tests/tools/worker-test.sh       # API gegen lokalen Worker (9 Tests)
sh tests/tools/community-e2e.sh     # Abläufe im Browser gegen lokalen Worker
```

Beide brauchen `worker/.dev.vars` mit Testwerten. Turnstile läuft dort mit den offiziellen Testschlüsseln von Cloudflare:

```
TURNSTILE_SECRET=1x0000000000000000000000000000000AA
IP_SALT=<zufällig>
SESSION_KEY=<zufällig>
ADMIN_PASSWORD_HASH=<node worker/tools/hash-password.mjs>
ALLOWED_ORIGINS=http://127.0.0.1:4181,http://localhost:4180
TURNSTILE_HOSTNAMES=
```
