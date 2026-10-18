#!/usr/bin/env python3
"""Ortstyp, Art des Rauchbereichs und Zugang aus belegten Angaben.

Nur was in Tags, Namen oder Beschreibung der Quelle steht. Fehlt etwas, bleibt es "unknown".

  pk  Ortstyp:  station airport mall park street cafe restaurant fast_food bar karaoke hotel
                konbini tobacco shop pachinko building leisure unknown
  ak  Rauchbereich: room booth outdoor section whole ashtray area unknown
  io  in | out (nur wenn belegt)
  fl  Stockwerk wie "4F" oder "B1"
  tk  True: Ticket oder Bordkarte nötig (z. B. nach der Sicherheitskontrolle)
  free True: Quelle sagt ausdrücklich kostenlos bzw. für alle
  tob "both": Quelle nennt Zigaretten und Tabakerhitzer
"""
import re

FLOOR = re.compile(r"(B|地下)\s?(\d{1,2})\s?(?:階|F)|(?<![0-9.])(\d{1,2})\s?(?:階|F)(?![a-zA-Z])")

VENUE_PK = {
    "cafe": "cafe", "restaurant": "restaurant", "fast_food": "fast_food", "pub": "bar", "bar": "bar",
    "beer_garden": "bar", "club": "bar", "karaoke": "karaoke", "hotel": "hotel", "konbini": "konbini",
    "tobacco": "tobacco", "shop": "shop",
}

# Reihenfolge zählt: die erste passende Regel gewinnt
NAME_RULES = [
    ("airport", ["空港", "Airport"]),
    ("konbini", ["ローソン", "ファミリーマート", "セブン-イレブン", "セブンイレブン", "ミニストップ", "デイリーヤマザキ"]),
    ("pachinko", ["パチンコ", "パチスロ", "スロット", "マルハン", "キコーナ", "マジックバード", "アミューズ", "123"]),
    ("tobacco", ["たばこ", "タバコ", "煙草", "シガー"]),
    ("karaoke", ["カラオケ"]),
    ("hotel", ["ホテル", "旅館", "Hotel"]),
    ("cafe", ["喫茶", "カフェ", "珈琲", "コーヒー", "Café", "Cafe", "CAFE", "COFFEE", "Coffee"]),
    ("bar", ["居酒屋", "酒場", "立ち飲み", "スナック", " BAR", " Bar", "Bar "]),
    ("restaurant", ["焼肉", "食堂", "ラーメン", "料理", "寿司", "そば", "うどん", "定食", "レストラン", "焼鳥", "焼き鳥", "串"]),
    ("mall", ["モール", "ショッピング", "百貨店", "デパート", "地下街", "商業施設", "ヒルズ", "ルミネ", "パルコ", "マルイ"]),
    ("station", ["駅"]),
    ("park", ["公園", "海洋博"]),
    ("building", ["ビル", "タワー", "会館", "センター", "庁舎", "役所", "大学", "Tower", "Building"]),
    ("street", ["広場", "通り", "高架下", "交差点", "歩道", "デッキ", "ロータリー", "口"]),
]


def floor_of(*texts):
    for t in texts:
        if not t:
            continue
        m = FLOOR.search(t)
        if m:
            if m.group(1):
                return f"B{m.group(2)}"
            return f"{m.group(3)}F"
    return None


def classify(spot, osm_tags=None, extra=None):
    """Gibt ein dict mit den neuen Feldern zurück. Ändert spot nicht."""
    t = osm_tags or {}
    extra = extra or {}
    text = " ".join(x for x in [spot.get("nj"), spot.get("hint"), spot.get("ne")] if x)
    # Für den Ortstyp zählt nur der Name; Beschreibungen erwähnen oft andere Orte
    name = " ".join(x for x in [spot.get("nj"), spot.get("ne")] if x)
    out = {}

    # ---- Ortstyp
    pk = None
    if spot["k"] == "v" and spot.get("vt") in VENUE_PK and spot.get("vt") != "shop":
        pk = VENUE_PK[spot["vt"]]
    if extra.get("shoptype") == "tobacco":
        pk = "tobacco"
    if t.get("shop") == "tobacco":
        pk = "tobacco"
    if not pk and (t.get("shop") in ("mall", "department_store")):
        pk = "mall"
    if not pk and spot.get("off", {}).get("ward") == "Naha Airport":
        pk = "airport"
    if not pk and spot.get("off", {}).get("ward") == "Motobu":
        pk = "leisure"
    if not pk:
        for kind, words in NAME_RULES:
            if any(w in name for w in words):
                pk = kind
                break
    out["pk"] = pk or ("shop" if spot.get("vt") == "shop" else "unknown")

    # ---- Rauchbereich
    ak = None
    if spot["k"] == "v" and spot.get("sd"):
        ak = {"room": "section", "smoking_venue": "whole", "allowed": "whole", "outside": "outdoor", "ashtray_front": "ashtray"}.get(spot["sd"])
    if extra.get("whole") or "店舗全面喫煙可能" in text:
        ak = "whole"
    if not ak:
        if extra.get("booth") or "コンテナ" in text or "ブース" in text:
            ak = "booth"
        elif "屋外" in text or extra.get("io") == "out":
            ak = "outdoor"
        elif "屋内" in text or "喫煙室" in text or "喫煙ルーム" in text or extra.get("io") == "in" or spot.get("ind"):
            ak = "room"
        elif spot["k"] == "p" and t.get("amenity") == "smoking_area" and (t.get("covered") == "yes" or t.get("shelter") == "yes"):
            ak = "outdoor"
        elif spot["k"] == "p":
            ak = "area"
    out["ak"] = ak or "unknown"
    if out["ak"] in ("room", "booth", "section", "whole"):
        out["io"] = "in"
    elif out["ak"] in ("outdoor", "ashtray"):
        out["io"] = "out"

    # ---- Stockwerk
    fl = extra.get("fl") or floor_of(spot.get("hint"), spot.get("nj"))
    if fl:
        out["fl"] = fl
    if t.get("level") and not fl and re.fullmatch(r"-?\d+", t["level"]):
        lv = int(t["level"])
        out["fl"] = f"B{-lv}" if lv < 0 else f"{lv + 1}F"

    # ---- Zugang
    if re.search(r"保安検査(場[A-Z]?)?(通過)?後|after security", text):
        out["tk"] = True
    if "無料" in text or "誰でも利用可" in text or extra.get("run") == "public":
        out["free"] = True
    if ("紙巻" in text and "加熱" in text and "専用" not in text):
        out["tob"] = "both"
    return out
