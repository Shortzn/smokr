# Smokr

Smokr ist eine Web-App, die Raucherplätze für unsere Japanreise zeigt. Sie deckt die Orte in der Reihenfolge der Reise ab: Tokio, Kamakura, Kyoto, Okinawa und Osaka.

**Adresse:** https://shortzn.github.io/smokr/

Stand: 18. Oktober 2026. Öffentliche Beta, Sprache Englisch, Deutsch oder Japanisch.

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

### Bedienung

- **Karte zuerst.** Die Karte füllt den Bildschirm. Oben schweben die Stadt, die Suche und die Filter, rechts der Standort-Knopf.
- **Das Blatt unten** hat drei Stufen: zu, halb, ganz offen. Du ziehst es mit dem Finger oder tippst auf den Griff. Ganz offen scrollt die Liste. Oben angekommen zieht eine Abwärtsbewegung das Blatt wieder herunter.
- **Liste:** die nächsten 40 Plätze mit Name, Entfernung, Zugang, Einschränkungen und Herkunft.
- **Entfernungen sind Luftlinie.** Den echten Fußweg zeigt Apple Karten oder Google Maps. Gehzeiten nennt Smokr bewusst nicht.
- **Bezugspunkt der Liste:**
  - **Standort-Knopf:** Die Liste zeigt die Plätze bei dir.
  - **Karte verschieben oder Stadt wechseln:** Die Liste zeigt die Plätze um die Kartenmitte.
  - GPS-Updates verschieben die Karte nie. Der Standort-Knopf holt dich jederzeit zurück.
- **Suche** nach Bahnhof, Name oder Stadt, auch auf Japanisch. Trifft der Suchbegriff genau einen Bahnhof, kommen die Plätze an diesem Bahnhof zuerst.
- **Detail:** „Route starten“ öffnet den Fußweg in Apple Karten oder Google Maps. Darunter folgen die Wegbeschreibung der Stadt, Öffnungszeiten, Zugang und die Herkunft der Angaben.
- **Auf dem Mac oder quer gehaltenen iPhone** wird das Blatt zum Seitenpanel. Tastatur: `/` öffnet die Suche, `Esc` geht zurück.

### Zeichen auf der Karte

Form und Farbe zeigen die Art des Platzes. Man muss also keine Farben unterscheiden können.

| Zeichen | Bedeutung |
|---|---|
| Grüner Kreis | Öffentlicher Raucherplatz, ohne Einkauf nutzbar |
| Braunes Quadrat | Geschäft oder Lokal: nur für Kunden, oder Zugang unklar |
| Violette Raute | Nur für Tabakerhitzer wie IQOS, glo oder Ploom |
| Hohles Zeichen | Weniger verlässlich: nur OpenStreetMap ohne Prüfdatum, oder Position nur ungefähr |
| Schwarzer Kreis mit Zahl | Mehrere Plätze. Antippen vergrößert die Karte. Grau heißt: nur Geschäfte |
| Schwarze Nadel | Der ausgewählte Platz |

### Zugang: nur was belegt ist

| Anzeige | Wann |
|---|---|
| Öffentlich | Von der Stadt als öffentlicher Platz gelistet, oder in OpenStreetMap als Raucherplatz ohne Einschränkung |
| Nur für Kunden | Die Stadt (Osaka) oder OpenStreetMap sagt ausdrücklich „nur für Kunden“ |
| Zugang unklar | Raucherbereich in einem Café, Lokal oder bei einem Konbini, ohne Angabe zum Zugang |

### Herkunft der Angaben

Die Detailansicht trennt vier Dinge:

- **Offizielle Liste:** welcher Bezirk und welcher Stand der Liste. Das ist das Datum der Liste, keine Prüfung vor Ort.
- **OpenStreetMap:** ob Mitwirkende den Eintrag geprüft haben, und wann.
- **Position:** genau, aus der Adresse berechnet oder nur ungefähr.
- **Deine Rückmeldung:** „Gefunden“ oder „Nicht gefunden“, nur auf deinem Gerät.

### Filter

- **Ich rauche:**
  - **Zigaretten:** blendet Plätze nur für Tabakerhitzer aus.
  - **Tabakerhitzer** oder **Beides:** zeigt alle Plätze.
- **Anzeigen:** öffentliche Plätze, Geschäfte und Lokale, von dir nicht gefundene Plätze.
- **Route öffnen mit:** Apple Karten oder Google Maps.
- **Schnellfilter:** Für „Öffentlich“ und „Geschäfte“ gibt es zusätzlich Schalter direkt über der Liste.

Alte Einstellungen aus der ersten Version werden übernommen.

### Sprachen

Die App ist auf Englisch, Deutsch und Japanisch verfügbar.

- **Startsprache:** Englisch ist Standard, Deutsch und Japanisch kommen automatisch, wenn das Gerät so eingestellt ist.
- **Wechsel:** jederzeit unter Filter, Sprache. Die Wahl bleibt gespeichert.
- **Japanische Texte:** Japanische Namen und Ortsbeschreibungen der Städte bleiben im Original, sie werden nicht übersetzt.

### Konbinis

Ein Konbini zählt nur dann als Raucherplatz, wenn der OpenStreetMap-Eintrag seit 2024 geprüft wurde.

- **Ungeprüfte Einträge** sind unbestätigt und standardmäßig ausgeblendet. Einblenden lassen sie sich unter Filter, „Unbestätigte Konbini-Aschenbecher“.
- **Doppelte Einträge:** Liegt ein Raucherplatz direkt daneben, zeigt die App nur diesen.
- **Zahlen:**

  | Ort | belegt | unbestätigt | doppelt |
  |---|---:|---:|---:|
  | Tokio | 2 | 50 | 1 |
  | Okinawa | 1 | 3 | 0 |
  | Osaka | 0 | 1 | 0 |

### Community (vorbereitet)

Diese Funktionen sind gebaut, aber noch ausgeschaltet:

- neue Plätze vorschlagen
- Plätze bestätigen oder Probleme melden, jeweils mit Foto
- Moderation

Sie gehen erst an, wenn das Backend eingerichtet ist. Bis dahin zeigt die App keine Knöpfe dafür. Details stehen in `docs/COMMUNITY.md`.

### Weitere Funktionen

- **Auf Japanisch fragen:** zeigt groß „Wo ist hier ein Raucherplatz?“ auf Japanisch.
- **Regeln je Stadt:** Rauchverbote und Strafen stehen oben in der Liste.
- **Offline:** App und Daten werden gespeichert. Bei schlechtem Netz wartet die App höchstens 3,5 Sekunden, dann nimmt sie den gespeicherten Stand.
- **Fehlende Daten:** Fehlt eine Stadtdatei, sagt die App das und bietet „Erneut laden“ an. Sie zeigt dann keine scheinbar leere Gegend.

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

- **Datenstand:** Die Listen der Städte sind auf dem Stand, den sie veröffentlicht haben. Plätze können inzwischen geschlossen oder umgezogen sein. Shinjuku hat seine Hauptliste zuletzt 2024 aktualisiert.
- **OpenStreetMap:** Plätze von Freiwilligen haben oft kein Prüfdatum. Sie sind hohl gezeichnet.
- **Lokale:** Ob du dort ohne Einkauf rauchen darfst, ist meist nicht angegeben.
- **Rückmeldungen** bleiben auf dem Gerät und werden nicht geteilt.
- **Luftlinie:** Die Entfernung ist Luftlinie. Der Richtungspfeil der ersten Version ist weggefallen.
- **Offline-Karte:** Die Karte ist offline nur dort sichtbar, wo du schon warst.

## Mögliche nächste Schritte

- Rückmeldungen zwischen den Mitreisenden teilen
- Raucherräume in großen Bahnhöfen ergänzen, etwa im Bahnhof Kyoto und an den Shinkansen-Bahnsteigen
- Die Bezirke Shinagawa und Sumida in Tokio nachrecherchieren

## Technik

Dieser Teil ist für später, falls die Daten aktualisiert werden sollen.

- **Code:** `~/Projects/smokr`, Repository `Shortzn/smokr` auf GitHub.
- **Veröffentlichung:** GitHub Pages veröffentlicht den Ordner `app/` automatisch bei jedem Push auf `main`.
- **Aufbau:** statische Seite ohne Framework.
  - `app/core.js`: Logik ohne Oberfläche, also Zugang, Herkunft, Filter, Reihenfolge, Suche und Standort-Zustand.
  - `app/sheet.js`: das ziehbare Blatt.
  - `app/markers.js`: die Kartenzeichen.
  - `app/app.js`: die Oberfläche.
  - Karte: MapLibre mit Kartenteilen von OpenFreeMap.
  - Offline: Service Worker in `app/sw.js`.
- **Daten:** `app/data/<ort>.json` im Schema 2, gebaut von `scripts/build_data.py`. Quellen sind die offiziellen Listen in `data/official/` und OpenStreetMap. Ist derselbe Platz in beiden Quellen, nimmt jeder offizielle Platz höchstens den nächstgelegenen OSM-Platz auf.
- **Rohdaten:** Die gespeicherten Seiten der Städte liegen in `data/raw/`. Dieser Ordner ist nicht im Repository.
- **Tests:** `npm test` führt alle Suiten aus:
  - Logik (Node) und Daten (Python)
  - Abläufe mit Playwright in WebKit und Chromium
  - Update von der Alpha
  - Community-API und Community-Abläufe gegen einen lokalen Worker
- **Rollback:** Der letzte Stand vor dem Redesign ist der Tag `alpha-final`. Zurück geht es mit diesen Befehlen, ohne die Historie zu verändern:

  ```sh
  git checkout alpha-final -- app
  git commit -m "Rollback auf alpha-final"
  git push
  ```
- **Doku:**
  - `docs/BETA.md`: Abnahme
  - `docs/COMMUNITY.md`: Backend
  - `docs/REDDIT.md`: Beta-Aufruf
  - `docs/MONETIZATION.md`: Monetarisierung
  - `docs/legal/`: Vorlagen für Impressum und Datenschutz

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
