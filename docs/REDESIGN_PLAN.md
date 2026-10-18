# Smokr: Reliability und UX-Redesign

Branch `redesign/uber-ux`. `main` und die Live-Version bleiben bis zur Freigabe unverändert.

## Befund (geprüft am Code, 2026-10-18)

| # | Befund | Stelle | Status |
|---|---|---|---|
| B1 | Ist ein GPS-Standort bekannt, sortiert die Liste immer nach dem GPS-Standort. Nach dem Wechsel auf eine andere Stadt erscheinen weiter Plätze des alten Standorts, oder die Meldung „nichts eingetragen“. | `origin()`, `moveend`-Handler in `app.js` | bestätigt |
| B2 | Nach einem Kartenschwenk wird die Liste bei aktivem GPS nicht neu sortiert. Man kann die sichtbare Umgebung also nicht absuchen. | `moveend`: `if (!state.pos …)` | bestätigt |
| B3 | „Min. zu Fuß“ wird aus der Luftlinie geteilt durch 75 m/min berechnet und als Gehzeit ausgegeben. | `fmtWalk()` | bestätigt |
| B4 | Das Datum einer offiziellen Liste wird als „Geprüft“ angezeigt. Ein OSM-`check_date` wird in offizielle Einträge kopiert und erscheint dann gleich. | `renderDetail()`, `build_data.py` (`chk`) | bestätigt |
| B5 | Alle Lokale (`k: v`) werden als „Kaufpflicht“ ausgegeben, auch Konbini-Aschenbecher und OSM-Cafés, für die das nicht belegt ist. | `metaLine()`, `renderDetail()` | bestätigt |
| B6 | Die Dublettenerkennung nimmt den ersten offiziellen Treffer im Radius, nicht den nächsten. Ein offizieller Platz kann mehrere OSM-Plätze schlucken, ein zweiter, eigenständiger Platz in der Nähe verschwindet dann. Gemessen: 6 Fälle mit falschem Partner, 9 offizielle Plätze mit mehr als einem geschluckten OSM-Platz. | `merge()` in `build_data.py` | bestätigt |
| B7 | Schlägt das Laden einer Stadtdatei fehl, wird das still übergangen. Die Oberfläche meldet dann „hier ist nichts eingetragen“. | `loadData()` | bestätigt |
| B8 | `kitsuen.geo` wird schon vor einer erfolgreichen Standortabfrage auf `true` gesetzt. Nach einer Ablehnung fragt die App bei jedem Start erneut. | `startGeo()` | bestätigt |
| B9 | Service Worker: Eigene Dateien sind „Netz zuerst“ ohne Zeitlimit. Bei schlechtem Netz (U-Bahn) hängt der Start, bis die Anfrage scheitert. `trimTiles()` liest bei jedem Kartenteil alle Cache-Schlüssel. | `sw.js` | bestätigt |
| B10 | Service Worker wird nur unter `https:` registriert, Offline-Verhalten ist lokal nicht testbar. | `app.js` Ende | bestätigt |
| B11 | Lizenzhinweis: Osaka-Daten stehen unter CC BY 4.0, die Info-Seite nennt das nicht. | `index.html` Info | bestätigt |
| B12 | Kein Zustand „von dir nicht gefunden“ ist umkehrbar, ohne den Platz zu finden. Ausgeblendete Plätze erscheinen nirgends mehr in der Liste. | `renderList()` | bestätigt, Komfort |

Nicht bestätigt: GPS-Updates setzen die Karte nicht ständig zurück, das passiert nur beim ersten Fix nach dem Tippen auf „Standort“.

## Plan

### Phase 1: Verlässlichkeit

1. **Zustandsmodell Standort** (`app/core.js`): Modus `nearby` (Liste ab GPS) oder `area` (Liste ab Kartenmitte). Nutzergesten, Stadtwechsel und Suchauswahl wechseln nach `area`. Nur der Standort-Knopf wechselt nach `nearby`. GPS-Updates bewegen die Karte nie. Ausnahme: der erste Fix nach dem Tippen auf den Knopf.
2. **Entfernung** nur als „Luftlinie“. Keine Gehzeit. Die Routen-Links öffnen Apple Karten und Google Maps mit Fußweg.
3. **Datenschema v2** in `build_data.py`: getrennte Felder für Herkunft (`off`, `osm`), Datum der offiziellen Liste, OSM-Prüfdatum, Positionsgenauigkeit (`pos`) und Zugang (`acc`: `public`, `customers`, `unknown`).
4. **Dubletten**: eins-zu-eins, nächster Partner zuerst.
5. **Ladefehler** pro Stadt sichtbar, mit „Erneut versuchen“. Schema-Prüfung.
6. **Service Worker**: Netz zuerst mit 3,5 s Zeitlimit, sonst Cache. Aufräumen der Kartenteile gedrosselt. Registrierung auch auf `localhost`.
7. **Tests**: `node --test` für die Logik in `core.js`, `unittest` für `build_data.py`.

### Phase 2: Redesign

Karte vollflächig, schwebende Bedienelemente (Stadt, Suche, Filter, Standort), ziehbares Blatt mit drei Rastpunkten, Markersystem mit Formen und Clustern, neue Liste und Detailansicht, Filter „Ich rauche: Zigaretten, Tabakerhitzer, beides“, Desktop mit Seitenpanel. Playwright-Tests mit WebKit und Chromium.

### Phase 3: Abnahme

Playwright-Szenarien aus dem Auftrag, Abnahmebericht in `docs/ACCEPTANCE.md`.
