# Nachtauftrag: Fortschritt

Stand: 18. Oktober 2026, abends.

## Wichtige Rahmenbedingung

Der Cloudflare-Token wurde nach der Einrichtung widerrufen. Laut Entscheidung A wird er nicht weiterverwendet, und die Infrastruktur wird nicht neu eingerichtet. Ich habe deshalb keinen Zugang, um den laufenden Worker zu aktualisieren.

Alle Änderungen am Worker sind lokal gebaut und getestet. Ausgerollt werden sie über den neuen GitHub-Workflow „Worker“, sobald du einen eng begrenzten Token als Repository-Secret `CLOUDFLARE_API_TOKEN` hinterlegst. Dieser Token läuft nie durch den Chat oder über diesen Mac. Anleitung: `docs/COMMUNITY.md`, Abschnitt „Neue Worker-Versionen veröffentlichen“.

Bis dahin läuft live der alte Worker. Er kennt `/v1/status` nicht, deshalb bleibt die Community in der App aus. Das ist gewollt und getestet.

## Aufgaben

| # | Aufgabe | Stand |
|---|---|---|
| N1 | Bestandsaufnahme, Secrets in der Git-Historie | erledigt: keine Secrets gefunden |
| N1 | D1-Grenzen geprüft | erledigt: 500 MB pro Datenbank (Free), Doku korrigiert |
| N2 | Suche nach neuen Gegenden (lateinisch, mit Makron, Japanisch) | erledigt |
| N2 | Öffnungszeiten: 翌 und 土日祝休所 übersetzt | erledigt |
| N2 | Knopf „+“ schob den Standort-Knopf auf die Liste | behoben, mit Test |
| N3 | Privater Testmodus serverseitig (Testercodes) | erledigt, lokal getestet, wartet auf Bereitstellung |
| N3 | Fotobudget 300 MB, Foto max. 1 MB, engere Tageslimits | erledigt, wartet auf Bereitstellung |
| N3 | Dubletten-Schutz für Plätze, Meldungen, Fotos | erledigt, wartet auf Bereitstellung |
| N3 | Admin: Speicheranzeige, Testercodes, Korrigieren, Positionsvorschlag | erledigt, wartet auf Bereitstellung |
| N3 | Admin-Login warf 500 im neuen Code | behoben, durch Test gefunden |
| N3 | Login-Kasten blieb nach Anmeldung sichtbar | behoben |
| N3 | Normale Besucher kontaktieren die API nicht | erledigt, live geprüft |
| N3 | Impressum und Datenschutz um Testphase ergänzt | erledigt, live |
| N3 | R2-Umzug für Fotos | beschrieben in `docs/COMMUNITY.md`, nicht aktiviert |
| N3 | Bereitstellung per GitHub Actions, Staging für Live-Tests | erledigt, wartet auf dein Secret |
| N4 | Live-End-to-End-Test in isolierter Staging-Umgebung | vorbereitet (Workflow „Worker“, staging), braucht Secret |
| N5 | Shinagawa (15) und Sumida (8) übernommen, Rechtsbewertung | erledigt, `docs/DATA_QUALITY.md` |
| N5 | Sumida-Testphase und Keiō ausgeschlossen | erledigt, mit Test |
| N5 | Konbini-Regel nachgeprüft | erledigt, bleibt |
| N6 | Volle Regression | grün (siehe unten) |
| N7 | Admin am iPhone (emuliert) | geprüft, Screenshot `docs/screenshots/admin-iphone15-emuliert.png` |
| N7 | Reddit-Text aktualisiert | erledigt, nichts gepostet |
| N7 | iPhone-Anleitung für den ersten echten Platz | `docs/IPHONE_TEST.md`, Abschnitt C |
| N9 | Monetarisierung | unverändert nur dokumentiert (`docs/MONETIZATION.md`) |

## Tests (letzter Lauf)

| Bereich | Ergebnis |
|---|---|
| Unit (Node) | 20 bestanden |
| Daten (Python) | 30 bestanden |
| Browser, 7 Geräteprofile | 128 bestanden |
| Marker-Darstellung | 20 bestanden |
| Update von alpha-final | bestanden |
| Worker-API gegen lokalen Worker | 15 bestanden |
| Community-Abläufe im Browser gegen lokalen Worker | 8 bestanden |

Alle Gerätetests laufen in emulierten Profilen (WebKit und Chromium). Ein echtes iPhone wurde nicht getestet.

## Veröffentlicht

- `main` und GitHub Pages: Frontend mit privatem Testmodus (inaktiv bis zur Bereitstellung), neue Daten für Shinagawa und Sumida, Layout-Korrektur.
- Nicht veröffentlicht: der neue Worker-Code (kein Zugang, siehe oben).
