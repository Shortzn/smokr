#!/usr/bin/env python3
"""Lokalisiert japanische Namen beim Build, ohne Übersetzungsdienst.

Quellen, in dieser Reihenfolge:
  1. OSM name:en / brand:en des Eintrags selbst
  2. Name ist schon lateinisch
  3. Zerlegung des japanischen Namens. Jeder Teil muss bekannt sein:
     - Eigennamen aus dem Ortsnamen-Verzeichnis (OSM-Objekte mit name und name:en, ODbL)
     - allgemeine Begriffe aus data/i18n/glossary.json (geprüft)
     - Marken aus OSM brand/brand:en und dem Glossar
     - reine Kana-Wörter als Hepburn-Umschrift (Lesung, keine Übersetzung)
  4. Sonst keine Übersetzung: Die App zeigt dann Ortstyp und Bahnhof, der japanische Name bleibt sichtbar.

Ergebnis je Platz: le (Englisch), ld (Deutsch), lq (Qualität), lr (Lesung, falls umgeschrieben).
"""
import collections
import json
import os
import re
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
GLOSSARY = json.load(open(os.path.join(ROOT, "data", "i18n", "glossary.json"), encoding="utf-8"))
REGIONS = ["tokyo", "kamakura", "kyoto", "okinawa", "osaka"]

JA = re.compile(r"[぀-ヿ一-鿿々〆ヵヶ]")
KANA_ONLY = re.compile(r"^[぀-ヿー・\s]+$")
LATIN = re.compile(r"^[A-Za-z0-9À-ɏ' .,&@+\-/!?:()]+$")
GENERIC = set(GLOSSARY["facility"]) | {"喫煙所", "喫煙場所"}

# Qualitäten, die als verlässlich gelten (keine Prüfung von Hand nötig)
RELIABLE = {"osm_en", "brand", "latin", "composed"}


def nfkc(s):
    return unicodedata.normalize("NFKC", s or "").strip()


# ---------- Kana nach Hepburn ----------
_H = {
    "あ": "a", "い": "i", "う": "u", "え": "e", "お": "o", "か": "ka", "き": "ki", "く": "ku", "け": "ke", "こ": "ko",
    "さ": "sa", "し": "shi", "す": "su", "せ": "se", "そ": "so", "た": "ta", "ち": "chi", "つ": "tsu", "て": "te", "と": "to",
    "な": "na", "に": "ni", "ぬ": "nu", "ね": "ne", "の": "no", "は": "ha", "ひ": "hi", "ふ": "fu", "へ": "he", "ほ": "ho",
    "ま": "ma", "み": "mi", "む": "mu", "め": "me", "も": "mo", "や": "ya", "ゆ": "yu", "よ": "yo",
    "ら": "ra", "り": "ri", "る": "ru", "れ": "re", "ろ": "ro", "わ": "wa", "ゐ": "i", "ゑ": "e", "を": "o", "ん": "n",
    "が": "ga", "ぎ": "gi", "ぐ": "gu", "げ": "ge", "ご": "go", "ざ": "za", "じ": "ji", "ず": "zu", "ぜ": "ze", "ぞ": "zo",
    "だ": "da", "ぢ": "ji", "づ": "zu", "で": "de", "ど": "do", "ば": "ba", "び": "bi", "ぶ": "bu", "べ": "be", "ぼ": "bo",
    "ぱ": "pa", "ぴ": "pi", "ぷ": "pu", "ぺ": "pe", "ぽ": "po", "ゔ": "vu",
    "ぁ": "a", "ぃ": "i", "ぅ": "u", "ぇ": "e", "ぉ": "o",
}
_DIGRAPH = {
    "きゃ": "kya", "きゅ": "kyu", "きょ": "kyo", "しゃ": "sha", "しゅ": "shu", "しょ": "sho", "ちゃ": "cha", "ちゅ": "chu",
    "ちょ": "cho", "にゃ": "nya", "にゅ": "nyu", "にょ": "nyo", "ひゃ": "hya", "ひゅ": "hyu", "ひょ": "hyo", "みゃ": "mya",
    "みゅ": "myu", "みょ": "myo", "りゃ": "rya", "りゅ": "ryu", "りょ": "ryo", "ぎゃ": "gya", "ぎゅ": "gyu", "ぎょ": "gyo",
    "じゃ": "ja", "じゅ": "ju", "じょ": "jo", "びゃ": "bya", "びゅ": "byu", "びょ": "byo", "ぴゃ": "pya", "ぴゅ": "pyu",
    "ぴょ": "pyo", "しぇ": "she", "ちぇ": "che", "じぇ": "je", "てぃ": "ti", "でぃ": "di", "ふぁ": "fa", "ふぃ": "fi",
    "ふぇ": "fe", "ふぉ": "fo", "うぃ": "wi", "うぇ": "we", "うぉ": "wo", "ゔぁ": "va", "ゔぃ": "vi", "ゔぇ": "ve", "ゔぉ": "vo",
    "とぅ": "tu", "どぅ": "du",
}
_MACRON = {"a": "ā", "i": "ī", "u": "ū", "e": "ē", "o": "ō"}


def kana_to_romaji(text):
    """Hepburn-Umschrift für Hiragana und Katakana. None, wenn etwas anderes darin steht."""
    s = "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in nfkc(text))
    out, i = [], 0
    while i < len(s):
        c = s[i]
        if c in "・ ":
            out.append(" ")
            i += 1
            continue
        if c == "ー":
            if out and out[-1] and out[-1][-1] in _MACRON:
                out[-1] = out[-1][:-1] + _MACRON[out[-1][-1]]
            i += 1
            continue
        if c == "っ":
            nxt = s[i + 1:i + 3]
            r = _DIGRAPH.get(nxt) or _H.get(s[i + 1:i + 2])
            if r:
                out.append("t" if r.startswith("ch") else r[0])
            i += 1
            continue
        if s[i:i + 2] in _DIGRAPH:
            out.append(_DIGRAPH[s[i:i + 2]])
            i += 2
            continue
        if c in _H:
            r = _H[c]
            if c == "ん" and i + 1 < len(s) and (_H.get(s[i + 1], "x")[0] in "aiueoy"):
                r = "n'"
            out.append(r)
            i += 1
            continue
        return None
    words = "".join(out).split()
    return " ".join(w[:1].upper() + w[1:] for w in words) or None


# ---------- Ortsnamen-Verzeichnis ----------
def load_gazetteer():
    counts = collections.defaultdict(collections.Counter)
    for region in REGIONS:
        path = os.path.join(RAW, f"gazetteer_{region}.json")
        if not os.path.exists(path):
            continue
        for e in json.load(open(path, encoding="utf-8"))["elements"]:
            t = e.get("tags", {})
            ja, en = nfkc(t.get("name")), nfkc(t.get("name:en"))
            # "昭和通り(Showa-dori)" oder "A;B": nur den ersten, sauberen Namen verwenden
            ja = re.sub(r"\(.*?\)", "", ja.split(";")[0]).strip()
            en = re.sub(r"\(.*?\)", "", en.split(";")[0]).strip()
            if not ja or not en or not JA.search(ja) or JA.search(en) or len(ja) < 2:
                continue
            if t.get("highway") and re.search(r"(-d[oō]ri|dōri)\s+(Avenue|Street)$", en):
                en = re.sub(r"\s+(Avenue|Street)$", "", en)
            is_station = t.get("railway") in ("station", "halt") or t.get("public_transport") == "station"
            if is_station or (ja.endswith("駅") and en.endswith(" Station")):
                # Bahnhöfe ohne "駅"/"Station" speichern; der Satzbau setzt es sprachgerecht wieder ein
                en = re.sub(r"\s+Station$", "", en)
                ja = re.sub(r"駅$", "", ja)
            counts[ja][en] += 1
    gaz = {}
    for ja, c in counts.items():
        en, n = c.most_common(1)[0]
        # Uneinige Einträge (verschiedene englische Namen) werden nicht verwendet
        if n / sum(c.values()) >= 0.6 and len(ja) >= 2:
            gaz[ja] = en
    return gaz


def load_brands():
    """Marken aus den OSM-Daten: brand (ja) und brand:en."""
    brands = dict(GLOSSARY["brands"])
    for region in REGIONS:
        for e in json.load(open(os.path.join(RAW, f"osm_{region}.json"), encoding="utf-8"))["elements"]:
            t = e.get("tags", {})
            b, ben = nfkc(t.get("brand")), nfkc(t.get("brand:en"))
            if b and ben and JA.search(b) and not JA.search(ben):
                brands.setdefault(b, ben)
    return brands


GAZ = None
BRANDS = None
SHOPTYPE = {"たばこ店": "tobacco", "たばこ": "tobacco", "タバコ": "tobacco", "煙草": "tobacco", "たばこハウス": "tobacco"}
STORE = {"本店": "main", "店": "branch", "支店": "branch"}


def _dicts():
    global GAZ, BRANDS
    if GAZ is None:
        GAZ = load_gazetteer()
        BRANDS = load_brands()
    entries = {}
    for k, v in GAZ.items():
        entries[k] = ("place", v)
    for k, v in GLOSSARY["katakana"].items():
        entries[k] = ("kata", v)
    for k, v in BRANDS.items():
        entries[nfkc(k)] = ("brand", v)
    for k, v in GLOSSARY["place_suffix"].items():
        entries[k] = ("suffix", v)
    for k, v in GLOSSARY["exit"].items():
        entries[k] = ("exit", v)
    for k, v in GLOSSARY["facility"].items():
        entries[k] = ("fac", v)
    for k, v in SHOPTYPE.items():
        entries[k] = ("shoptype", v)
    for k, v in STORE.items():
        entries[k] = ("store", v)
    entries["駅"] = ("station", None)
    entries["通り"] = ("dori", None)
    entries["通"] = ("dori", None)
    entries["口"] = ("kou", None)
    entries["前"] = ("mae", None)
    return entries


FLOOR = re.compile(r"(B|地下)?(\d{1,2})(階|F)")


def _kanji_num(s):
    digits = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
    if s == "十":
        return 10
    if "十" in s:
        a, b = s.split("十")
        return (digits.get(a, 1) * 10) + digits.get(b, 0)
    return digits.get(s, 0)


def tokenize(text):
    """Längste Übereinstimmung von links. Unbekannte Zeichen werden als 'unknown' gesammelt."""
    entries = _dicts()
    keys = sorted(entries, key=len, reverse=True)
    maxlen = max(len(k) for k in keys)
    toks, i = [], 0
    while i < len(text):
        c = text[i]
        if c.isspace() or c in "・-－、,.":
            i += 1
            continue
        m = FLOOR.match(text, i)
        if m:
            toks.append(("floor", ("B" if m.group(1) else "") + m.group(2) + ("" if m.group(1) else "F")))
            i = m.end()
            continue
        m = re.match(r"([0-9]+|[一二三四五六七八九十]+)丁目", text[i:])
        if m:
            n = m.group(1)
            if not n.isdigit():
                n = str(_kanji_num(n))
            toks.append(("latin", f"{n}-chome"))
            i += m.end()
            continue
        m = re.match(r"([A-Za-z]?\d{1,2}[a-z]?)番?出口", text[i:])
        if m:
            toks.append(("exitno", m.group(1).upper()))
            i += m.end()
            continue
        if c == "@":
            toks.append(("latin", "@"))
            i += 1
            continue
        m = re.match(r"[A-Za-z0-9][A-Za-z0-9'&+./!]*", text[i:])
        if m:
            toks.append(("latin", m.group(0)))
            i += m.end()
            continue
        hit = None
        for n in range(min(maxlen, len(text) - i), 0, -1):
            if text[i:i + n] in entries:
                hit = text[i:i + n]
                break
        if hit:
            toks.append(entries[hit] + (hit,))
            i += len(hit)
            continue
        m = re.match(r"[゠-ヿー]+", text[i:])
        if m:
            run = m.group(0)
            words = split_katakana(run)
            if words:
                toks.append(("kata", " ".join(words), run))
            elif LOANWORD.search(run) or len(run) > 5:
                # sieht nach Lehnwort aus: Lautschrift wäre irreführend, also nicht übersetzen
                toks.append(("unknown", run))
            else:
                rom = kana_to_romaji(run)
                toks.append(("romaji", rom, run) if rom else ("unknown", run))
            i += m.end()
            continue
        m = re.match(r"[ぁ-ゟ]+", text[i:])
        if m:
            rom = kana_to_romaji(m.group(0))
            toks.append(("romaji", rom, m.group(0)) if rom else ("unknown", m.group(0)))
            i += m.end()
            continue
        toks.append(("unknown", c))
        i += 1
    return toks


LOANWORD = re.compile(r"[ーァィゥェォヴ]")


def split_katakana(run):
    """Zerlegt ein Katakana-Wort vollständig in Glossar-Wörter, sonst None."""
    gl = GLOSSARY["katakana"]
    best = {0: []}
    for i in range(len(run)):
        if i not in best:
            continue
        for j in range(len(run), i, -1):
            w = run[i:j]
            if w in gl and j not in best:
                best[j] = best[i] + [gl[w]]
    return best.get(len(run))


PAREN = re.compile(r"[（(【\[]([^）)】\]]*)[）)】\]]")


def split_parens(name):
    inner = PAREN.findall(name)
    outer = PAREN.sub(" ", name).strip()
    return outer, inner


def parse_qualifiers(parts):
    q = {"flags": set(), "floor": None, "dir": None, "unknown": []}
    for p in parts:
        p = nfkc(p)
        if not p:
            continue
        if p in GLOSSARY["qualifier"]:
            q["flags"].add(GLOSSARY["qualifier"][p])
            continue
        m = FLOOR.search(p)
        if m:
            q["floor"] = ("B" if m.group(1) else "") + m.group(2) + ("" if m.group(1) else "F")
            p = FLOOR.sub("", p)
        p = p.strip()
        for d in sorted(GLOSSARY["direction"], key=len, reverse=True):
            if p == d or p == d + "側":
                q["dir"] = d
                p = ""
                break
        if p:
            known = [k for k in GLOSSARY["qualifier"] if k in p]
            for k in known:
                q["flags"].add(GLOSSARY["qualifier"][k])
            if not known:
                q["unknown"].append(p)
    return q


def compose(name, kind):
    """Baut englischen und deutschen Titel. Gibt (en, de, quality, info) zurück; en None, wenn nicht sicher."""
    outer, inner = split_parens(nfkc(name))
    q = parse_qualifiers(inner)
    toks = tokenize(outer)
    info = {"qualifiers": q, "tokens": toks}
    if not toks or any(t[0] == "unknown" for t in toks):
        # Marke am Anfang reicht für Lokale: Filialname darf unbekannt sein
        if toks and toks[0][0] == "brand":
            fac = next((t for t in toks if t[0] == "fac"), None)
            en = toks[0][1] + (f" {fac[1][0]}" if fac else "")
            de = (f"{fac[1][1]} " if fac else "") + toks[0][1] if fac else toks[0][1]
            return en, de, "brand", info
        return None, None, "partial", info

    places, station, exit_en, exit_de, suffix, front, fac, store = [], None, None, None, [], False, None, None
    roman = False
    shoptype = None
    for t in toks:
        k = t[0]
        if k == "latin" and t[1].islower() and t[1].isalpha() and places and places[-1] == "@":
            places.append(t[1].capitalize())
        elif k in ("place", "kata", "latin", "brand"):
            places.append(t[1])
        elif k == "romaji":
            places.append(t[1])
            roman = True
        elif k == "dori":
            if not places:
                return None, None, "partial", info
            places[-1] = f"{places[-1]}-dori"
        elif k == "station":
            # Alles davor ist der Bahnhofsname, alles danach ein Ort am Bahnhof
            if not places or station is not None:
                return None, None, "partial", info
            station = " ".join(places)
            places = []
        elif k == "kou":
            if not places:
                return None, None, "partial", info
            x = places.pop()
            exit_en, exit_de = f"{x} Exit", f"{x}-Ausgang"
        elif k == "exit":
            exit_en, exit_de = t[1]
        elif k == "exitno":
            exit_en, exit_de = f"Exit {t[1]}", f"Ausgang {t[1]}"
        elif k == "suffix":
            if t[1][0]:
                suffix.append(t[1])
        elif k == "mae":
            # Nur "vor X", wenn danach höchstens die Einrichtung folgt (nicht in Filialnamen wie 黒門市場前店)
            following = [x[0] for x in toks[toks.index(t) + 1:]]
            if all(f in ("fac", "floor") for f in following):
                front = True
        elif k == "fac":
            fac = t[1]
        elif k == "shoptype":
            shoptype = t[1]
        elif k == "store":
            store = t[1]
        elif k == "floor":
            q["floor"] = q["floor"] or t[1]
    info["shoptype"] = shoptype
    if not places and not station and not exit_en:
        return None, None, "generic", info
    rest = " ".join(places).replace(" @ ", "@").replace(" @", "@").replace("@ ", "@").replace("@", " @ ")
    base_en, base_de = rest, rest
    pre_suffix = [s for s in suffix if s[0][0].isupper()]
    post_suffix = [s for s in suffix if not s[0][0].isupper()]
    if station:
        base_en = f"{station} Station {rest}".strip()
        base_de = f"Bahnhof {station} {rest}".strip()
    if pre_suffix:
        base_en = " ".join([base_en] + [s[0] for s in pre_suffix]).strip()
        base_de = ", ".join([base_de] + [s[1] for s in pre_suffix]).strip(", ")
    # Ein Geschäftsname (z. B. Tabakladen) braucht kein angehängtes "Smoking Area"
    implicit = kind == "p" and not shoptype
    fac_en = fac[0] if fac else ("Smoking Area" if implicit else "")
    fac_de = fac[1] if fac else ("Raucherplatz" if implicit else "")
    if front:
        en = f"{fac_en} in front of {base_en}".strip() if fac_en else f"In front of {base_en}"
        de = f"{fac_de} vor {base_de}".strip() if fac_de else f"Vor {base_de}"
    else:
        en = f"{base_en} {fac_en}".strip()
        de = f"{fac_de} {base_de}".strip()
    if post_suffix:
        en += ", " + ", ".join(s[0] for s in post_suffix)
        de += ", " + ", ".join(s[1] for s in post_suffix)
    if exit_en:
        info["exit"] = [exit_en, exit_de]
        en += f" – {exit_en}"
        de += f" – {exit_de}"
    return en, de, "romaji" if roman else "composed", info


def localize(spot, osm_tags=None):
    """Setzt le, ld, lq und Zusatzangaben aus dem Namen."""
    t = osm_tags or {}
    nj = nfkc(spot.get("nj"))
    ne = nfkc(spot.get("ne"))
    extra = {}
    if ne and not JA.search(ne):
        return dict(le=ne, ld=ne, lq="osm_en"), extra
    ben = nfkc(t.get("brand:en"))
    if ben and not JA.search(ben):
        return dict(le=ben, ld=ben, lq="brand"), extra
    if not nj:
        return dict(lq="none"), extra
    if not JA.search(nj) and LATIN.match(nj):
        return dict(le=nj, ld=nj, lq="latin"), extra
    outer, _ = split_parens(nj)
    if nfkc(outer) in GENERIC:
        en, de, lq, info = compose(nj, spot["k"])
        return dict(lq="generic"), _extra(info)
    en, de, lq, info = compose(nj, spot["k"])
    extra = _extra(info)
    if not en and KANA_ONLY.match(nj):
        rom = kana_to_romaji(nj)
        if rom:
            return dict(le=rom, ld=rom, lq="romaji", lr=rom), extra
    if en:
        out = dict(le=en, ld=de, lq=lq)
        if lq == "romaji":
            out["lr"] = " ".join(x[1] for x in info["tokens"] if x[0] == "romaji")
        return out, extra
    return dict(lq=lq), extra


def _extra(info):
    q = info.get("qualifiers", {})
    out = {}
    if q.get("floor"):
        out["fl"] = q["floor"]
    if q.get("dir"):
        out["dir"] = q["dir"]
    flags = q.get("flags", set())
    if "heated_only" in flags:
        out["heated"] = True
    if "booth" in flags:
        out["booth"] = True
    if "outdoor" in flags:
        out["io"] = "out"
    if "indoor" in flags:
        out["io"] = "in"
    if "whole_venue" in flags:
        out["whole"] = True
    if flags & {"ward_run", "city_run"}:
        out["run"] = "public"
    if info.get("exit"):
        out["ex"] = info["exit"]
    for tok in info.get("tokens", []):
        if tok[0] == "floor":
            out.setdefault("fl", tok[1])
        if tok[0] == "shoptype":
            out["shoptype"] = tok[1]
    return out


if __name__ == "__main__":
    import sys
    for n in sys.argv[1:]:
        print(n, "→", localize({"nj": n, "k": "p"}))
