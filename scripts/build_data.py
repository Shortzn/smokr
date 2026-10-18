#!/usr/bin/env python3
"""Baut die App-Daten pro Region aus OpenStreetMap und den offiziellen Listen.

Aufruf: python3 -I scripts/build_data.py   (aus ~/Projects/kitsuen)
Ergebnis: app/data/<region>.json
"""
import json
import math
import os
import sys
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
OFFICIAL = os.path.join(ROOT, "data", "official")
OUT = os.path.join(ROOT, "app", "data")

# Reihenfolge = Reiseroute
REGIONS = ["tokyo", "kamakura", "kyoto", "okinawa", "osaka"]

VENUE_TYPES = {
    "cafe": "Café",
    "restaurant": "Restaurant",
    "fast_food": "Imbiss",
    "pub": "Kneipe",
    "bar": "Bar",
    "convenience": "Konbini",
    "biergarten": "Biergarten",
    "nightclub": "Club",
    "karaoke_box": "Karaoke",
    "hotel": "Hotel",
}

SMOKING_DETAIL = {
    "separated": "Raucherraum",
    "isolated": "Raucherraum",
    "dedicated": "Raucherlokal",
    "yes": "Rauchen erlaubt",
    "outside": "Rauchen draußen",
}

MERGE_RADIUS_M = 35


def dist_m(a_lat, a_lon, b_lat, b_lon):
    r = 6371000
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp = p2 - p1
    dl = math.radians(b_lon - a_lon)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def coords(e):
    if "lat" in e:
        return e["lat"], e["lon"]
    return e["center"]["lat"], e["center"]["lon"]


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_stations(region):
    path = os.path.join(RAW, f"stations_{region}.json")
    out = []
    seen = set()
    for e in load_json(path)["elements"]:
        t = e.get("tags", {})
        ja = t.get("name")
        if not ja:
            continue
        en = t.get("name:en") or t.get("name:ja-Latn") or t.get("name:ja_rm") or ""
        key = (ja, round(e["lat"], 3), round(e["lon"], 3))
        if key in seen:
            continue
        seen.add(key)
        out.append({"ja": ja, "en": en, "lat": e["lat"], "lon": e["lon"]})
    return out


def nearest_station(stations, lat, lon):
    best, best_d = None, 1e12
    for s in stations:
        # grobe Vorauswahl spart Rechenzeit
        if abs(s["lat"] - lat) > 0.03 or abs(s["lon"] - lon) > 0.04:
            continue
        d = dist_m(lat, lon, s["lat"], s["lon"])
        if d < best_d:
            best, best_d = s, d
    if not best or best_d > 2500:
        return None
    return {"en": best["en"], "ja": best["ja"], "m": round(best_d)}


def heated_from_text(*texts):
    blob = " ".join(x for x in texts if x)
    return "加熱式" in blob and "専用" in blob


def osm_spots(region):
    spots = []
    for e in load_json(os.path.join(RAW, f"osm_{region}.json"))["elements"]:
        t = e.get("tags", {})
        lat, lon = coords(e)
        osm_url = f"https://www.openstreetmap.org/{e['type']}/{e['id']}"
        name_ja = t.get("name") or ""
        name_en = t.get("name:en") or ""
        base = {
            "id": f"osm-{e['type'][0]}{e['id']}",
            "lat": round(lat, 6),
            "lon": round(lon, 6),
            "nj": name_ja,
            "ne": name_en,
            "src": ["osm"],
            "url": osm_url,
        }
        if t.get("check_date"):
            base["chk"] = t["check_date"]
        if t.get("opening_hours"):
            base["hours"] = t["opening_hours"]
        if heated_from_text(name_ja, t.get("description"), t.get("note")):
            base["heated"] = True

        if t.get("amenity") == "smoking_area":
            access = t.get("access")
            if access == "private":
                continue
            spot = dict(base, k="p")
            if access == "customers":
                spot["cust"] = True
            if t.get("covered") == "yes" or t.get("shelter") == "yes":
                spot["cov"] = True
            if t.get("indoor") == "yes" or t.get("building"):
                spot["ind"] = True
            spots.append(spot)
            continue

        smoking = (t.get("smoking") or "").split(";")[0]
        if smoking not in SMOKING_DETAIL:
            continue
        vtype = t.get("amenity") or t.get("shop") or t.get("tourism") or t.get("leisure") or ""
        label = VENUE_TYPES.get(vtype)
        if not label:
            # Bänke, Parkplätze usw. mit smoking=yes sind meist Aschenbecher im Freien
            if vtype in ("bench", "parking", "waste_basket", "shelter"):
                spots.append(dict(base, k="p"))
            continue
        detail = SMOKING_DETAIL[smoking]
        if vtype == "convenience" and smoking == "outside":
            detail = "Aschenbecher vor dem Laden"
        spot = dict(base, k="v", vt=label, sd=detail)
        spots.append(spot)
    return spots


def official_spots(region):
    path = os.path.join(OFFICIAL, f"{region}.json")
    if not os.path.exists(path):
        return []
    data = load_json(path)
    out = []
    for s in data.get("spots", []):
        if s.get("lat") is None or s.get("lon") is None:
            continue
        if s.get("status") == "closed":
            continue
        spot = {
            "id": f"off-{s['id']}",
            "k": "p",
            "lat": round(float(s["lat"]), 6),
            "lon": round(float(s["lon"]), 6),
            "nj": s.get("name_ja") or "",
            "ne": s.get("name_en") or "",
            "src": ["official"],
            "url": s.get("source_url"),
            "ward": s.get("ward"),
            "geo": "area" if s.get("geo_precision") == "area" else s.get("geo"),
        }
        if s.get("hint_ja"):
            spot["hint"] = s["hint_ja"]
        if s.get("address_ja"):
            spot["addr"] = s["address_ja"]
        if s.get("hours"):
            spot["hours"] = s["hours"]
        if s.get("heated_only"):
            spot["heated"] = True
        if s.get("source_date"):
            spot["chk"] = s["source_date"]
        if s.get("status") == "unknown":
            spot["unk"] = True
        if s.get("access") == "customers":
            # Raucherraum in einem Geschäft: wie ein Lokal behandeln (Kaufpflicht)
            spot.update(k="v", vt="Geschäft", sd="Raucherraum für Kunden")
        out.append(spot)
    return out


def merge(official, osm):
    """Offizielle Plätze haben Vorrang. OSM-Raucherplätze in der Nähe werden zusammengelegt."""
    merged = list(official)
    for o in osm:
        if o["k"] == "p":
            twin = None
            for m in official:
                if m["k"] != "p":
                    continue
                radius = MERGE_RADIUS_M if m.get("geo") in (None, "source") else MERGE_RADIUS_M * 2
                if dist_m(o["lat"], o["lon"], m["lat"], m["lon"]) <= radius:
                    twin = m
                    break
            if twin:
                if "osm" not in twin["src"]:
                    twin["src"].append("osm")
                twin["osm"] = o["url"]
                # OSM-Koordinaten sind genauer als eine geokodierte Adresse
                if twin.get("geo") in ("address", "area"):
                    twin["lat"], twin["lon"] = o["lat"], o["lon"]
                    twin["geo"] = "osm"
                for key in ("cov", "ind", "chk"):
                    if key in o and key not in twin:
                        twin[key] = o[key]
                continue
        merged.append(o)
    return merged


def build(region):
    stations = load_stations(region)
    spots = merge(official_spots(region), osm_spots(region))
    for s in spots:
        st = nearest_station(stations, s["lat"], s["lon"])
        if st:
            s["st"] = st
        s.pop("geo", None) if s.get("geo") == "source" else None
    spots.sort(key=lambda s: (s["k"], s["lat"]))
    payload = {"region": region, "built": date.today().isoformat(), "spots": spots}
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, f"{region}.json"), "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    pub = sum(1 for s in spots if s["k"] == "p")
    off = sum(1 for s in spots if "official" in s["src"])
    print(f"{region}: {len(spots)} Orte ({pub} öffentlich, davon {off} offiziell, {len(spots) - pub} Lokale)")


if __name__ == "__main__":
    for r in sys.argv[1:] or REGIONS:
        build(r)
