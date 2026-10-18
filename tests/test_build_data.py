"""Tests für scripts/build_data.py und die gebauten Dateien in app/data.

Aufruf: python3 -I -m unittest discover -s tests -p 'test_*.py'   (aus ~/Projects/smokr)
"""
import importlib.util
import json
import os
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("build_data", os.path.join(ROOT, "scripts", "build_data.py"))
bd = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bd)


def off(i, lat, lon, pos="exact"):
    return {"id": f"off-{i}", "k": "p", "acc": "public", "lat": lat, "lon": lon, "pos": pos, "off": {"ward": "W"}}


def osm(i, lat, lon, **kw):
    return dict({"id": f"osm-{i}", "k": "p", "acc": "public", "lat": lat, "lon": lon, "pos": "exact", "osm": {"url": f"u{i}"}}, **kw)


# 0.0001 Grad Breite sind etwa 11 m
class MergeTest(unittest.TestCase):
    def test_nearest_partner_wins(self):
        a, b = off("a", 35.0, 139.0), off("b", 35.0003, 139.0)
        o = osm(1, 35.00025, 139.0)  # 28 m von a, 6 m von b
        out = bd.merge([a, b], [o])
        self.assertEqual(len(out), 2)
        self.assertIn("osm", b)
        self.assertNotIn("osm", a)

    def test_one_official_takes_only_one_osm(self):
        a = off("a", 35.0, 139.0)
        near, other = osm(1, 35.00005, 139.0), osm(2, 35.0002, 139.0)  # 6 m und 22 m
        out = bd.merge([a], [near, other])
        self.assertEqual([s["id"] for s in out], ["off-a", "osm-2"])
        self.assertEqual(a["osm"]["url"], "u1")

    def test_far_osm_stays_separate(self):
        out = bd.merge([off("a", 35.0, 139.0)], [osm(1, 35.001, 139.0)])  # 111 m
        self.assertEqual(len(out), 2)

    def test_geocoded_position_replaced_by_osm(self):
        a = off("a", 35.0, 139.0, pos="address")
        bd.merge([a], [osm(1, 35.0005, 139.0)])  # 55 m, im doppelten Radius
        self.assertEqual((a["lat"], a["pos"], a.get("posFrom")), (35.0005, "exact", "osm"))

    def test_exact_official_keeps_its_position(self):
        a = off("a", 35.0, 139.0)
        bd.merge([a], [osm(1, 35.0002, 139.0)])
        self.assertEqual(a["lat"], 35.0)

    def test_venues_never_merge(self):
        out = bd.merge([off("a", 35.0, 139.0)], [osm(1, 35.0, 139.0, k="v", acc="unknown")])
        self.assertEqual(len(out), 2)


class ClassificationTest(unittest.TestCase):
    def test_position_quality(self):
        self.assertEqual(bd.position_quality({"geo": "source"}), "exact")
        self.assertEqual(bd.position_quality({"geo": "address", "geo_precision": "block"}), "address")
        self.assertEqual(bd.position_quality({"geo": "address", "geo_precision": "area"}), "area")
        self.assertEqual(bd.position_quality({"geo": "map", "geo_precision": "area"}), "area")
        self.assertEqual(bd.position_quality({"geo": "source", "note": "Map link has no feature id; ..."}), "area")


class BuiltDataTest(unittest.TestCase):
    """Prüft die ausgelieferten Dateien, nicht nur den Code."""

    def load(self, region):
        with open(os.path.join(ROOT, "app", "data", f"{region}.json"), encoding="utf-8") as f:
            return json.load(f)

    def test_schema_and_integrity(self):
        for region in bd.REGIONS:
            with self.subTest(region=region):
                d = self.load(region)
                self.assertEqual(d["schema"], bd.SCHEMA)
                self.assertEqual(d["region"], region)
                ids = [s["id"] for s in d["spots"]]
                self.assertEqual(len(ids), len(set(ids)), "doppelte IDs")
                for s in d["spots"]:
                    self.assertIn(s["k"], ("p", "v"))
                    self.assertIn(s["acc"], ("public", "customers", "unknown"))
                    self.assertIn(s["pos"], ("exact", "address", "area"))
                    self.assertTrue("off" in s or "osm" in s, s["id"])
                    self.assertNotIn("chk", s, "altes Feld")
                    if s["k"] == "p":
                        self.assertNotEqual(s["acc"], "unknown", s["id"])
                    if "off" not in s and s["k"] == "v":
                        self.assertNotEqual(s["acc"], "public", s["id"])

    def test_spots_lie_in_their_region(self):
        # Okinawa umfasst die ganze Präfektur bis Ishigaki und Yonaguni
        centers = {"tokyo": (35.68, 139.77, 1.0), "kamakura": (35.32, 139.55, 0.25), "kyoto": (35.0, 135.77, 0.3),
                   "okinawa": (25.5, 126.5, 2.5), "osaka": (34.69, 135.5, 0.3)}
        for region, (lat, lon, deg) in centers.items():
            for s in self.load(region)["spots"]:
                self.assertLess(abs(s["lat"] - lat), deg, (region, s["id"]))
                self.assertLess(abs(s["lon"] - lon), deg * 1.5, (region, s["id"]))

    def test_official_date_not_reported_as_osm_check(self):
        for region in bd.REGIONS:
            for s in self.load(region)["spots"]:
                if "off" in s and "osm" in s and "chk" in s["osm"] and "date" in s["off"]:
                    # beides darf vorkommen, muss aber getrennt bleiben
                    self.assertIsInstance(s["osm"]["chk"], str)


if __name__ == "__main__":
    unittest.main()
