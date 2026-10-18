#!/usr/bin/env python3
"""Build data/official/okinawa.json from official Okinawa sources saved in
data/raw/official/okinawa/.

1. Naha Airport (那覇空港ビルディング株式会社, terminal operator)
   https://www.naha-airport.co.jp/spend/map/  -> floormap_{1..4}f.png (+ legend 喫煙室)
   The floor maps are schematic images without coordinates. The smoking-room
   icons were located by hand (pixel positions in ICONS below, checked against
   zoomed crops). Pixels are converted to lat/lon with a piecewise-linear fit
   to OSM gate nodes (28, 38, 41, 43), so positions are rough (geo "map",
   geo_precision "area", roughly 30-60 m). The hint text (floor, area,
   before/after security) is the useful part.

2. Ocean Expo Park / Churaumi Aquarium (海洋博公園, 国営沖縄記念公園)
   https://kaiyohaku-gpsmap.net/ (official GPS park map linked from oki-park.jp)
   okipark/map1b.svg holds the map symbols as vector paths; the map is
   georeferenced (okipark/scmapset.js + scmap.svg: web-mercator metres,
   gx = R*lon - 1e7, gy = -R*ln(tan(pi/4+lat/2))). The smoking symbol is
   identified from the legend entry 喫煙所; every other instance of the same
   symbol is a smoking place. Coordinates are the symbol centre (geo "source",
   geo_precision "block": map symbols sit next to the actual spot).

Naha city: no official list of smoking places found (see unparsed).
Run: python3 -I scripts/build_okinawa_official.py
"""
import datetime, hashlib, json, math, re, sys

RAW = '/Users/habo/Projects/kitsuen/data/raw/official/okinawa'
OUT = '/Users/habo/Projects/kitsuen/data/official/okinawa.json'

spots = []


def page_has(path, *needles):
    t = re.sub(r'<[^>]+>', '', open(path, encoding='utf-8', errors='ignore').read())
    for n in needles:
        if n not in t:
            sys.exit(f'source changed? "{n}" not found in {path}')


def rec(id_, name, ward, lat, lon, geo, precision, address, hint, url, date, note=None,
        status='open', hours=None, heated_only=False):
    r = {'id': id_, 'name_ja': name, 'ward': ward, 'lat': round(lat, 6), 'lon': round(lon, 6),
         'geo': geo, 'address_ja': address, 'hint_ja': hint, 'hours': hours,
         'heated_only': heated_only, 'status': status, 'source_url': url, 'source_date': date,
         'geo_precision': precision}
    if note:
        r['note'] = note
    spots.append(r)


# ------------------------------------------------------------------ Naha Airport
AIR_URL = 'https://www.naha-airport.co.jp/spend/map/'
AIR_DATE = '2026-09-15'  # Last-Modified of floormap_2f.png
page_has(f'{RAW}/naha_airport_map.html', '喫煙室', '出発ロビー・搭乗待合室', 'チェックインロビー')
if 'floormap_1f.png' not in open(f'{RAW}/floor_map.js').read():
    sys.exit('floor_map.js changed')

# 2F-pixel control points along the terminal (x, y_airside_edge, lat, lon), OSM gate nodes
CTRL = [(345, 740, 26.205131, 127.650022),   # gate 28 (bus gate stairs, south pier)
        (1705, 740, 26.207926, 127.649714),  # gate 38 (north pier)
        (2580, 920, 26.209970, 127.650215),  # gate 41
        (3240, 920, 26.211036, 127.649999)]  # gate 43
M_PER_PX = 0.23  # from pier-to-pier distance
# per floor: other floors -> 2F pixel frame (x0, scale, facade_y)
FLOOR = {'1F': (164, 1.007, 700), '2F': (230, 1.0, 1170), '3F': (44, 0.928, 675)}


def to2f(floor, x, y):
    if floor == '4F':  # 4F is drawn at another scale; map via the two hall cores to 3F first
        x = 864 + (x - 956) * 0.929
        y = 675 + (y - 850) * 0.929
        floor = '3F'
    x0, s, fy = FLOOR[floor]
    return 230 + (x - x0) * s, 1170 + (y - fy) * s


def air_latlon(floor, x, y):
    X, Y = to2f(floor, x, y)
    for a, b in zip(CTRL, CTRL[1:]):
        if X <= b[0] or b is CTRL[-1]:
            break
    t = (X - a[0]) / (b[0] - a[0])
    lat = a[2] + t * (b[2] - a[2]); lon = a[3] + t * (b[3] - a[3]); y0 = a[1] + t * (b[1] - a[1])
    east = (Y - y0) * M_PER_PX
    return lat, lon + east / (111320 * math.cos(math.radians(lat)))


# (floor, x, y) in that floor's PNG pixels, name suffix, hint
ICONS = [
    ('2F', 370, 525, '国内線 26番ゲート付近', '2F 国内線搭乗待合室（保安検査後）、南側ピア 26番ゲート付近（JAL/JTA側）'),
    ('2F', 1733, 470, '国内線 36番ゲート付近', '2F 国内線搭乗待合室（保安検査後）、北側ピア 36番ゲート付近（ANA側）'),
    ('2F', 2135, 1000, '国内線 37番ゲート付近', '2F 国内線搭乗待合室（保安検査場C通過後）、37番ゲート・95-98番バスラウンジ入口付近'),
    ('2F', 595, 1155, '出発ロビー 保安検査場A付近', '2F 出発ロビー（保安検査前）、国内線保安検査場A付近の店舗列'),
    ('2F', 1393, 1155, '出発ロビー 保安検査場B付近', '2F 出発ロビー（保安検査前）、国内線保安検査場Bの北側'),
    ('2F', 2395, 1038, '出発ロビー ゆいにちストリート', '2F 出発ロビー（保安検査前）、ゆいにちストリート・ホテル受付付近（国内線/国際線の境）'),
    ('2F', 2670, 972, '国際線 41番ゲート付近', '2F 国際線搭乗待合室（保安検査・出国審査後）、41番ゲート付近'),
    ('2F', 3107, 977, '国際線 42・43番ゲート付近', '2F 国際線搭乗待合室（保安検査・出国審査後）、42番と43番ゲートの間'),
    ('1F', 638, 532, '国内線 手荷物受取所（A側）', '1F 国内線到着 手荷物受取所内（到着後・制限エリア、到着口A側）'),
    ('1F', 1118, 532, '国内線 手荷物受取所（B側）', '1F 国内線到着 手荷物受取所内（到着後・制限エリア、到着口B側）'),
    ('1F', 438, 725, '1F 到着ロビー前 屋外（南側）', '1F 国内線到着ロビー南端の建物前（屋外、タクシー乗り場付近）'),
    ('1F', 1258, 725, '1F 到着ロビー前 屋外（北側）', '1F 国内線到着口Bの北側、建物前（屋外、バス乗り場付近）'),
    ('1F', 1968, 612, '国内線 95-98番バスラウンジ', '1F 国内線 95-98番バスラウンジ内（保安検査後）'),
    ('1F', 2492, 666, '1F 国際線到着ロビー', '1F 国際線到着ロビー（保安検査前・一般エリア）、ビジターサービスセンターの南側'),
    ('1F', 3503, 535, '国際線 46-48番バスラウンジ', '1F 国際線 46-48番バスラウンジ内（保安検査・出国審査後）'),
    ('3F', 605, 425, '3F 国内線 見学者デッキ（南）出入口付近', '3F 国内線チェックインロビー（保安検査前）、南側の見学者デッキ出入口付近'),
    ('3F', 372, 662, '3F 国内線チェックインロビー南端', '3F 国内線チェックインロビー（保安検査前）、南端のトイレ横（JAL/JTA カウンター側）'),
    ('3F', 1130, 425, '3F 国内線 見学者デッキ（北）出入口付近', '3F 国内線チェックインロビー（保安検査前）、北側の見学者デッキ出入口付近'),
    ('3F', 1372, 662, '3F 国内線チェックインロビー北側', '3F 国内線チェックインロビー（保安検査前）、トイレ横（ANA カウンター側）'),
    ('3F', 2370, 532, '3F 国際線チェックインロビー', '3F 国際線チェックインロビー（保安検査前）、ふくぎホールのエスカレーター東側'),
    ('4F', 2687, 652, '4F 国際線側 ノースフードコート付近', '4F レストランフロア（国際線側、保安検査前）、ノースフードコート付近'),
]
for i, (fl, x, y, name, hint) in enumerate(ICONS, 1):
    lat, lon = air_latlon(fl, x, y)
    rec(f'okinawa-air-{i}', f'那覇空港 {"喫煙所" if "屋外" in name else "喫煙室"}（{name}）', 'Naha Airport', lat, lon, 'map', 'area',
        '沖縄県那覇市字鏡水150 那覇空港旅客ターミナルビル', hint, AIR_URL, AIR_DATE,
        note=f'Icon read off the official floor map floormap_{fl[0].lower()}f.png at px ({x},{y}); '
             'position fitted to OSM gate nodes, rough (~30-60 m).')

# ------------------------------------------------------------------ Ocean Expo Park
PARK_URL = 'https://kaiyohaku-gpsmap.net/'
PARK_DATE = '2026-02-14'  # Last-Modified of map1b.svg (?date=20260212)
P = f'{RAW}/okipark'
setjs = open(f'{P}/scmapset.js').read()
hx1 = float(re.search(r'hx1=(\d+)', setjs).group(1)); hy1 = float(re.search(r'hy1=(\d+)', setjs).group(1))
scm = open(f'{P}/scmap.svg', encoding='utf-8-sig').read()
m = re.search(r'id="bas1" x="(-?\d+)" y="(-?\d+)" width="(\d+)" height="(\d+)"', scm)
ix, iy, iw, ih = map(float, m.groups())
svg = open(f'{P}/map1b.svg', encoding='utf-8').read()
vw, vh = map(float, re.search(r'viewBox="0 0 (\d+) (\d+)"', svg).groups())
seg = svg[svg.index('地図 1: シンボル'):svg.index('地図 1: 装飾line')]
inst, cur = [], None
for mtx, body in re.findall(r'<g [^>]*transform="matrix\(([^)]*)\)"[^>]*?(?:/>|>(.*?)</g>)', seg, re.S):
    a, b, c, d, e, f = map(float, mtx.split(','))
    ds = re.findall(r'\sd="([^"]*)"', body or '')
    if not ds:
        continue
    key = (round(a, 5), round(e, 2), round(f, 2))
    if cur is None or cur['key'] != key:
        cur = {'key': key, 'ds': [], 'm': (a, d, e, f)}; inst.append(cur)
    cur['ds'].extend(ds)
syms = []
for s in inst:
    a, d, e, f = s['m']
    pts = [tuple(map(float, p)) for dd in s['ds'] for p in re.findall(r'(-?[\d.]+),(-?[\d.]+)', dd)]
    xs = [a * x + e for x, _ in pts]; ys = [d * y + f for _, y in pts]
    syms.append((hashlib.md5('|'.join(s['ds']).encode()).hexdigest(), (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2))
# legend: the 喫煙所 symbol is the first entry of the second legend column (svg ~1038, 2238)
legend = [s for s in syms if abs(s[1] - 1038) < 15 and abs(s[2] - 2238) < 15]
if len(legend) != 1:
    sys.exit('legend symbol not found')
SMOKE = legend[0][0]
found = [s for s in syms if s[0] == SMOKE and s is not legend[0]]

PARK_HINT = [  # (svg x, y) of the symbol -> name, hint (labels read from the rendered map)
    ((1487, 3283), '熱帯・亜熱帯都市緑化植物園 入口付近', '植物園入口案内所の北、P1駐車場の西側'),
    ((440, 2142), '熱帯ドリームセンター入口付近', '熱帯ドリームセンター入口（GPSスタンプラリー地点）の南西'),
    ((758, 1316), '沖縄美ら海水族館 南側', '美ら海水族館の南側出入口付近、ちびっことりでの西'),
    ((706, 921), '美ら海プラザ 北側', '美ら海プラザ（総合休憩所）の北側、亀の浜方面'),
    ((816, 431), 'エメラルドビーチ 北側', 'エメラルドビーチ北側の休憩所・トイレ棟の横'),
    ((938, 1666), '中央ゲート付近', '中央ゲート広場の北、P5駐車場の南西'),
    ((700, 1744), '海洋文化館 北側', '海洋文化館の北側（噴水広場側）'),
    ((821, 1506), 'ハイサイプラザ 東側', 'ハイサイプラザ（総合案内所）の東側'),
    ((922, 1860), 'P4駐車場 トイレ横', 'P4駐車場内のトイレ横'),
    ((1079, 3208), '熱帯・亜熱帯都市緑化植物園 北西側', '植物園北西側のトイレ横'),
    ((442, 1459), 'オキちゃん劇場 南側', 'オキちゃん劇場の南側、園路沿い'),
]
if len(found) != len(PARK_HINT):
    sys.exit(f'park: expected {len(PARK_HINT)} smoking symbols, found {len(found)}')
R = 6378137.0
for i, ((hx, hy), name, hint) in enumerate(PARK_HINT, 1):
    s = min(found, key=lambda s: (s[1] - hx) ** 2 + (s[2] - hy) ** 2)
    if (s[1] - hx) ** 2 + (s[2] - hy) ** 2 > 25:
        sys.exit(f'park symbol near {hx},{hy} moved')
    gx = ix + s[1] * iw / vw; gy = iy + s[2] * ih / vh
    lon = math.degrees((gx + 1e7) / R)
    lat = math.degrees(2 * math.atan(math.exp(-gy / R)) - math.pi / 2)
    rec(f'okinawa-park-{i}', f'海洋博公園 喫煙所（{name}）', 'Motobu', lat, lon, 'source', 'block',
        '沖縄県国頭郡本部町字石川424 海洋博公園', hint, PARK_URL, PARK_DATE,
        note='Symbol centre on the official georeferenced park map (map symbols are offset a few metres).')

unparsed = [
    {'ward': 'Naha', 'url': 'https://www.info.city.naha.okinawa.jp/kanko/010509.html',
     'note': 'Naha has no official list of public smoking places. 那覇市路上喫煙防止条例 (2007): street smoking banned on '
             'Kokusai-dori and Okiei-dori (plus City Hall front and the Kencho-mae station approach, ~2.5 km); '
             'patrols, guidance -> written recommendation -> order -> 2,000 yen 過料 (enforced since April 2009, QAB 2009-03-27). '
             'Elsewhere only a duty to try not to smoke while walking.'},
    {'ward': 'Naha', 'url': 'https://www.info.city.naha.okinawa.jp/kenko/011328.html',
     'note': 'City answer (2024): outdoor places incl. Yui Rail station surroundings are not covered by smoking bans; '
             'Yui Rail stations themselves publish no smoking places.'},
    {'ward': 'Chatan / Onna', 'url': None,
     'note': 'No official smoking-place data found for Chatan (American Village) or Onna; no Okinawa Prefecture open data on smoking places.'},
    {'ward': 'Okinawa', 'url': 'http://www.clubjt.jp/?state=/map',
     'note': 'JT "喫煙所MAP" (CLUB JT) covers private places; commercial site, not used.'},
]

out = {'generated': datetime.date.today().isoformat(), 'spots': spots, 'unparsed': unparsed}
json.dump(out, open(OUT, 'w'), ensure_ascii=False, indent=1)
print('total', len(spots), {g: sum(s['geo'] == g for s in spots) for g in ('source', 'address', 'map')})
