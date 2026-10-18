# Smokr Community: Architektur, Einrichtung und Betrieb

Stand: 18. Oktober 2026, privater Testmodus

## Entscheidung

Das Frontend bleibt auf GitHub Pages unter https://shortzn.github.io/smokr/. Für die Community-Funktionen kommt ein eigener Cloudflare Worker mit D1-Datenbank dazu. Spam-Schutz übernimmt Cloudflare Turnstile.

- Fotos liegen vorerst **in D1**, nicht in R2.
- Eine eigene Domain und Cloudflare Pages sind nicht nötig. Die API läuft unter einer kostenlosen Adresse der Form `smokr-api.<konto>.workers.dev`.

### Vergleich

| Kriterium | Supabase (Free) | Cloudflare Workers + D1 + Turnstile |
|---|---|---|
| Einfachheit | Datenbank, Speicher, Auth und Rechte (RLS) in einem Dashboard. Für anonyme Einsendungen mit Moderation braucht es trotzdem eigene Edge Functions und sorgfältige RLS-Regeln. | Ein einziger Worker mit eigenem, kleinem Code. Eine Datenbank, keine Rechte-Regeln: Der Worker ist das einzige Tor. |
| Sicherheit | Der öffentliche anon key liegt im Browser. Jede Lücke in den RLS-Regeln macht Tabellen direkt angreifbar. | Die Datenbank ist von außen nicht erreichbar. Jede Eingabe läuft durch Prüfcode im Worker. Turnstile ist eingebaut. |
| Kosten | 0 €. Kostenlose Projekte werden nach etwa einer Woche ohne Nutzung pausiert und müssen dann von Hand geweckt werden. | 0 €. Kein Pausieren. Workers Free: 100.000 Anfragen pro Tag. D1 Free: 500 MB pro Datenbank, 5 GB pro Konto, 5 Mio. gelesene und 100.000 geschriebene Zeilen pro Tag. Turnstile kostenlos. |
| Wartung | Eine Plattform mehr. Updates von Postgres und Supabase laufen automatisch, Pausieren muss man beobachten. | Kein Server. Abhängigkeiten nur zur Entwicklungszeit (wrangler). |
| Fotos | Storage mit privatem Bucket und signierten URLs ist gut gelöst. | Vorerst in D1: höchstens 1 MB pro Bild, Fotobudget 300 MB (die Datenbank selbst darf 500 MB groß werden). Später R2, kostenlos bis 10 GB. R2 lässt sich nur mit hinterlegter Zahlungsmethode aktivieren, deshalb jetzt nicht. |
| Skalierung | Gut, kostet ab dem Pro-Plan (25 $/Monat). | Workers Paid ab 5 $/Monat hebt alle Grenzen stark an. R2 kann jederzeit dazukommen, ohne die App zu ändern. |

**Ergebnis:** Cloudflare Workers + D1 + Turnstile.

- **Sicherheit:** Die Datenbank ist nie direkt erreichbar.
- **Kosten:** 0 € ohne Pausieren.
- **Wartung:** am geringsten.

R2 kommt erst dazu, wenn du eine Zahlungsmethode freigibst und das Fotobudget von 300 MB nicht mehr reicht (siehe „Später: Fotos nach R2“).

## Was gebaut ist

| Teil | Datei | Zweck |
|---|---|---|
| Datenbank | `worker/migrations/0001_init.sql`, `0002_private_mode.sql` | Einreichungen, Meldungen, Fotos, gemeldete Fotos, ausgeblendete Plätze, Zähler, Moderationsprotokoll, Testercodes, Positionsvorschläge |
| API | `worker/src/index.js` | Öffentliche Endpunkte, Moderation, täglicher Aufräum-Cron |
| Foto-Prüfung | `worker/src/jpeg.js` | Prüft JPEG Segment für Segment, entfernt EXIF, GPS, XMP, Kommentare und angehängte Daten |
| Sicherheit | `worker/src/security.js` | Turnstile, Zähler, gesalzener IP-Hash, PBKDF2-Passwort, HMAC-Sitzung |
| Moderation | `worker/src/admin.js` | Oberfläche unter `/admin`: Warteschlange, Korrigieren, Speicheranzeige, Testercodes |
| App | `app/community.js`, `app/app.js` | Formulare, Fotoaufbereitung im Browser, Anzeige freigegebener Daten |
| Einstellung | `app/config.js` | API-Adresse und Turnstile Site Key (beide öffentlich). Ob die Community sichtbar ist, entscheidet der Server. |
| Bereitstellung | `.github/workflows/worker.yml` | Staging-Test und Veröffentlichung über GitHub Actions |

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

### Ort finden beim Hinzufügen

Drei Wege, die Nadel zu setzen. Die Nadel steht immer in der Kartenmitte, Suche und GPS bewegen nur die Karte.

| Weg | Dienst | Bedingungen |
|---|---|---|
| Name (Restaurant, Geschäft, Bahnhof) | Nominatim der OpenStreetMap Foundation | nur auf Knopfdruck, kein Autocomplete, höchstens 1 Anfrage pro Sekunde, Ergebnisse im Speicher, Quelle angezeigt. Abschaltbar ohne neue App-Version: Variable `GEOCODE=off` im Worker, `/v1/status` meldet es. [Richtlinie](https://operations.osmfoundation.org/policies/nominatim/) |
| Japanische Adresse | Geolonia-Adressdaten (Adress-Basisregister der Digital Agency) | CC BY 4.0, ohne Schlüssel, bis zur Hausnummer. Quelle angezeigt. |
| Google-Maps-Link, Koordinaten | keiner, die Position steht im Link | Ortsmarke (`!3d…!4d…`) gilt als Ort, `@…` nur als Kartenausschnitt (ungefähr). |
| Kurzlink `maps.app.goo.gl` | eigener Worker, `POST /v1/resolve-link` | liest nur die Weiterleitung, keine Inhalte von Google; nur mit Testercode, 30 pro Gerät und Tag, nur Google-Kurzlink-Adressen. |
| GPS, Karte | keiner | wie bisher |

**Genauigkeit:** Eine Suche findet das Gebäude, nicht den Raucherraum darin. Deshalb fragt das Formular „Wie genau sitzt die Nadel?“ (genau am Raucherplatz, am Gebäude oder Eingang, nur ungefähr). Voreinstellung: GPS und Karte „genau“, Suche „Gebäude“, Ortsteil oder Kartenausschnitt „ungefähr“. Gespeichert werden `pos_quality`, `pos_source` und die gefundene Adresse (Migration 0003). In der App erscheint „Position des Gebäudes“ mit Hinweis, in der Moderation lässt sich die Genauigkeit korrigieren.

**Nicht verwendet:** die Adresssuche des GSI (laut GSI vor allem für die eigene Karte gedacht, ohne Zusage für Dritte) und keine kostenpflichtigen Dienste (Google Geocoding, Mapbox).

### Modus: aus, privat, öffentlich

Der Schalter heißt `COMMUNITY_MODE` und steht in `worker/wrangler.toml`. Er wirkt auf dem Server, nicht nur in der App.

| Modus | Wirkung |
|---|---|
| `off` | Der Server nimmt nichts an (503). Die App zeigt keine Community. |
| `private` | Nur mit gültigem **Testercode**. Ohne Code: 403, die App zeigt keine Knöpfe und fragt keine Community-Daten ab. |
| `public` | Für alle, mit Turnstile und den Zählern unten. Erst nach ausdrücklicher Freigabe. |

Die App fragt beim Start `GET /v1/status`. Antwortet der Server nicht oder mit einem Fehler, bleibt die Community aus.

**Testercodes:**
- Erzeugt werden sie nur in der Moderation unter „Testzugänge“. Format `XXXX-XXXX-XXXX-XXXX`, 16 Zeichen aus 32 Zeichen (80 Bit Zufall).
- Der Code wird genau einmal angezeigt. Gespeichert ist nur sein SHA-256-Hash.
- Eingabe in der App über den Link `https://shortzn.github.io/smokr/#community`. Groß und klein, Leerzeichen und Bindestriche sind egal.
- Der Code liegt danach im Browser (`kitsuen.tester`) und geht bei jeder Einsendung mit. Der Server prüft ihn jedes Mal.
- „Widerrufen“ in der Moderation sperrt einen Code sofort. In der Info der App beendet „Testmodus beenden“ ihn auf dem Gerät.
- Raten: Nach 20 falschen Codes pro Tag ist für dieses Gerät Schluss, auch mit richtigem Code.
- Der Link selbst ist **keine** Zugangskontrolle. Er öffnet nur die Eingabe.

### Sicherheit

- **Schreiben** geht nur mit gültigem Turnstile-Token (serverseitig geprüft, Hostname geprüft) und nur von der eigenen Seite (Origin-Prüfung, CORS nur für `https://shortzn.github.io`). Im privaten Modus zusätzlich nur mit Testercode.
- **Prüfungen:** Jede Eingabe wird auf dem Server geprüft:
  - Koordinaten innerhalb Japans, auch beim Positionsvorschlag.
  - Feste Auswahllisten für Art, Tabak und Zugang.
  - Längengrenzen für Texte.
  - Steuerzeichen werden entfernt.
  - Links werden abgelehnt.
  - Anfragen über 2 MB werden abgewiesen, Fotos über 1 MB auch.
- **Dubletten:**
  - Ein Gerät kann in 24 Stunden keinen zweiten Platz im Umkreis von 30 m einreichen.
  - Dieselbe Meldung (Gerät, Platz, Art) zählt in 24 Stunden nur einmal.
  - Dasselbe Foto wird kein zweites Mal gespeichert.
- **Zähler pro Tag und Gerät** (IP nur als täglich wechselnder, gesalzener Hash):
  - 10 neue Plätze, 30 Meldungen, 10 Fotos, 20 Foto-Meldungen, 20 falsche Testercodes.
  - Global 500 Schreibvorgänge und 60 Fotos pro Tag. Das schont das Kontingent von 100.000 geschriebenen Zeilen.
  - Alle Werte lassen sich ohne Codeänderung über Variablen `LIMIT_<NAME>` anpassen, zum Beispiel `LIMIT_SUBMISSION`.
- **Fotobudget:** Insgesamt höchstens 300 MB Bilddaten (`PHOTO_BUDGET_BYTES`). Ist es voll, antwortet der Server mit 507 und die App sagt „Fotospeicher ist voll“. Einsendungen ohne Foto gehen weiter. Die Moderation zeigt den Füllstand als Balken.
- **Admin:**
  - Passwort nur als PBKDF2-Hash im Secret.
  - Sitzung als signiertes, `HttpOnly`-, `Secure`-, `SameSite=Strict`-Cookie, nur für `/admin`, 12 Stunden gültig.
  - Schreibende Admin-Aufrufe brauchen den eigenen Ursprung und einen eigenen Header (Schutz gegen CSRF).
  - Höchstens 8 Anmeldeversuche pro Tag und Gerät.
  - Strenge Content-Security-Policy, kein Einbetten in Frames.
  - Alle Nutzertexte werden als Text gesetzt, nie als HTML.
  - „Korrigieren“ ändert Name, Stockwerk, Hinweis, Art, Tabak, Zugang und Position, mit denselben Prüfungen wie öffentliche Eingaben. Jede Änderung steht im Moderationsprotokoll.
- **Keine Secrets im Repository.** Lokal liegen Testwerte in `worker/.dev.vars`, das ist in `.gitignore`.
- **Täglicher Cron:**
  - Löscht Zähler nach 2 Tagen.
  - Entfernt IP-Hashes nach 30 Tagen.
  - Löscht abgelehnte Fotos.
  - Verwirft nie geprüfte Fotos nach 90 Tagen.

### Grenzen von D1 Free

| Grenze | Wert | Bei Smokr |
|---|---|---|
| Größe pro Datenbank | 500 MB | Fotobudget 300 MB, Rest für Einträge |
| Größe pro Konto | 5 GB | eine Datenbank |
| Größe pro Zeile | 2 MB | Fotos höchstens 1 MB |
| Abfragen pro Aufruf | 50 | eine Einsendung mit Foto braucht etwa 13 |
| Länge einer SQL-Anweisung | 100 KB | betrifft nur die Wiederherstellung, siehe unten |
| Time Travel | 7 Tage | automatisch |
| Gelesene Zeilen pro Tag | 5 Mio. | `/v1/community` liest alle freigegebenen Einträge; bei mehr Last hilft ein Cache (auf workers.dev nur eingeschränkt) |
| Geschriebene Zeilen pro Tag | 100.000 | globaler Deckel 500 Schreibvorgänge |

Eine frühere Fassung dieses Dokuments nannte 5 GB als Grenze. Das gilt pro Konto, nicht pro Datenbank. Geprüft am 18.10.2026 in der Cloudflare-Dokumentation (Limits, Pricing, Time Travel). Überschreitungen im Free-Plan kosten nichts, Anfragen werden dann bis zum nächsten Tag abgewiesen.

### Später: Fotos nach R2

Vorbereitet, nicht aktiviert. R2 braucht eine Zahlungsmethode im Cloudflare-Konto und damit deine Freigabe.

1. Bucket `smokr-photos` anlegen, Bindung `PHOTOS` in `wrangler.toml`.
2. In `storePhoto` die Bytes nach R2 schreiben und in D1 nur Größe, Hash und Status halten (`bytes` bleibt leer, neue Spalte `r2_key`).
3. `getPhoto` liest zuerst aus R2, sonst aus D1. So laufen alte und neue Fotos gleichzeitig.
4. Einmaliges Skript kopiert vorhandene Fotos nach R2 und leert danach `bytes`.
5. Fotobudget auf R2 umstellen (10 GB kostenlos).

### Datenschutz und Recht

- **Daten:**
  - Kein Konto, kein Tracking, keine Werbung.
  - Turnstile lädt erst, wenn jemand ein Formular öffnet.
  - Gespeichert werden der Inhalt der Einsendung und ein kurzlebiger IP-Hash.
- **Lizenz:** Für Fotos und Texte stimmen Einsender einer Veröffentlichung unter CC BY 4.0 nach Prüfung zu.
- **Impressum und Datenschutz:** online unter `app/legal.html` (Englisch und Deutsch), verlinkt in der Info der App und im Formular.
- **Meldewege (Melde- und Abhilfeverfahren nach DSA):**
  - „Foto melden“ in der App.
  - GitHub Issues als Kontakt.
  - Die Moderation kann Fotos und Einträge jederzeit zurückziehen.

### Sicherung und Wiederherstellung

| Weg | Wann | Wie |
|---|---|---|
| Time Travel | Fehler in den letzten 7 Tagen (Free) | `npx wrangler d1 time-travel restore smokr-community --timestamp=<Unix-Zeit>`. Überschreibt die Datenbank, gibt ein Lesezeichen zum Rückgängigmachen aus. |
| JSON-Export | Überblick, Archiv | Moderation, „Sicherung herunterladen“. Ohne Bilddaten, ohne IP-Hashes. |
| Vollständige Sicherung | regelmäßig, vor großen Änderungen | `npx wrangler d1 export smokr-community --remote --output smokr-<Datum>.sql` (mit Bildern). Privat ablegen, nicht ins Repository. |

**Wiederherstellen aus der vollständigen Sicherung:** D1 nimmt keine Anweisung über 100 KB an, der Export schreibt aber jedes Foto in eine einzige Zeile. Deshalb zuerst umwandeln:

```sh
node worker/tools/d1-restore-prepare.mjs smokr-<Datum>.sql restore.sql
npx wrangler d1 create smokr-community-restore
npx wrangler d1 execute smokr-community-restore --remote --file restore.sql
```

Danach die neue Datenbank prüfen und erst dann in `wrangler.toml` umstellen. Die Produktionsdatenbank wird dabei nicht angefasst.

**Getestet:** Jeder Staging-Lauf des Workflows „Worker“ exportiert die Staging-Datenbank samt einem 600-KB-Foto, spielt sie in eine frische Datenbank ein, vergleicht alle Tabellen und Bilder und setzt die Staging-Datenbank per Time Travel zurück (`tests/tools/backup-restore-test.sh`, verweigert alles ohne „staging“ im Namen).

## Einrichtung und Bereitstellung

**Eingerichtet am 18. Oktober 2026:** Worker `smokr-api` unter `https://smokr-api.stefan-boschmeier.workers.dev`, D1-Datenbank `smokr-community`, Turnstile-Widget „Smokr“, Admin-Passwort in deiner Passwörter-App. Der Token von damals ist widerrufen. `worker/tools/setup.sh` wird nicht mehr gebraucht und soll nicht erneut laufen: Es würde das Turnstile-Secret neu erzeugen.

### Neue Worker-Versionen veröffentlichen

Über GitHub Actions. Der Token liegt nur als Secret bei GitHub, nie im Chat, nie auf dem Mac.

**Token:** seit 18.10.2026 als Repository-Secret `CLOUDFLARE_API_TOKEN` hinterlegt (Rechte: Workers Scripts Edit, D1 Edit, Account Settings Read). Nur falls er einmal ersetzt werden muss:
1. dash.cloudflare.com, Profil, **API Tokens**, **Create Token**, **Create Custom Token**.
2. Name `smokr-deploy`. Rechte:
   - Account · Workers Scripts · Edit
   - Account · D1 · Edit
   - Account · Account Settings · Read
3. Account Resources: nur dein Konto. Zone Resources: keine. Turnstile wird nicht gebraucht.
4. Token kopieren.
5. github.com/Shortzn/smokr, **Settings**, **Secrets and variables**, **Actions**, **New repository secret**. Name `CLOUDFLARE_API_TOKEN`, Wert einfügen, speichern.

**Jedes Mal:**
1. github.com/Shortzn/smokr, **Actions**, **Worker**, **Run workflow**.
2. Zuerst `staging`: legt einen Wegwerf-Worker mit leerer Datenbank an, führt alle API-Tests aus und löscht danach alles wieder. Es entstehen keine Daten in der echten Datenbank.
3. Ist das grün: noch einmal mit `production` und Branch `main`. Das spielt neue Migrationen ein und veröffentlicht den Worker. Admin-Passwort, Turnstile-Secret und Schlüssel bleiben, wie sie sind. Am Ende prüft der Lauf, dass eine Einsendung ohne Testercode abgewiesen wird.

Den Token kannst du nach Abschluss der Testphase im Cloudflare-Dashboard löschen und bei Bedarf neu anlegen.

**Kosten:** keine. Kostenpflichtige Dienste (Workers Paid, R2, Images, Logpush) werden nicht aktiviert.

## Tests

```sh
sh tests/tools/worker-test.sh       # API gegen lokalen Worker (15 Tests)
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
