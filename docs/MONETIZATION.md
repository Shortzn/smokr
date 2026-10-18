# Monetarisierung: nur dokumentiert, nichts umgesetzt

Stand 18. Oktober 2026. Entscheidung erst mit echten Nutzungszahlen.

| | Smokr Free | Smokr Ad-Free |
|---|---|---|
| Plätze finden, Route, Filter | ja | ja |
| Plätze einreichen, bestätigen, Fotos | ja | ja |
| Werbung | später dezent | keine |
| Preis | 0 € | einmalig 3,99 € oder 4,99 €, kein Abo |

## Leitplanken

- Finden, Einreichen, Bestätigen und Fotos bleiben immer kostenlos.
- Keine Werbung, die Standortdaten an Dritte gibt. Die App hat heute kein Tracking. Personalisierte Werbung würde das ändern und bräuchte eine Einwilligung (Cookie-Banner), das schadet der Bedienung.
- Werbung nie im Weg zum nächsten Raucherplatz: nicht über der Karte, nicht vor „Route starten“.
- Tabakwerbung ist in vielen Ländern streng geregelt. Werbepartner aus der Tabakbranche vorher rechtlich prüfen lassen.

## Technische Vorbereitung für später, nicht jetzt

- Ein Einmalkauf ohne Konto lässt sich in einer Web-App schlecht sichern. Sinnvoll wird er erst mit der App-Store-Version (In-App-Kauf von Apple).
- Bis dahin wäre eine freiwillige Spende über einen externen Link die einfachste Variante, ohne Code in der App.

## Messgrößen vor einer Entscheidung

- Wiederkehrende Nutzer pro Woche. Messung nur ohne Tracking, zum Beispiel über die Zahl der Abrufe von `/v1/community` im Cloudflare-Dashboard.
- Zahl der freigegebenen Einsendungen pro Woche.
- Rückmeldungen aus der Beta zum Wunsch nach einer werbefreien Version.
