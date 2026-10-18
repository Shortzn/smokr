#!/bin/sh
# Bahnhöfe (für "bei Bahnhof X"-Angaben). Aufruf: scripts/fetch_stations.sh <name> <area-filter>
set -e
name="$1"; area="$2"
q="[out:json][timeout:170];$area->.a;(node[\"railway\"=\"station\"](area.a);node[\"railway\"=\"halt\"](area.a););out tags;out center qt;"
q="[out:json][timeout:170];$area->.a;(node[\"railway\"~\"^(station|halt)$\"](area.a););out;"
curl -sS --max-time 190 -A "kitsuen-app/0.1 (personal travel map)" https://overpass-api.de/api/interpreter --data-urlencode "data=$q" -o "stations_$name.json"
python3 -c "import json;print('$name stations',len(json.load(open('stations_$name.json'))['elements']))"
