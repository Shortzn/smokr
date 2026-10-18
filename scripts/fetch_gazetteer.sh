#!/bin/sh
# Ortsnamen mit offiziellem englischem Namen aus OpenStreetMap (ODbL), für die Lokalisierung beim Build.
# Aufruf: scripts/fetch_gazetteer.sh <name> "<süd>,<west>,<nord>,<ost>"
set -e
name="$1"; bbox="$2"
q="[out:json][timeout:180][bbox:$bbox];(
nwr[place][name][\"name:en\"];
nwr[railway~\"^(station|halt)$\"][name][\"name:en\"];
nwr[public_transport=station][name][\"name:en\"];
way[highway][name][\"name:en\"];
nwr[leisure~\"^(park|garden)$\"][name][\"name:en\"];
nwr[shop~\"^(mall|department_store)$\"][name][\"name:en\"];
nwr[building][name][\"name:en\"];
nwr[amenity~\"^(university|college|townhall|bus_station|marketplace)$\"][name][\"name:en\"];
nwr[tourism~\"^(attraction|museum|theme_park|zoo|aquarium)$\"][name][\"name:en\"];
nwr[aeroway=aerodrome][name][\"name:en\"];
);out tags;"
curl -sS --max-time 200 -A "smokr-app/0.1 (personal travel map)" https://overpass-api.de/api/interpreter --data-urlencode "data=$q" -o "gazetteer_$name.json"
python3 -c "import json;print('$name',len(json.load(open('gazetteer_$name.json'))['elements']))"
