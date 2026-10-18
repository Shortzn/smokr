# Smokr: Test- und Abnahmebericht Redesign

Stand 2026-10-18. Branch `redesign/uber-ux`. `main` und die Live-Version sind unverändert.

## Ergebnis

**READY WITH NON-BLOCKING ISSUES.** Alle automatischen Tests sind grün. Offen ist der Test auf einem echten iPhone (siehe unten). Erst danach sollte `main` aktualisiert werden.

## Behobene Fehler (Phase 1)

Die Liste der Befunde B1 bis B12 steht in [REDESIGN_PLAN.md](REDESIGN_PLAN.md). Alle zwölf sind bestätigt und behoben:

- **B1, B2 Standort:**
  - Ein Zustandsmodell in `core.js` (`locationReduce`) unterscheidet „ab GPS“ und „ab Kartenmitte“.
  - Stadtwechsel, Kartenschwenk mit der Hand und eine Auswahl aus der Suche lösen die Liste vom GPS.
  - GPS-Updates bewegen die Karte nie, außer beim ersten Fix nach dem Tippen auf den Standort-Knopf.
- **B3 Gehzeit:** Die Gehzeit ist entfernt. Entfernungen heißen überall „Luftlinie“.
- **B4 Prüfdatum:** Das Listendatum, das OSM-Prüfdatum und die eigene Rückmeldung sind getrennte Felder (Schema 2) und getrennte Zeilen in der Detailansicht.
- **B5 Kaufpflicht:** Sie steht nur dort, wo sie belegt ist. Das sind die Kundenräume aus der Liste von Osaka und OSM-Einträge mit `access=customers`. Alles andere heißt „Zugang unklar“.
- **B6 Dubletten:** Die Zusammenführung läuft jetzt eins zu eins mit dem nächsten Partner. Dadurch erscheinen 12 eigenständige Plätze wieder, die vorher verschluckt wurden.
- **B7 Ladefehler:** Ladefehler und kaputte Dateien erscheinen pro Stadt mit „Erneut laden“. Die Datei wird gegen ihr Schema geprüft.
- **B8 Standortfreigabe:** Die App merkt sie sich erst nach Erfolg.
- **B9, B10 Service Worker:**
  - Er wartet höchstens 3,5 s auf das Netz.
  - Das Aufräumen der Kartenteile ist gedrosselt.
  - Er läuft auch auf `localhost`, damit sich Offline testen lässt.
- **B11 Lizenz:** CC BY 4.0 für Osaka ist genannt.
- **B12 Ausgeblendete Plätze:** Sie lassen sich über den Filter wieder einblenden.

Beim Testen von Phase 2 kamen zwei weitere Fehler dazu:

- Ein Stadtwechsel aus der offenen Suche brach den Kartenflug ab. Grund war `setPadding` während der Bewegung.
- Nach `Esc` in der Detailansicht ging der Tastaturfokus verloren.

## UX-Entscheidungen

| Entscheidung | Warum |
|---|---|
| Liste nur nach Luftlinie sortiert | Keine versteckte Gewichtung. Die Verlässlichkeit wird gezeigt, aber nicht eingerechnet. |
| Zwei Bezugspunkte, „ab dir“ oder „ab Kartenmitte“, mit Überschrift sichtbar | Man soll immer wissen, worauf sich die Meter beziehen. |
| Blatt startet halb offen | Karte und Liste sind gleichzeitig nutzbar. |
| Halb offenes Blatt: Wischen bewegt das Blatt, nicht die Liste | So machen es native Apps. Es verhindert, dass Scrollen und Ziehen gegeneinander arbeiten. |
| Suche zeigt die Städte der Reise zuerst | Die Suche ist auch der Stadtwechsel für Leute, die das Menü nicht finden. |
| Exakter Bahnhof in der Suche zuerst | Touristen denken in Bahnhöfen. |
| „Route starten“ öffnet die bevorzugte App, die andere steht als Textlink darunter | Ein Tipp bis zur Navigation. Die Wahl lässt sich im Filter festlegen. Standard: Apple auf iPhone und Mac, sonst Google. |
| Hohle Marker für weniger verlässliche Einträge | Unsicherheit wird sichtbar, ohne Prozentwerte oder Sterne. |
| Lokale beim Start ausgeblendet | Wie in Version 1. Vermeidet „plötzlich in einem Café“. |
| Tipp auf freie Karte schließt die Detailansicht | So bedient man auch andere Karten-Apps. |

**Ersetzte Funktionen:**

| Bisher | Jetzt | Grund |
|---|---|---|
| Ortschips in der Kopfzeile | Stadtmenü und Suche | Weniger Elemente über der Karte |
| „Info“-Chip | „Info und Quellen“ am Listenende | Seltener gebraucht |
| Richtungspfeil in der Liste | entfällt | Er zeigte die Himmelsrichtung, nicht die Richtung relativ zum Handy, und war daher missverständlich. Die Nadel auf der Karte und die Route ersetzen ihn. |
| Gehzeit | entfällt | Siehe B3 |

## Designänderungen

- **Design-Tokens in `style.css`:**
  - Farben: Schwarz, Weiß und Grautöne. Farbe nur für die drei Arten (grün, braun, violett) und für Warnungen.
  - Schrift: die Systemschrift, für das Gefühl einer nativen iPhone-App.
  - Abstände im 4er-Raster, Rundungen 8, 12 und 20 px, zwei Schatten.
- **Kopfzeile:** schwebende Pillen für Stadt und Suche, runder Filterknopf mit Punkt, wenn ein Filter vom Standard abweicht.
- **Blatt:**
  - Weiß, oben 20 px gerundet, Griff oben.
  - Beim Ziehen gibt es Gummiband und Wischgeschwindigkeit, beim Einrasten eine 320-ms-Kurve.
  - Die Ansichten Liste, Detail und Suche werden kurz eingeblendet.
- **Liste:** Zeilen mit Marker-Symbol, Name (japanischer Name daneben), farbigem Zugang, grauer Herkunftszeile, Entfernung rechts. Trennlinien sind eingerückt.
- **Detail:**
  - Großer Titel und Schlagwörter.
  - Schwarzer Hauptknopf „Route starten“.
  - Darunter die Abschnitte „So findest du ihn“, „Infos“, „Herkunft der Angaben“ und „Warst du dort?“.
- **Filter:** ein Blatt mit Segmentschaltern und iOS-artigen Schaltern.
- **Karte:**
  - Eigene Marker-Grafiken für Kreis, Quadrat und Raute, gefüllt oder hohl.
  - Schwarze Cluster, grau wenn sie nur Geschäfte enthalten.
  - Schwarze Nadel für die Auswahl.
  - Quellenangabe eingeklappt unten links.
- **Seitenpanel** ab 900 px Breite und im iPhone-Querformat.
- **Reduzierte Bewegung:** Animationen fallen weg.

## Geänderte Dateien

| Datei | Inhalt |
|---|---|
| `app/core.js` (neu) | Logik ohne Oberfläche: Zugang, Herkunft, Warnungen, Filter, Reihenfolge, Suche, Standort-Zustand, Öffnungszeiten, Datenprüfung |
| `app/sheet.js` (neu) | Ziehbares Blatt |
| `app/markers.js` (neu) | Kartenzeichen und Listensymbole |
| `app/app.js` | Oberfläche neu |
| `app/index.html`, `app/style.css` | Neu aufgebaut |
| `app/sw.js` | Zeitlimit, neue Dateien, Version `smokr-v6` |
| `app/data/*.json` | Schema 2 |
| `scripts/build_data.py` | Schema 2, eins-zu-eins-Zusammenführung, Zugang und Positionsgenauigkeit |
| `tests/` | `unit/core.test.js`, `test_build_data.py`, `e2e/`, `tools/` |
| `playwright.config.js`, `package.json` | Testaufbau, nur für die Entwicklung, nicht ausgeliefert |
| `docs/REDESIGN_PLAN.md`, `docs/ACCEPTANCE.md`, `README.md` | Dokumentation |

## Tests

| Suite | Ergebnis |
|---|---|
| `node --test tests/unit/*.test.js` | 14 von 14 |
| `python3 -I -m unittest discover -s tests` | 10 von 10, davon 3 über die ausgelieferten Dateien |
| `npx playwright test` | 86 bestanden, 26 bewusst übersprungen, dreimal hintereinander stabil. Touch-Gesten zusätzlich 5 Wiederholungen. |

Playwright läuft auf diesen Geräteprofilen:

- iPhone 15, iPhone SE, iPhone 15 Pro Max und iPhone 15 quer, jeweils in WebKit
- Pixel 7 in Chromium mit echten Touch-Ereignissen
- Desktop mit Chromium (1440 × 900) und mit WebKit (1280 × 800)

Übersprungen werden nur Tests, die für das Profil keinen Sinn ergeben. Beispiele: Tastaturtests auf dem Handy, Ziehen am Blatt im Seitenpanel.

### Abgedeckte Szenarien aus dem Auftrag

| # | Szenario | Abdeckung |
|---|---|---|
| 1 | Erststart mit und ohne Standort | E2E: Ablehnung, Hinweis, App bleibt benutzbar, Freigabe wird erst nach Erfolg gemerkt |
| 2 | Wechsel der fünf Städte | E2E: Menü, Suche und Tastatur. Die Liste löst sich vom GPS. |
| 3 | Karte verschieben | E2E: mit der Maus (Desktop) und mit Touch (Chromium). Die Liste ist danach nach der neuen Mitte sortiert, ein GPS-Update setzt sie nicht zurück. |
| 4 | Marker auswählen | E2E: Tipp auf den Marker zeigt das Detail, der Marker bleibt über dem Blatt sichtbar |
| 5 | Blatt | E2E: Griff, Pfeiltasten, Touch-Wischen, Scrollen in der offenen Liste, kein Seiten-Scrollen |
| 6 | Suche und Filter | E2E: Bahnhofssuche, Stadtsuche, leere Suche, Tabakart, Zugang, Speicherung |
| 7 | Route | E2E: Links mit Fußweg, je nach Gerät Apple oder Google, öffnen in neuem Fenster |
| 8 | Offline | E2E (Chromium): Neustart ohne Netz zeigt die Liste mit Hinweis, der Hinweis verschwindet wieder online |
| 9 | Home-Bildschirm | E2E: Manifest, Icons und `viewport-fit=cover`. Der echte Start vom Home-Bildschirm ist offen. |
| 10 | Alte Daten | E2E: alte Filter und Rückmeldungen werden übernommen |
| 11 | Datenfehler | E2E: HTTP 500 und kaputtes JSON werden gemeldet, „Erneut laden“ funktioniert |
| 12 | iPhone-Größen | E2E: SE, 15 und 15 Pro Max. Nichts ragt hinaus, kein seitliches Scrollen, Zeilen mindestens 44 px hoch. |
| 13 | Querformat, Desktop, Tastatur | E2E: Seitenpanel, `/`, `Esc`, `Enter`, Pfeiltasten im Stadtmenü |

In jedem Test werden JavaScript-Fehler und Konsolenfehler gesammelt. Ihre Zahl muss null sein.

### Ladezeit

| | Live (`main`) | Branch | Unterschied |
|---|---|---|---|
| Eigene Dateien und Daten, gzip | 152 KB | 172 KB | +20 KB (+13 %) |

- **Gründe:** drei neue Skripte und ein ausführlicheres Datenschema.
- **MapLibre:** ist unverändert und kommt in beiden Versionen dazu.
- **Liste sichtbar (WebKit, lokal):** nach etwa 145 ms.

## Weiter bestehende Einschränkungen

- **Datenqualität:**
  - Plätze aus OpenStreetMap ohne Prüfdatum sind unsicher.
  - Bei Lokalen ist der Zugang meist unbekannt.
  - Die japanischen Ortsbeschreibungen sind nicht übersetzt.
- **Rückmeldungen** bleiben auf dem Gerät.
- **Kein Kompass:** Es gibt keine Blickrichtung und keine Gehzeit.
- **Offline-Karte:** nur für schon angesehene Gegenden. Es gibt kein massenhaftes Vorabladen, das ist bewusst so.
- **Ältere Geräte:** `<dialog>` braucht iOS 15.4 oder neuer.
- **Testgrenzen:**
  - Die Touch-Gesten sind nur in Chromium mit echten Touch-Ereignissen getestet.
  - In WebKit ist das Blatt nur über Griff und Tastatur getestet.
  - Den Offline-Test gibt es nur mit dem Service Worker von Chromium.
- **Kartenquellenangabe:** Sie liegt bei ganz offenem Blatt verdeckt. Vollständig steht sie unter „Info und Quellen“.

## Auf einem echten iPhone noch offen

Diese Punkte sind **nicht** auf echter Hardware geprüft:

1. **Blatt mit dem Finger:** Ziehgefühl, Wischgeschwindigkeit und Übergang zwischen Scrollen und Ziehen in Safari.
2. **Safari-Leisten:** obere und untere Leiste ein- und ausgeblendet. Liegen Blatt und Kopfzeile richtig?
3. **Dynamic Island und Home-Indikator:** Abstände der Kopfzeile, der Liste unten und des Standort-Knopfs.
4. **Start vom Home-Bildschirm:**
   - Statusleiste im Vollbild.
   - Der Standort wird in Safari und in der Home-Bildschirm-App getrennt erlaubt.
5. **Standortabfrage:** Freigabe, Ablehnung, „Beim Verwenden der App“, schwaches GPS in Häuserschluchten und Bahnhöfen.
6. **Route starten** aus der Home-Bildschirm-App: Öffnen Apple Karten und Google Maps direkt in der Fußweg-Ansicht?
7. **Tastatur** bei der Suche: Bleiben die Ergebnisse über der Tastatur scrollbar? Wird nichts verdeckt?
8. **Marker antippen** mit dem Finger bei dichter Lage, und Cluster öffnen.
9. **Offline:** Flugmodus nach einmaligem Laden, dann wieder online.
10. **Drehen** des Geräts bei offenem Blatt und in der Detailansicht.
11. **Bedienungshilfen:** reduzierte Bewegung und VoiceOver am Griff und in der Liste.
12. **Alte Rückmeldungen:** Bleiben sie nach dem Update auf dem Gerät des Nutzers erhalten? Emuliert ist das geprüft.

## Veröffentlichung

- **Branch:** `redesign/uber-ux`, nur lokal, nicht gepusht.
- **Commits:**
  - Phase 1: `7f85334`
  - Phase 2: `908fb5c`
  - Phase 3: der Commit mit diesem Bericht
- **Live:** https://shortzn.github.io/smokr/ zeigt weiter `main` mit Stand `79b203a`.
- **Vorschlag:** Für den iPhone-Test eine Vorschau unter einer eigenen Adresse bereitstellen, ohne die Live-Version zu berühren. Erst danach `main` aktualisieren.

## Ideen für später, nicht umgesetzt

- Rückmeldungen zwischen Mitreisenden teilen (bräuchte ein Backend)
- Kompass-Pfeil mit Blickrichtung (braucht die Bewegungsfreigabe in iOS)
- Übersetzung der japanischen Ortsbeschreibungen beim Bauen der Daten, gekennzeichnet als Übersetzung
- Raucherräume in großen Bahnhöfen und Flughäfen systematisch ergänzen
