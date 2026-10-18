#!/usr/bin/env python3
"""Baut die App-Daten pro Region aus OpenStreetMap und den offiziellen Listen.

Aufruf: python3 -I scripts/build_data.py   (aus ~/Projects/smokr)
Ergebnis: app/data/<region>.json
"""
import collections
import csv
import json
import math
import glob
import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import classify  # noqa: E402
import localize  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
OFFICIAL = os.path.join(ROOT, "data", "official")
OUT = os.path.join(ROOT, "app", "data")

# Reihenfolge = Reiseroute
REGIONS = ["tokyo", "kamakura", "kyoto", "okinawa", "osaka"]

# Codes statt Text: die App übersetzt sie (Englisch, Deutsch, Japanisch)
VENUE_TYPES = {
    "cafe": "cafe",
    "restaurant": "restaurant",
    "fast_food": "fast_food",
    "pub": "pub",
    "bar": "bar",
    "convenience": "konbini",
    "biergarten": "beer_garden",
    "nightclub": "club",
    "karaoke_box": "karaoke",
    "hotel": "hotel",
    "tobacco": "tobacco",
}

SMOKING_DETAIL = {
    "separated": "room",
    "isolated": "room",
    "dedicated": "smoking_venue",
    "yes": "allowed",
    "outside": "outside",
}

# Ein Konbini gilt nur als belegt, wenn der Eintrag seit diesem Datum geprüft wurde.
# Viele Aschenbecher vor Konbinis wurden seit dem Rauchgesetz von 2020 entfernt.
KONBINI_CHECKED_SINCE = "2024-01-01"
KONBINI_NEAR_AREA_M = 25

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


# Schema 3 (wie 2, aber vt/sd als Codes und "unv" für unbestätigte Konbinis): Herkunft, Datum, Positionsgenauigkeit und Zugang sind getrennte Felder.
#   k     "p" = eigener Raucherplatz, "v" = Raucherbereich eines Geschäfts oder Lokals
#   acc   "public" | "customers" | "unknown"   (nur was die Quelle belegt)
#   pos   "exact" | "address" | "area"         (wie genau die Koordinate ist)
#   off   {"ward", "url", "date"}              offizielle Liste und deren Stand
#   osm   {"url", "chk"}                       OSM-Eintrag und dessen check_date
SCHEMA = 4


def osm_spots(region):
    spots = []
    for e in load_json(os.path.join(RAW, f"osm_{region}.json"))["elements"]:
        t = e.get("tags", {})
        lat, lon = coords(e)
        osm = {"url": f"https://www.openstreetmap.org/{e['type']}/{e['id']}"}
        if t.get("check_date"):
            osm["chk"] = t["check_date"]
        base = {
            "id": f"osm-{e['type'][0]}{e['id']}",
            "lat": round(lat, 6),
            "lon": round(lon, 6),
            "nj": t.get("name") or "",
            "ne": t.get("name:en") or "",
            "pos": "exact",
            "osm": osm,
            "_tags": t,
        }
        if t.get("opening_hours"):
            base["hours"] = t["opening_hours"]
        if heated_from_text(t.get("name"), t.get("description"), t.get("note")):
            base["heated"] = True
        access = t.get("access")
        if access in ("private", "no"):
            continue

        if t.get("amenity") == "smoking_area":
            spot = dict(base, k="p", acc="customers" if access == "customers" else "public")
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
            # Bänke, Parkplätze usw. mit smoking=yes: Rauchen dort erlaubt, kein Geschäft
            if vtype in ("bench", "parking", "waste_basket", "shelter"):
                spots.append(dict(base, k="p", acc="public", sd="allowed"))
            continue
        detail = SMOKING_DETAIL[smoking]
        if vtype == "convenience" and smoking == "outside":
            detail = "ashtray_front"
        # Ob man etwas kaufen muss, sagt OSM nicht. Nur access=customers belegt es.
        spot = dict(base, k="v", acc="customers" if access == "customers" else "unknown", vt=label, sd=detail)
        if vtype == "convenience":
            spot["_konbini"] = True
        spots.append(spot)
    return konbini_rule(spots)


def konbini_checked(spot):
    chk = spot["osm"].get("chk") or ""
    return chk >= KONBINI_CHECKED_SINCE


def konbini_rule(spots):
    """Konbini-Einträge: belegt, unbestätigt oder doppelt.

    - Liegt ein OSM-Raucherplatz höchstens 25 m entfernt, zeigt die App den Raucherplatz
      und lässt den Konbini weg (doppelt).
    - Seit 2024 geprüft: bleibt als belegter Eintrag.
    - Sonst: bleibt in den Daten, aber als "unv" (unbestätigt), standardmäßig ausgeblendet.
    """
    areas = [s for s in spots if s["k"] == "p" and "osm" in s and "off" not in s]
    out = []
    for s in spots:
        if not s.pop("_konbini", False):
            out.append(s)
            continue
        if any(dist_m(s["lat"], s["lon"], a["lat"], a["lon"]) <= KONBINI_NEAR_AREA_M for a in areas):
            KONBINI_STATS["duplicate"] += 1
            continue
        if konbini_checked(s):
            KONBINI_STATS["confirmed"] += 1
        else:
            s["unv"] = True
            KONBINI_STATS["unverified"] += 1
        out.append(s)
    return out


KONBINI_STATS = {"confirmed": 0, "unverified": 0, "duplicate": 0}


def position_quality(s):
    note = (s.get("note") or "").lower()
    if s.get("geo_precision") == "area" or s.get("geo") == "map" or "no feature id" in note:
        return "area"
    if s.get("geo") == "address":
        return "address"
    return "exact"


def official_files(region):
    """Hauptdatei der Region plus Ergänzungen wie tokyo_shinagawa.json (einzeln geprüfte Bezirkslisten)."""
    main = os.path.join(OFFICIAL, f"{region}.json")
    extra = sorted(glob.glob(os.path.join(OFFICIAL, f"{region}_*.json")))
    return [p for p in [main] + extra if os.path.exists(p)]


def official_spots(region):
    rows = []
    for path in official_files(region):
        rows.extend(load_json(path).get("spots", []))
    ids = [s["id"] for s in rows]
    dup = {i for i in ids if ids.count(i) > 1}
    if dup:
        raise SystemExit(f"doppelte IDs in den offiziellen Daten: {sorted(dup)}")
    out = []
    for s in rows:
        if s.get("lat") is None or s.get("lon") is None:
            continue
        if s.get("status") == "closed":
            continue
        off = {"ward": s.get("ward"), "url": s.get("source_url")}
        if s.get("source_date"):
            off["date"] = s["source_date"]
        spot = {
            "id": f"off-{s['id']}",
            "k": "p",
            "acc": "public",
            "lat": round(float(s["lat"]), 6),
            "lon": round(float(s["lon"]), 6),
            "nj": s.get("name_ja") or "",
            "ne": s.get("name_en") or "",
            "pos": position_quality(s),
            "off": off,
        }
        if s.get("hint_ja"):
            spot["hint"] = s["hint_ja"]
        if s.get("address_ja"):
            spot["addr"] = s["address_ja"]
        if s.get("hours"):
            spot["hours"] = s["hours"]
        if s.get("heated_only"):
            spot["heated"] = True
        if s.get("status") == "unknown":
            spot["unk"] = True
        if s.get("access") == "customers":
            # Von der Stadt als "nur für Kunden" gelistet: Kaufpflicht belegt
            spot.update(k="v", acc="customers", vt="shop", sd="room")
        out.append(spot)
    return out


def merge_radius(official_spot):
    return MERGE_RADIUS_M if official_spot["pos"] == "exact" else MERGE_RADIUS_M * 2


def merge(official, osm):
    """Legt OSM-Raucherplätze mit offiziellen Plätzen zusammen.

    Eins zu eins und nächster Partner zuerst: Jeder offizielle Platz nimmt höchstens
    einen OSM-Platz auf. Ein zweiter OSM-Platz in der Nähe bleibt als eigener Eintrag.
    """
    candidates = []
    for oi, o in enumerate(osm):
        if o["k"] != "p":
            continue
        for mi, m in enumerate(official):
            if m["k"] != "p":
                continue
            d = dist_m(o["lat"], o["lon"], m["lat"], m["lon"])
            if d <= merge_radius(m):
                candidates.append((d, oi, mi))
    candidates.sort()
    used_osm, used_off = set(), set()
    for d, oi, mi in candidates:
        if oi in used_osm or mi in used_off:
            continue
        used_osm.add(oi)
        used_off.add(mi)
        o, m = osm[oi], official[mi]
        m["osm"] = o["osm"]
        # Eine geokodierte Adresse ist ungenauer als ein von Hand gesetzter OSM-Punkt
        if m["pos"] != "exact":
            m["lat"], m["lon"], m["pos"] = o["lat"], o["lon"], "exact"
            m["posFrom"] = "osm"
        for key in ("cov", "ind"):
            if key in o and key not in m:
                m[key] = o[key]
    # Ein zweiter OSM-Raucherplatz in höchstens 15 m Abstand ist praktisch immer ein doppelter
    # OSM-Eintrag desselben Platzes (zwei getrennte Raucherplätze liegen nie so dicht beieinander).
    for oi, o in enumerate(osm):
        if oi in used_osm or o["k"] != "p":
            continue
        if any(m["k"] == "p" and dist_m(o["lat"], o["lon"], m["lat"], m["lon"]) <= DUPLICATE_RADIUS_M for m in official):
            used_osm.add(oi)
            DUP_STATS["osm_duplicate"] += 1
    return list(official) + [o for i, o in enumerate(osm) if i not in used_osm]


DUPLICATE_RADIUS_M = 15
DUP_STATS = collections.Counter()


NAME_STATS = collections.Counter()
REVIEW = []


def enrich(s):
    """Lokalisierter Name, Ortstyp, Rauchbereich und Zugang (siehe localize.py, classify.py)."""
    tags = s.pop("_tags", None) or {}
    loc, extra = localize.localize(s, tags)
    for key in ("le", "ld", "lq", "lr"):
        if loc.get(key):
            s[key] = loc[key]
    if extra.get("heated"):
        s["heated"] = True
    if extra.get("ex"):
        s["ex"] = extra["ex"]
    s.update(classify.classify(s, tags, extra))
    nj = s.get("nj") or ""
    NAME_STATS["total"] += 1
    if nj and localize.JA.search(nj) and not s.get("ne"):
        NAME_STATS["ja_only"] += 1
    NAME_STATS[f"q_{s.get('lq', 'none')}"] += 1
    if s.get("lq") not in localize.RELIABLE:
        REVIEW.append(s)


def build(region):
    for key in KONBINI_STATS:
        KONBINI_STATS[key] = 0
    stations = load_stations(region)
    spots = merge(official_spots(region), osm_spots(region))
    for s in spots:
        st = nearest_station(stations, s["lat"], s["lon"])
        if st:
            s["st"] = st
        enrich(s)
    spots.sort(key=lambda s: (s["k"], s["lat"], s["id"]))
    payload = {"schema": SCHEMA, "region": region, "built": date.today().isoformat(), "konbini": dict(KONBINI_STATS), "spots": spots}
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, f"{region}.json"), "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    pub = sum(1 for s in spots if s["acc"] == "public")
    off = sum(1 for s in spots if "off" in s)
    print(f"{region}: {len(spots)} Orte ({pub} öffentlich, {off} offiziell gelistet, {len(spots) - pub} mit Kundenpflicht oder unklarem Zugang); Konbini {KONBINI_STATS}")


def write_report():
    """Bericht zur Namensqualität und Liste zum Prüfen von Hand (data/i18n/)."""
    out = os.path.join(ROOT, "data", "i18n")
    with open(os.path.join(out, "report.json"), "w", encoding="utf-8") as f:
        json.dump(dict(NAME_STATS), f, ensure_ascii=False, indent=2, sort_keys=True)
    with open(os.path.join(out, "review.csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "quality", "name_ja", "name_en_osm", "en", "de", "place_kind", "area_kind"])
        for s in sorted(REVIEW, key=lambda x: x["id"]):
            w.writerow([s["id"], s.get("lq", "none"), s.get("nj", ""), s.get("ne", ""), s.get("le", ""), s.get("ld", ""), s.get("pk"), s.get("ak")])
    with open(os.path.join(out, "localized.csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "quality", "name_ja", "en", "de"])
        for region in REGIONS:
            path = os.path.join(OUT, f"{region}.json")
            if not os.path.exists(path):
                continue
            for s in load_json(path)["spots"]:
                if s.get("lq") in ("composed", "romaji", "brand"):
                    w.writerow([s["id"], s["lq"], s.get("nj", ""), s.get("le", ""), s.get("ld", "")])
    print("Namen:", dict(NAME_STATS))
    print("Doppelte OSM-Punkte neben offiziellen Plätzen entfernt:", DUP_STATS["osm_duplicate"])


if __name__ == "__main__":
    for r in sys.argv[1:] or REGIONS:
        build(r)
    write_report()
