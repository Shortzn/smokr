# Smokr Beta: Abnahme (Phase 4)

Stand 18. Oktober 2026. Release-Tag `beta-1`, Rollback-Tag `alpha-final`.

## Ergebnis

**READY WITH NON-BLOCKING ISSUES** für die öffentliche Karten-Beta unter https://shortzn.github.io/smokr/.

Zwei Dinge sind noch offen:

- **Community-Funktionen:** fertig und getestet, aber ausgeschaltet. Es fehlen das Cloudflare-Konto (deine Anmeldung), Turnstile, Impressum und Datenschutzerklärung.
- **Größerer Beta-Aufruf, etwa auf Reddit:** erst nach den echten iPhone-Tests unten.

## Entscheidungen zur Veröffentlichung

Dein Nachtrag zur Veröffentlichungsstrategie gilt vor dem längeren Auftrag:

- **Adresse:** Es gibt eine einzige öffentliche Adresse, die bisherige GitHub-Pages-URL. Cloudflare Pages und `pages.dev` werden nicht verwendet.
- **Alpha:** Die Alpha auf `main` wurde nach bestandenen Tests ersetzt.
  - Der alte Stand ist als Tag `alpha-final` gesichert (Commit `79b203a`).
  - Rollback: `git checkout alpha-final -- app`, dann committen und pushen. Nur `main` darf auf Pages veröffentlichen.
- **Backend:** Für die Community ein separater Cloudflare Worker mit D1. Begründung in `docs/COMMUNITY.md`.
- **Repository:** bleibt öffentlich.

## Phase 4A: Datenqualität und Sprachen

- **Konbinis:** Ein Konbini zählt nur noch als Raucherplatz, wenn der OSM-Eintrag seit 2024 geprüft ist. Ungeprüfte sind als „unbestätigt“ markiert und standardmäßig aus. Liegt ein OSM-Raucherplatz höchstens 25 m entfernt, fällt der Konbini als Dublette weg.

  | Ort | Konbini-Einträge | belegt | unbestätigt | doppelt |
  |---|---:|---:|---:|---:|
  | Tokio | 53 | 2 | 50 | 1 |
  | Kamakura | 0 | 0 | 0 | 0 |
  | Kyoto | 0 | 0 | 0 | 0 |
  | Okinawa | 4 | 1 | 3 | 0 |
  | Osaka | 1 | 0 | 1 | 0 |

  Die Datenpipeline erhält nur Konbinis mit einer Rauch-Angabe (`smoking=*`). Weitere Konbinis ohne Angabe waren nie in den Daten.
- **Sprachen:** Die ganze Oberfläche gibt es auf Englisch, Deutsch und Japanisch, mit Englisch als Standard und Rückfall. Die Wahl wird gespeichert.
  - **Abgedeckt:** Warnungen, Filter, Formulare, Fehlermeldungen, Stadtregeln, Legende und Info.
  - **Nicht übersetzt:** Japanische Eigennamen, Adressen und Ortsbeschreibungen bleiben im Original.
  - **Öffnungszeiten:** Sie werden nur nach bekannten Mustern übersetzt. Sonst bleibt zusätzlich das Original stehen.
- **Datenschema 3:** Art und Rauchbereich sind jetzt Codes statt deutscher Texte.
- **Service Worker v8:** Ein Update von der Alpha und von `beta-0` (`c4a66d9`) ist getestet. Alte Caches werden auch dann entfernt, wenn die alte Version kurz danach noch schreibt. Rückmeldungen und Filter bleiben erhalten.

## Phase 4B/4C: Community (gebaut, ausgeschaltet)

Alle Einzelheiten stehen in `docs/COMMUNITY.md`. Kurz:

- **Neue Plätze:** Position per GPS oder Karten-Nadel, Art, Tabak, Zugang, optionale Felder und Foto.
- **Meldungen:** gefunden, gibt es nicht, geschlossen, falsche Position, falsche Angaben, anderes. Jeweils mit optionalem Foto.
- **Fotos:**
  - Im Browser neu kodiert, auf dem Server erneut geprüft und von Metadaten befreit.
  - Vor der Freigabe auch per direkter URL nicht abrufbar.
  - Ablehnen löscht die Bilddaten.
  - Jedes öffentliche Foto lässt sich melden.
- **Moderation** unter `/admin` des Workers:
  - Freigeben, Ablehnen, als Dublette ablehnen (mit Hinweis auf Plätze im Umkreis von 60 m), Platz ausblenden, Fotos zurückziehen, Sicherung herunterladen.
  - Geschützt durch serverseitige Sitzung, Passwort-Hash und CSRF-Schutz.
- **Schutz:**
  - Turnstile auf allen Einsendungen.
  - Origin-Prüfung und Zähler pro Gerät und global.
  - Strenge Eingabeprüfung, keine Links.
  - IP nur als täglich wechselnder Hash, nach 30 Tagen gelöscht.
- **In der App:**
  - Freigegebene Plätze erscheinen als „Community“.
  - Bestätigungen hängen sich an Plätze.
  - Geprüfte Hinweise zu fehlenden oder geschlossenen Plätzen erscheinen als Warnung.
  - Ausgeblendete Plätze verschwinden.
  - Ohne Backend gibt es keine Community-Knöpfe.

## Kosten

| | Bisher | Nach Einrichtung der Community |
|---|---|---|
| GitHub Pages | 0 € | 0 € |
| Cloudflare Workers Free, D1 Free, Turnstile | nicht eingerichtet | 0 € im kostenlosen Kontingent |
| Eigene Domain | keine | keine |

Entstandene Kosten: **0 €**.

Kosten in Zukunft entstehen nur, wenn du es freigibst:

- **Workers Paid:** ab 5 $ im Monat, wenn mehr als 100.000 Anfragen am Tag anfallen.
- **R2 für Fotos:** über 10 GB kostenpflichtig. Aktivieren lässt es sich nach meinem Wissensstand nur mit Zahlungsmethode.

Die Zähler im Worker begrenzen Schreibvorgänge, damit das kostenlose Kontingent nicht überläuft.

## Tests

| Suite | Ergebnis |
|---|---|
| Logik `node --test` | 19 von 19 |
| Daten `unittest` | 14 von 14, darunter die Konbini-Regel und die ausgelieferten Dateien |
| Abläufe Playwright, 7 Geräteprofile | 107 bestanden. Übersprungen sind nur Tests, die für ein Profil nicht gelten. |
| Update von `alpha-final` und von `c4a66d9` | je bestanden, mehrfach wiederholt |
| Community-API gegen lokalen Worker | 9 von 9 |
| Community-Abläufe im Browser gegen lokalen Worker | 5 von 5 (Chromium Desktop, iPhone 15, iPhone SE) |
| Rauchtest gegen die Live-Adresse | iPhone 15 (WebKit) und Pixel 7 (Chromium) ohne Fehler, Liste nach 1,3 s und 3,1 s |

### Was die Community-Tests prüfen

- Schreiben geht nur vom eigenen Ursprung und mit Turnstile.
- Ungültige Eingaben werden abgelehnt: außerhalb Japans, falsche Werte, Links, zu lange Texte, Foto ohne Zustimmung, PNG statt JPEG, manipulierte IDs.
- Eine Einsendung bleibt privat bis zur Freigabe.
- EXIF, XMP, Kommentar und angehängte Daten sind aus dem gespeicherten Foto entfernt.
- Schutz der Admin-Sitzung:
  - Admin-Zugriff gibt es nur mit Sitzung.
  - Eine gefälschte Sitzung wird abgelehnt.
  - Ohne Admin-Header wird nicht moderiert (Schutz gegen CSRF).
- Eine Meldung wirkt erst nach Freigabe.
- Ausblenden geht nur durch den Admin.
- Ein gemeldetes Foto lässt sich zurückziehen, danach sind die Bilddaten gelöscht.
- Die Sicherung enthält keine IP-Hashes.
- Die Ratenbegrenzung greift.
- Die Admin-Seite sendet strenge Sicherheits-Header.

## Echte iPhone-Tests: weiter offen

Bevor wir aktiv auf Smokr aufmerksam machen, bitte auf einem echten iPhone prüfen:

1. **Blatt ziehen und scrollen** mit dem Finger, bei ein- und ausgeblendeten Safari-Leisten.
2. **Bildschirmränder:** Dynamic Island, Home-Indikator, Querformat.
3. **Home-Bildschirm:** Smokr neu hinzufügen, den Standort dort erlauben und „Route starten“ in Apple Karten öffnen.
4. **Standort:** erlauben und ablehnen, schwaches GPS in Bahnhöfen.
5. **Offline:** Flugmodus nach einmaligem Laden.
6. **Sprachen:** Englisch und Japanisch umschalten, Text auf kleinem Bildschirm.
7. **Konbinis:** unbestätigte Konbinis ein- und ausblenden.
8. **Nach Einschalten der Community:**
   - Foto aus der Kamera und aus der Mediathek, auch HEIC.
   - Turnstile auf iOS.
   - Tastatur über den Formularfeldern.
   - Einreichen.
9. **Update:** Bleiben deine bisherigen Rückmeldungen nach dem Update erhalten?

## Deine manuellen Schritte

1. **Community einschalten:** `npx wrangler login`, Turnstile-Widget anlegen, `sh worker/tools/setup.sh`. Danach mir Worker-Adresse und Site Key nennen. Details in `docs/COMMUNITY.md`.
2. **Recht:** Impressum und Datenschutzerklärung mit deinen Daten fertigstellen. Vorlagen liegen in `docs/legal/`.
3. **iPhone:** die iPhone-Tests oben.
4. **Reddit:** Regeln der Subreddits lesen, dann den Entwurf aus `docs/REDDIT.md` posten.
