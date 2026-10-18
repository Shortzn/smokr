"""Regressionstests für Namenslokalisierung und Ortstypen (scripts/localize.py, scripts/classify.py)."""
import importlib.util
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import classify  # noqa: E402
import localize  # noqa: E402


def loc(name, k="p", tags=None):
    return localize.localize({"nj": name, "k": k}, tags)


class LocalizeTest(unittest.TestCase):
    def test_user_examples(self):
        l, x = loc("秋葉原昭和通り口喫煙所（区営）")
        self.assertEqual(l["le"], "Akihabara Smoking Area – Showa-dori Exit")
        self.assertEqual(l["ld"], "Raucherplatz Akihabara – Showa-dori-Ausgang")
        self.assertEqual(x.get("run"), "public")
        self.assertEqual(loc("オアシス@akiba（区営）")[0]["le"], "Oasis @ Akiba Smoking Area")
        l, x = loc("ミマツたばこ")
        self.assertEqual(l["le"], "Mimatsu")
        self.assertEqual(x["shoptype"], "tobacco")

    def test_station_exit_and_floor(self):
        l, _ = loc("新宿駅東口公衆喫煙所")
        self.assertEqual(l["le"], "Shinjuku Station Public Smoking Area – East Exit")
        self.assertEqual(l["ld"], "Öffentlicher Raucherplatz Bahnhof Shinjuku – Ostausgang")
        self.assertEqual(loc("大門駅Ａ６出口指定喫煙場所")[0]["le"], "Daimon Station Designated Smoking Area – Exit A6")
        l, x = loc("田町駅西口（２階）指定喫煙場所（加熱式たばこ専用）")
        self.assertEqual(x["fl"], "2F")
        self.assertTrue(x["heated"])

    def test_brand_from_osm_tags(self):
        l, _ = loc("マクドナルド", "v", {"brand:en": "McDonald's"})
        self.assertEqual((l["le"], l["lq"]), ("McDonald's", "brand"))
        l, _ = localize.localize({"nj": "ウェンディーズ・ファーストキッチン", "ne": "Wendy's First Kitchen", "k": "v"})
        self.assertEqual(l["le"], "Wendy's First Kitchen")

    def test_unknown_parts_are_not_guessed(self):
        # 烏森 (Karasumori) ist weder im Verzeichnis noch im Glossar: lieber nichts als falsch
        l, _ = loc("新橋駅烏森口指定喫煙場所")
        self.assertNotIn("le", l)
        self.assertEqual(l["lq"], "partial")
        # lange Katakana-Lehnwörter nicht in Lautschrift verwandeln
        self.assertNotIn("le", loc("コムズガーデン喫煙所")[0])

    def test_branch_names_are_not_front_of(self):
        l, _ = loc("上島珈琲店 黒門市場前店", "v")
        self.assertNotIn("in front of", l.get("le", ""))
        self.assertIn("in front of", loc("台東リバーサイドスポーツセンター体育館前")[0]["le"])

    def test_generic_names(self):
        self.assertEqual(loc("喫煙所")[0]["lq"], "generic")

    def test_kana_romanization(self):
        self.assertEqual(localize.kana_to_romaji("まいど"), "Maido")
        self.assertEqual(localize.kana_to_romaji("しんばし"), "Shinbashi")
        self.assertEqual(localize.kana_to_romaji("きょうと"), "Kyouto")
        self.assertIsNone(localize.kana_to_romaji("漢字"))


class ClassifyTest(unittest.TestCase):
    def c(self, **spot):
        spot.setdefault("k", "p")
        return classify.classify(spot)

    def test_osaka_official(self):
        r = self.c(nj="あべのキューズモール喫煙所（4F東）", hint="大阪市指定喫煙所（無料・誰でも利用可） / 屋内喫煙所 / 面積 7平方メートル", off={"ward": "Osaka Abeno"})
        self.assertEqual((r["pk"], r["ak"], r["io"], r.get("free")), ("mall", "room", "in", True))
        self.assertEqual(r["fl"], "4F")

    def test_name_not_hint_decides_place(self):
        r = self.c(nj="paspa小舟町", hint="令和6年3月5日から当面の間、紙巻きたばこの利用を休止します。")
        self.assertEqual(r["pk"], "unknown")
        self.assertEqual(self.c(nj="マジックバード2喫煙所（1階中央）")["pk"], "pachinko")

    def test_airport_after_security_needs_ticket(self):
        r = self.c(nj="那覇空港 喫煙室", hint="2F 国内線搭乗待合室（保安検査後）", off={"ward": "Naha Airport"})
        self.assertTrue(r["tk"])
        self.assertEqual(r["pk"], "airport")

    def test_venue_area_kinds(self):
        self.assertEqual(classify.classify({"k": "v", "vt": "cafe", "sd": "room"})["ak"], "section")
        self.assertEqual(classify.classify({"k": "v", "vt": "konbini", "sd": "ashtray_front"})["ak"], "ashtray")
        self.assertEqual(classify.classify({"k": "v", "vt": "bar", "sd": "allowed"})["ak"], "whole")

    def test_nothing_invented(self):
        r = self.c(nj="")
        self.assertEqual(r["pk"], "unknown")
        self.assertNotIn("fl", r)
        self.assertNotIn("free", r)
        self.assertNotIn("tk", r)


if __name__ == "__main__":
    unittest.main()


class NightPassTest(unittest.TestCase):
    """Ergänzungen vom 18.10.2026: Nummern, Bindestriche, Seiten, Richtung."""

    def loc(self, nj):
        return localize.localize({"nj": nj, "k": "p"}, {})

    def test_circled_number_goes_to_the_end(self):
        out, _ = self.loc("お台場海浜公園内指定喫煙場所⑤")
        self.assertEqual(out["le"], "Odaiba Seaside Park Designated Smoking Area 5")

    def test_hyphen_in_latin_names_stays(self):
        out, _ = self.loc("P-ROOTs MANDORE喫煙所")
        self.assertEqual(out["le"], "P-ROOTs MANDORE Smoking Area")

    def test_side_and_exit(self):
        out, _ = self.loc("新宿駅東南口高架下公衆喫煙所")
        self.assertIn("Southeast Exit", out["le"])
        self.assertIn("under the tracks", out["le"])

    def test_direction_in_parens_is_kept_as_extra(self):
        _, extra = self.loc("123鶴橋店屋内喫煙所（南西）")
        self.assertEqual(extra.get("dir"), "南西")

    def test_crossing_is_not_guessed(self):
        out, _ = self.loc("（区設置）渋谷駅前スクランブル交差点喫煙所")
        self.assertNotIn("Station Front Crossing", out.get("le") or "")
