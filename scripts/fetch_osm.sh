#!/bin/sh
# Lädt Raucherplätze und Lokale mit Rauchangabe aus OpenStreetMap (Overpass).
# Aufruf: scripts/fetch_osm.sh <name> <area-filter>
set -e
name="$1"; area="$2"
q="[out:json][timeout:170];$area->.a;(nwr[\"amenity\"=\"smoking_area\"](area.a);nwr[\"smoking\"~\"^(yes|separated|isolated|dedicated|outside)\"](area.a);nwr[\"smoking:heated\"](area.a););out tags center;"
curl -sS --max-time 190 -A "kitsuen-app/0.1 (personal travel map)" https://overpass-api.de/api/interpreter --data-urlencode "data=$q" -o "osm_$name.json"
python3 -c "import json;print('$name',len(json.load(open('osm_$name.json'))['elements']))"
