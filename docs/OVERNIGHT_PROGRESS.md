# Nachtauftrag: Fortschritt

Laufend geführt. Stand: 18. Oktober 2026, Start 16:30 (Japan-Zeit ca. 23:30).

## Wichtige Rahmenbedingung

Der Cloudflare-Token wurde nach der Einrichtung widerrufen. Laut Entscheidung A wird er nicht weiterverwendet, und die Infrastruktur wird nicht neu eingerichtet. Ich habe deshalb keinen Zugang, um den laufenden Worker zu aktualisieren. Alle Änderungen am Worker werden lokal gebaut und getestet und liegen für die Bereitstellung über GitHub Actions bereit (siehe unten). Ausgerollt werden sie, sobald es einen neuen, eng begrenzten Bereitstellungs-Token als GitHub-Secret gibt. Dieser Token läuft nie durch den Chat oder über diesen Mac.

## Aufgaben

| # | Aufgabe | Stand |
|---|---|---|
| N1 | Bestandsaufnahme, Secrets in der Git-Historie | erledigt: keine Secrets gefunden |
| N1 | D1-Grenzen geprüft | erledigt: 500 MB pro Datenbank (Free), Doku war falsch |
| N3 | Privater Testmodus serverseitig (Testercodes) | in Arbeit |
| N3 | Fotobudget, kleinere Fotos, engere Tageslimits | in Arbeit |
| N3 | Dubletten-Schutz für Einsendungen | in Arbeit |
| N3 | Admin: Speicheranzeige, Testercodes, Einträge korrigieren | in Arbeit |
| N3 | Bereitstellung per GitHub Actions, Staging für Live-Tests | offen |
| N4 | Live-End-to-End-Test in isolierter Staging-Umgebung | blockiert, braucht Bereitstellungs-Token |
| N2 | Lokalisierung, Suche, mobile UX nachprüfen | offen |
| N5 | Shinagawa, Sumida, Rechtsbewertung, Konbini-Prüfung | offen |
| N6 | Tests, Leistung, Robustheit | laufend |
| N7 | Reddit, Feedback, Admin am iPhone | offen |
