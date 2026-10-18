# Nachtauftrag: Fortschritt

Stand: 18. Oktober 2026, abends. Zwei Durchgänge: Nachmittag (privater Testmodus, Shinagawa und Sumida) und Abend (Sicherheit, Sicherung, Staging-Tests, Datenschutz, Namen).

## Cloudflare-Status

| Ressource | Name | Zustand |
|---|---|---|
| Worker | `smokr-api` | live, Modus `private`, HTTPS unter `https://smokr-api.stefan-boschmeier.workers.dev` |
| D1 | `smokr-community` | Migrationen 0001 und 0002, 1 Testercode („Stefan iPhone“), keine Einsendungen |
| Turnstile | Widget „Smokr“ | unverändert, für `shortzn.github.io` |
| Staging | `smokr-api-staging`, `smokr-community-staging(-restore)` | nur während Testläufen, danach gelöscht |
| Kosten | | 0 €, Workers Free und D1 Free, nichts Kostenpflichtiges aktiv |

Bereitstellung nur über GitHub Actions „Worker“ (staging, dann production von `main`). Token als Repository-Secret.

## Aufgaben

| # | Aufgabe | Stand |
|---|---|---|
| N1 | Bestandsaufnahme, Secrets in allen 28 Commits | keine Secrets |
| N1 | Sicherheitsprüfung mit Belegen | `docs/SECURITY_REVIEW.md` |
| N2 | Namen: 29 mehr zusammengesetzt, Nummern, Bindestriche, Lage im Gebäude (68 Orte) | live |
| N2 | Suche EN/DE/JA, Rōmaji, Makron, Marken | geprüft, unabhängig von der App-Sprache |
| N2 | Community-Plätze mit unklarem Zugang wurden als öffentlich gezeigt | behoben |
| N2 | Marker: Trefferfläche 44 px, Symbol zusätzlich zur Farbe, reduzierte Bewegung | geprüft, keine Änderung nötig |
| N3 | Privater Testmodus serverseitig, Testercodes | live |
| N3 | D1-Grenzen nach aktueller Doku | 500 MB pro Datenbank, 100 KB pro Anweisung, Time Travel 7 Tage |
| N3 | Sicherung: Export mit Fotos ließ sich nicht wiederherstellen (SQLITE_TOOBIG) | behoben mit `worker/tools/d1-restore-prepare.mjs`, auf Cloudflare getestet |
| N3 | Erste echte Sicherung der Produktion | im iCloud-Ordner Smokr/Sicherungen |
| N3 | Export enthält jetzt das Moderationsprotokoll | live |
| N3 | Texte abgelehnter Beiträge wurden nie gelöscht (Datenschutz sagte anderes) | behoben, Löschung nach 30 Tagen, getestet |
| N3 | Datenschutz: Fristen, Sicherungen, keine Cookies, Rauchen ab 20 | live |
| N3 | Formular: Hinweis auf Prüfung und CC BY auch ohne Foto | live |
| N3 | Offene Rechtsfragen | `docs/legal/OPEN_POINTS.md` |
| N3 | setup.sh gegen versehentlichen zweiten Lauf gesperrt | erledigt |
| N4 | Browser-Abläufe gegen echten Staging-Worker (Chromium, WebKit) | 8 von 8 |
| N4 | API-Tests gegen echten Staging-Worker | bestanden (2 nur lokal, brauchen mehrere IPs) |
| N4 | Sicherung, Wiederherstellung, Time Travel auf Staging | bestanden, alles byte-identisch |
| N4 | Erster echter Platz vorbereitet | Testcode liegt in `smokr-testcode.txt` im iCloud-Ordner, live geprüft |
| N5 | Shinagawa 15, Sumida 8 | live (Nachmittag) |
| N5 | Sumida-Kaufhäuser, Kyoto | recherchiert, kein aktueller Beleg, keine Änderung |
| N5 | Konbini: ein OSM-Punkt umging die Regel | behoben, Datentest |
| N6 | Volle Regression | grün |
| N6 | Leistung gemessen (4× gedrosselte CPU) | Liste 0,8 s, alle Städte 2,5 s, 1,2 MB; doppelter Neuaufbau beim Start entfernt |
| N6 | Netzabbruch, Turnstile fehlt | Test: verständliche Meldung, Eingaben bleiben |
| N7 | Rückmeldung ohne Community: „Problem per E-Mail melden“ | live |
| N7 | Reddit-Text und Modmail | `docs/REDDIT.md`, nichts gepostet; Regeln nicht automatisch lesbar |
| N7 | Admin am iPhone | emuliert geprüft (Nachmittag), echter Test offen (C13) |
| N9 | Monetarisierung | Dokument passt zur Entscheidung, nichts umgesetzt |

## Commits (Abend)

- `61f7624` Sicherheit und Sicherung: XSS-Test, Upload-Missbrauch, getestete Wiederherstellung
- `c929961` Community-Test: Foto vor der Prüfung ins Bild scrollen
- `06b714a` Namen und Lage im Gebäude
- `708a098` Datenschutz wie im Code, Rückmeldung per E-Mail, Aufräumen geprüft
- `62e94ab` Konbini-Regel lückenlos, Start ohne doppelte Arbeit, Robustheitstests
- `eb5a585` Sicherheitsprüfung, Sicherungsablauf, Reddit-Text, iPhone-Anleitung

Wiederherstellungspunkte: Tags `alpha-final`, `beta-1`, `beta-2`, `beta-3`, neu `beta-4`.

## Tests (letzter voller Lauf)

| Bereich | Ergebnis |
|---|---|
| Unit (Node) | 22 bestanden |
| Daten (Python) | 36 bestanden |
| Browser, 7 Geräteprofile | 137 bestanden |
| Marker-Darstellung | 20 bestanden |
| Update von alpha-final | bestanden |
| Worker-API lokal | 18 bestanden |
| Community-Abläufe lokal | 8 bestanden |
| Staging auf Cloudflare | Browser 8, API, Sicherung: bestanden |

Alle Gerätetests laufen in emulierten Profilen. Ein echtes iPhone wurde nicht getestet.

## Offene Nutzerhandlungen

1. Token-Datei und `smokr-testcode.txt` im iCloud-Ordner nach Übernahme löschen.
2. iPhone-Test `docs/IPHONE_TEST.md` (A, B, C), erster echter Platz.
3. Subreddit-Regeln lesen, Reddit-Beitrag selbst posten.
4. Öffentliche Freigabe (Variante B) entscheiden.
