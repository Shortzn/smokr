# Datenqualität

Stand: 18. Oktober 2026, abends (zweiter Durchgang).

## Bestand

| Stadt | Orte | öffentlich | offiziell gelistet | Position nach Adresse | Position nur Gegend | Konbini unbestätigt |
|---|---|---|---|---|---|---|
| Tokio | 1.751 | 639 | 413 | 150 | 7 | 51 |
| Kamakura | 12 | 5 | 5 | 1 | 3 | 0 |
| Kyoto | 132 | 53 | 19 | 0 | 0 | 0 |
| Okinawa | 80 | 50 | 32 | 0 | 19 | 3 |
| Osaka | 688 | 391 | 488 | 0 | 6 | 1 |

„Position nach Adresse“ heißt: Die Quelle nennt nur eine Adresse, der Punkt liegt auf dem Häuserblock. Er kann 50 bis 100 m danebenliegen. Die App sagt das im Detail. „Nur Gegend“ heißt: großer Park oder Bahnhofsbereich ohne genauere Angabe.

## Neu: Shinagawa und Sumida

**Übernommen:** 15 Plätze aus der Liste des Bezirks Shinagawa und 8 bezirkseigene Plätze aus der Liste des Bezirks Sumida. Dateien: `data/official/tokyo_shinagawa.json`, `data/official/tokyo_sumida.json`. Damit sind Gotanda, Ōsaki, Ōimachi, Kinshichō, Ryōgoku, Oshiage (Skytree) und das Ostufer gegenüber Asakusa erstmals mit offiziellen Plätzen abgedeckt.

**Geprüft je Platz:**
- **Existenz und Aktualität:** Die Bezirksseiten nennen jeden Platz mit Adresse. Stand der Quellen: Shinagawa 16. März 2026, Sumida 2. Oktober 2025.
- **Herkunft:** Link auf die Bezirksseite und Datum stehen bei jedem Platz in der App.
- **Lage:** Positionen aus der Adresse (Häuserblock). Wo ein OpenStreetMap-Punkt in der Nähe liegt, übernimmt die App dessen genauere Position (7 von 23). Die zwei großen Parks der Präfektur Tokio (Shinagawa 14 und 15) sind als „nur Gegend“ markiert.
- **Öffnungszeiten:** wie in der Quelle. Der Übersetzer kennt jetzt „翌“ (über Mitternacht) und „土日祝休所“ (am Wochenende und an Feiertagen geschlossen).

**Bewusst nicht übernommen:**
- **4 Kaufhäuser in Kinshichō** (Rakutenchi, Parco, Marui, Termina): Sie waren nur in einer Testphase vom 15. Oktober bis 15. November 2025 als Raucherplätze ausgewiesen. Einen aktuellen Nachweis gibt es nicht.
- **Keiō-Kaufhaus Shinjuku:** Raucherraum laut Betreiber vorhanden. Die Position ließ sich aber nur auf den Häuserblock bestimmen und fällt auf einen bestehenden Platz. Kommt erst mit einer genauen Lage dazu, zum Beispiel über die Community.

### Rechtliche Bewertung

Ich bin kein Anwalt. Das ist meine Einschätzung als Grundlage für deine Entscheidung.

- **Was übernommen wird:** nur Tatsachen. Name des Platzes, Adresse, Öffnungszeiten, ob nur für Tabakerhitzer. Keine Fließtexte, keine Karten, keine Lagepläne, keine Fotos. Die Daten werden in Smokrs eigenem Format neu erfasst, übersetzt und mit OpenStreetMap abgeglichen.
- **Japanisches Urheberrecht:** Geschützt sind Werke, also schöpferischer Ausdruck (Art. 2 Abs. 1 Nr. 1). Reine Tatsachen sind keine Werke (Art. 10 Abs. 2 für Nachrichten über Tatsachen, allgemein anerkannt für Fakten). Eine Datenbank ist nur geschützt, wenn Auswahl oder Aufbau schöpferisch sind (Art. 12-2). Eine vollständige Liste aller Raucherplätze eines Bezirks ist das nicht.
- **Hinweise „無断転載禁止“ auf den Bezirksseiten:** Sie beziehen sich auf die geschützten Inhalte der Seite. Auf Tatsachen erweitern sie den Schutz nicht. Einen Vertrag, dem man beim Lesen zustimmt, gibt es nicht.
- **Österreich und EU (Datenbankrecht, § 76c UrhG):** Das Schutzrecht für Datenbanken gilt für Hersteller aus dem EWR. Japanische Bezirke fallen nicht darunter. Außerdem sind 23 Einträge kein wesentlicher Teil.
- **Quellenangabe:** Bei jedem Platz steht der Bezirk mit Link und Datum. Das ist fair gegenüber der Quelle und hilft Nutzern beim Nachprüfen.
- **Ergebnis:** geringes Risiko. Sollte ein Bezirk widersprechen, lassen sich die Einträge mit einer Datei entfernen.

## Namen

| Art | Anzahl | Bedeutung |
|---|---|---|
| Offizieller englischer Name (OSM `name:en`) | 949 | übernommen |
| Aus geprüften Begriffen zusammengesetzt | 448 | zum Beispiel „Shinjuku Station Public Smoking Area, under the tracks, Southeast Exit“ |
| Schon lateinisch | 221 | unverändert |
| Marke | 37 | zum Beispiel „Doutor Coffee Shop“ |
| Nur romanisiert | 128 | Eigenname in Umschrift, japanisches Original daneben |
| Teilweise | 583 | Eigennamen wie Bar- oder Lokalnamen; die App zeigt „Raucherplatz bei <Bahnhof>“ und das Original |
| Generisch | 19 | nur „喫煙所“ o. ä.; Anzeige nach Ort |
| Ohne Namen | 278 | Anzeige nach Ort |
| **Gesamt** | **2.663** | Überschneidungen: keine, jede Zeile zählt einmal |

Zweiter Durchgang am 18.10.: 29 Namen mehr zusammengesetzt (neue Ausgänge, Seiten, innen und außen, Gelände, Strandpark, Großmarkt, unter den Gleisen). Nummern wie ② stehen jetzt am Ende, Bindestriche bleiben. „Kreuzung“ (交差点) bewusst nicht aufgenommen, weil es bei Shibuya einen falschen Titel ergab. Die Lage im Gebäude aus „（南西）“ steht jetzt bei 68 Orten in Liste und Detail.

Die übrigen Lücken sind fast nur Eigennamen. Die werden nicht übersetzt.

## Konbini-Regel nachgeprüft

- **Regel:** Ein Konbini aus OpenStreetMap mit Raucherhinweis gilt nur als belegt, wenn ein OSM-Prüfdatum ab 2024 vorliegt. Sonst ist er „unbestätigt“, standardmäßig ausgeblendet und im Detail deutlich gewarnt. Liegt ein Raucherplatz höchstens 25 m entfernt, fällt der Konbini weg.
- **Ergebnis Tokio:** 2 belegt, 51 unbestätigt, 1 als Dublette entfernt.
- **Lücke geschlossen (18.10. abends):** Ein eigener OSM-Raucherplatz-Punkt „ファミリーマート喫煙所“ ohne Prüfdatum galt als verlässlich, weil er nicht als Konbini, sondern als Raucherplatz eingetragen ist. Solche Punkte fallen jetzt unter dieselbe Regel. Ein Datentest prüft, dass kein Konbini aus OSM ohne Prüfdatum ab 2024 als verlässlich erscheint.
- **Offizielle Konbini-Plätze** (47 in Tokio, 21 in Osaka) sind von Bezirk oder Stadt als Raucherplatz ausgewiesen und bleiben sichtbar, mit Quelle und Datum.
- **Bewertung:** Die Regel bleibt richtig. Seit dem Tokioter Nichtraucherschutz (2020) haben viele Konbinis ihre Aschenbecher entfernt. Ein OSM-Prüfdatum ist keine Kontrolle vor Ort. Die App nennt es deshalb auch nicht so.
- **Später:** Bestätigungen aus der Community können einzelne Konbinis wieder sichtbar machen.

## Recherche ohne Ergebnis

- **Sumida, 4 Kaufhäuser aus der Testphase:** Keine Quelle nach November 2025 gefunden, die den Weiterbetrieb belegt (Suche am 18.10.2026). Bleiben ausgeschlossen.
- **Kyoto:** Keine aktuelle offizielle Liste der Raucherplätze im Netz, nur Ratsunterlagen von 2007 bis 2012. Ein Reiseportal nennt für 2026 ein Rauch- und Fotoverbot in Gassen von Gion, das ist nicht amtlich bestätigt. Keine Änderung.

## MottoSuitai

Nicht verwendet. Die Seite sperrt in ihrer robots.txt automatisierte Abrufe. Das wird respektiert, auch nicht über Umwege.

## Bekannte Schwächen

- **Namen:** In Tokio haben 213 Orte keinen guten englischen Namen. Die App zeigt dann „Raucherplatz bei <Bahnhof>“ und den japanischen Originalnamen.
- **Positionen nach Adresse (150 in Tokio):** größte Fehlerquelle. Die Meldung „falsche Position“ schickt jetzt einen Vorschlag mit, den du in der Moderation übernehmen kannst.
- **Kyoto:** nur 19 offizielle Plätze. Die Stadt veröffentlicht keine vollständige Liste.

## Prüfungen

- `tests/test_build_data.py`: Schema, Lage in der richtigen Stadt, Dubletten, Konbini-Regel, Shinagawa und Sumida vollständig, Testphase und Keiō ausgeschlossen, große Parks als „nur Gegend“.
- `tests/unit/core.test.js`: Öffnungszeiten inklusive der neuen Muster.
