# Smokr

Smokr ist eine Web-App, die Raucherplätze für unsere Japanreise zeigt. Sie deckt die Orte in der Reihenfolge der Reise ab: Tokio, Kamakura, Kyoto, Okinawa und Osaka.

**Adresse:** https://shortzn.github.io/smokr/

Stand: 18. Oktober 2026

## Auf dem iPhone einrichten

1. Öffne die Adresse in Safari.
2. Tippe auf **Teilen** und dann auf **Zum Home-Bildschirm**.
3. Starte Smokr über das neue Symbol und tippe auf das Standort-Symbol rechts.
4. Erlaube den Standort, wenn Safari danach fragt.

Falls du den Standort einmal abgelehnt hast, kannst du ihn so wieder freigeben: **Einstellungen > Apps > Safari > Standort**.

## Warum eine eigene App

Die Apps im App Store hatten vier Probleme:

- Sie waren oft nur auf Japanisch.
- Die Plätze stimmten nicht.
- Der angebliche Raucherplatz war in Wahrheit ein Café.
- Bei Smoky klappte die Verbindung zur Datenquelle nicht.

So geht Smokr damit um:

| Problem | Lösung in Smokr |
|---|---|
| Nur Japanisch | Die Oberfläche ist auf Deutsch. Der japanische Name steht zusätzlich da, damit du ihn mit Schildern vergleichen oder jemandem zeigen kannst. Japanische Öffnungszeiten werden übersetzt. |
| Plätze stimmen nicht | Die Daten kommen wo möglich direkt von den Städten und Bezirken. Zu jedem Platz stehen die Quelle und das Datum. Ungenaue Positionen sind markiert. |
| Plötzlich in einem Café | Öffentliche Plätze und Lokale mit Kaufpflicht sind getrennt, mit eigener Farbe und eigenem Filter. |
| Verbindungsfehler | Alle Daten stecken in der App selbst. Sie braucht keinen Server, der ausfallen kann, und die Liste funktioniert auch ohne Netz. |

## Was die App kann

### Karte und Liste

- Die Karte beschriftet Orte auf Englisch und Japanisch.
- Unten steht eine Liste der nächsten 30 Plätze, sortiert nach Entfernung. Jeder Eintrag zeigt Entfernung, Gehzeit, einen Richtungspfeil und den nächsten Bahnhof.
- Ohne Standort sortiert die Liste nach der Kartenmitte.
- Oben wechselst du zwischen den Orten der Reise, die Karte springt dann dorthin.
- Das Blatt mit der Liste lässt sich über den Griff oben in drei Größen stellen.

### Farben und Filter

| Farbe | Bedeutung |
|---|---|
| Grün | Öffentlicher Raucherplatz, kostenlos |
| Braun | Lokal, Geschäft oder Konbini mit Raucherbereich. Hier musst du etwas kaufen. |
| Violett | Nur für Tabakerhitzer wie IQOS, glo oder Ploom |
| Grau | Von dir als „nicht gefunden“ markiert |

Die Filter oben:

- **Öffentlich:** ist beim Start an.
- **Lokale:** ist beim Start aus, damit die Karte übersichtlich bleibt.
- **Ohne Nur-IQOS:** blendet Plätze aus, an denen Zigaretten verboten sind.

Die App merkt sich deine Filter.

### Detailansicht eines Platzes

- Die Ortsbeschreibung der Stadt, zum Beispiel welcher Ausgang oder welches Stockwerk.
- **Route in Apple Karten** und **Google Maps**, beide mit Fußweg.
- Die Öffnungszeiten, wo die Stadt sie angibt.
- Die Adresse, die Quelle und das Datum der letzten Prüfung.
- Warnungen, wenn die Position nur ungefähr bekannt ist, wenn der Platz nur für Tabakerhitzer ist oder wenn er nur aus OpenStreetMap stammt und kein Prüfdatum hat.
- Ein Link zur offiziellen Quelle.

### Rückmeldungen

Mit **War da** und **Nicht gefunden** gibst du Rückmeldung zu einem Platz. Nicht gefundene Plätze verschwinden aus deiner Liste und werden auf der Karte grau. Mit **Zurücksetzen** machst du das rückgängig.

Die Rückmeldungen bleiben nur auf deinem Gerät gespeichert. Die anderen Mitreisenden sehen sie nicht.

### Weitere Funktionen

- **Auf Japanisch fragen:** Der Knopf 喫煙所？ zeigt groß „Wo ist hier ein Raucherplatz?“ auf Japanisch, mit Lautschrift und deutscher Übersetzung. Das kannst du Einheimischen zeigen.
- **Hinweise je Stadt:** Steht die Karte auf Kamakura, Kyoto, Okinawa oder Osaka, zeigt die Liste oben die wichtigsten Regeln, etwa Rauchverbote und Strafen.
- **Offline:** Die App und alle Daten werden beim ersten Öffnen gespeichert. Kartenstücke, die du schon angesehen hast, bleiben auch ohne Netz sichtbar, bis zu 4.000 davon.
- **Updates:** Neue Daten kommen beim nächsten Öffnen mit Internet automatisch an.

## Was drin ist

Insgesamt sind es 2.641 Orte. Davon stammen 934 aus offiziellen Quellen.

| Ort | Öffentlich | davon offiziell | Lokale und Geschäfte | Einschätzung |
|---|---:|---:|---:|---|
| Tokio | 623 | 390 | 1.108 | gut |
| Kamakura | 5 | 5 | 7 | dünn, weil es dort kaum Plätze gibt |
| Kyoto | 51 | 19 | 79 | gut für Innenstadt, Bahnhof, Gion |
| Okinawa | 50 | 32 | 30 | Flughafen und Churaumi gut, Naha dünn |
| Osaka | 391 | 360 | 297 | sehr gut |

### Tokio

Die offiziellen Listen stammen aus zehn Bezirken:

| Bezirk | Stand der Liste |
|---|---|
| Shinjuku | 2024 und 2026 |
| Shibuya | Juli 2026 |
| Chiyoda | September 2026 |
| Minato | Oktober 2026 |
| Chūō | Oktober 2026 |
| Taitō | August 2026 |
| Toshima | August 2026 |
| Bunkyō | Juni 2026 |
| Meguro | Oktober 2026 |
| Kōtō | ohne Datum |

Zusätzliche Plätze kommen aus OpenStreetMap.

Etwa 140 Plätze hat der Bezirk nur mit Adresse angegeben. Die Position wurde daraus berechnet und kann ein paar Dutzend Meter danebenliegen. Bei 5 Plätzen kennen wir nur den Stadtteil. Die App warnt in beiden Fällen.

Es fehlen Shinagawa und Sumida: Für beide Bezirke wurde keine offizielle Liste gefunden. Dort gibt es nur die Plätze aus OpenStreetMap.

### Kamakura

- **Am Bahnhof Kamakura gibt es nur einen offiziellen Platz:** den Raucherraum im 3. Stock des Aiza-Gebäudes an der Komachi-dori, geöffnet von 9 bis 17 Uhr.
- **Hinter dem Uhrturm:** Den bekannten Platz am Westausgang gibt es seit 2019 nicht mehr.
- **Ōfuna:** Am Bahnhof gibt es zwei Plätze.
- **Fujisawa:** Am Bahnhof, dem Endpunkt der Enoden-Bahn, gibt es zwei Plätze. Ihre Position stimmt auf etwa 50 m.
- **Enoshima, Hase, Kita-Kamakura:** Hier gibt es keine offiziellen Plätze. Rund um die Bahnhöfe bei Enoshima gilt ein Rauchverbot.
- **Strafe:** In den Verbotszonen kostet Rauchen 2.000 Yen, aber erst nach einer Verwarnung.

### Kyoto

- **Städtische Plätze:** 19 Stück, alle mit genauen Koordinaten der Stadt. 8 davon liegen am Bahnhof Kyoto, 2 in der Innenstadt.
- **Kiyomizu und Gion:** Es gibt nur 3 Plätze, zwei am Parkplatz am Kiyomizu-zaka und einen im Kōdaiji-Park.
- **Arashiyama und Fushimi Inari:** Hier gibt es keinen städtischen Platz.
- **Strafe:** In der Innenstadt, am Bahnhof und in Kiyomizu und Gion kostet Rauchen auf der Straße 1.000 Yen. Kassieren dürfen nur Kontrolleure in Uniform mit Ausweis, gegen Quittung.

### Okinawa

- **Flughafen Naha:** 21 Raucherräume, jeweils mit Stockwerk und dem Hinweis, ob vor oder nach der Sicherheitskontrolle. Die Positionen sind aus den Flughafenplänen abgelesen und stimmen auf etwa 30 bis 60 m. Am besten hältst du dich an die Beschreibung.
- **Churaumi-Aquarium und Ocean Expo Park:** 11 Plätze aus der offiziellen Parkkarte, einer davon am Emerald Beach.
- **Naha:** Die Stadt veröffentlicht keine Liste. Auf der Kokusai-dori und der Okiei-dori ist Rauchen verboten, nach Verwarnung kostet es 2.000 Yen. In den Seitenstraßen ist Rauchen draußen nicht verboten, üblich sind die Aschenbecher bei Konbinis.
- **Strände:** Eine offizielle Regel wurde nicht gefunden. Achte auf Schilder.

### Osaka

- **Offizielle Plätze:** 488 aus der Liste der Stadt vom 16. Oktober 2026, alle mit genauen Koordinaten.
- **Öffentlich:** 360 Plätze sind kostenlos für alle.
- **Nur für Kunden:** 128 Raucherräume liegen in Geschäften und Lokalen. Smokr zeigt sie braun als Lokal mit Kaufpflicht.
- **Nach Gegend:**
  - Namba, Dōtonbori und Shinsaibashi: 134
  - Umeda: 76
  - Shinsekai: 12
  - Bahnhof Universal City: 1
- **Universal Studios:** Die Raucherbereiche im Park selbst fehlen.
- **Verbot:** Seit Januar 2025 ist Rauchen auf der Straße in ganz Osaka verboten, auch mit IQOS. Die Strafe beträgt 1.000 Yen und ist sofort zu zahlen. Aschenbecher auf Privatgrund, etwa vor einem Laden, sind erlaubt.

## Grenzen

- **Datenstand:** Die Listen der Städte sind auf dem Stand, den sie veröffentlicht haben. Plätze können inzwischen wegen Baustellen geschlossen oder umgezogen sein. Shinjuku hat seine Hauptliste zuletzt 2024 aktualisiert.
- **OpenStreetMap:** Plätze aus OpenStreetMap haben Freiwillige eingetragen. Sie haben oft kein Prüfdatum und sind daher weniger verlässlich.
- **Lokale:** Die Angaben zu Lokalen stammen ebenfalls aus OpenStreetMap. Seit dem Gesetz von 2020 haben viele Lokale das Rauchen abgeschafft.
- **Rückmeldungen:** Sie werden nicht zwischen Geräten geteilt.
- **Kein Kompass:** Der Richtungspfeil in der Liste zeigt die Himmelsrichtung, nicht die Richtung relativ zu deinem Handy.

## Mögliche nächste Schritte

- Rückmeldungen zwischen den Mitreisenden teilen
- Raucherräume in großen Bahnhöfen ergänzen, etwa im Bahnhof Kyoto und an den Shinkansen-Bahnsteigen
- Die Bezirke Shinagawa und Sumida in Tokio nachrecherchieren

## Technik

Dieser Teil ist für später, falls die Daten aktualisiert werden sollen.

- **Code:** `~/Projects/smokr`, Repository `Shortzn/smokr` auf GitHub.
- **Veröffentlichung:** GitHub Pages veröffentlicht den Ordner `app/` automatisch bei jedem Push auf `main`.
- **Aufbau:** Die App ist eine statische Seite mit HTML, CSS und JavaScript. Die Karte läuft mit MapLibre, die Kartenstücke kommen von OpenFreeMap. Der Offline-Betrieb läuft über einen Service Worker in `app/sw.js`.
- **Daten:** Sie liegen in `app/data/<ort>.json` und werden aus diesen Quellen gebaut:
  - `data/official/<ort>.json`: offizielle Listen, erzeugt von `scripts/build_<ort>_official.py`
  - OpenStreetMap-Abfragen über `scripts/fetch_osm.sh` und `scripts/fetch_stations.sh`
- **Zusammenführung:** `scripts/build_data.py` legt doppelte Einträge zusammen. Ist derselbe Platz in beiden Quellen, hat die offizielle Angabe Vorrang.
- **Rohdaten:** Die gespeicherten Seiten der Städte liegen in `data/raw/`. Dieser Ordner ist nicht im Repository.

Daten aktualisieren, Beispiel Tokio:

```sh
cd ~/Projects/smokr
scripts/fetch_osm.sh tokyo 'area["ISO3166-2"="JP-13"]'
scripts/fetch_stations.sh tokyo 'area["ISO3166-2"="JP-13"]'
python3 -I scripts/build_tokyo_official.py
python3 -I scripts/build_data.py
git add -A && git commit -m "Daten aktualisiert" && git push
```

Lokal testen:

```sh
python3 -m http.server 4180 --directory app
```

## Quellen und Lizenzen

- **Offizielle Listen:** von den Bezirken und Städten. Die Quelle steht bei jedem Platz in der App. Die Liste von Osaka steht unter CC BY 4.0.
- **Zusätzliche Plätze und Bahnhöfe:** © OpenStreetMap-Mitwirkende, ODbL
- **Karte:** OpenFreeMap, © OpenMapTiles, Daten von OpenStreetMap
