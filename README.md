# Kitsuen

Raucherplätze für eine Japanreise: Tokio, Kamakura, Kyoto, Okinawa, Osaka.
Statische Web-App unter `app/`, für das iPhone zum Homescreen hinzufügen.

## Daten aktualisieren

```sh
scripts/fetch_osm.sh tokyo 'area["ISO3166-2"="JP-13"]'      # OpenStreetMap
scripts/fetch_stations.sh tokyo 'area["ISO3166-2"="JP-13"]' # Bahnhöfe
python3 -I scripts/build_tokyo_official.py                 # offizielle Bezirkslisten
python3 -I scripts/build_data.py                           # app/data/*.json
```

## Quellen

- Offizielle Listen der Tokioter Bezirke (siehe `source_url` je Platz)
- © OpenStreetMap-Mitwirkende, ODbL
- Karte: OpenFreeMap, OpenMapTiles
