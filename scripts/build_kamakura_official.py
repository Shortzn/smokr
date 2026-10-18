#!/usr/bin/env python3
"""Build data/official/kamakura.json from official Kamakura / Fujisawa sources
saved in data/raw/official/kamakura/ and data/raw/official/fujisawa/.

The sources are small (one HTML page plus image-only PDF maps without
coordinates), so the entries are written out by hand here and checked against
the saved files. Coordinates:
  - "address": GSI geocoding of the address given in the source
  - "osm":     the official text describes a spot that OSM maps as a
               dedicated smoking building at the same place (way 1378886987)
  - "map":     read off the official PDF map relative to OSM station /
               landmark nodes (rough, geo_precision "area")

Run: python3 -I scripts/build_kamakura_official.py
"""
import datetime, json, re, sys
sys.path.insert(0, '/Users/habo/Projects/smokr/scripts')
from gsi_geocode import geocode

RAW = '/Users/habo/Projects/smokr/data/raw/official'
OUT = '/Users/habo/Projects/smokr/data/official/kamakura.json'

KAMA_URL = 'https://www.city.kamakura.kanagawa.jp/kan-hozen/smoking_area.html'
KAMA_DATE = '2026-10-05'  # 更新日 on the page
AIZA_PDF = 'https://www.city.kamakura.kanagawa.jp/kan-hozen/documents/kamakura_direction-to-the-smoking-area.pdf'
FUJI_URL = 'https://www.city.fujisawa.kanagawa.jp/kankyou-s/machizukuri/kankyo/bika/jore.html'
FUJI_PDF = 'https://www.city.fujisawa.kanagawa.jp/documents/11379/fujisawakitsuenjo1.pdf'
FUJI_DATE = '2026-09-07'  # 更新日 on the page

spots = []


def page_has(path, *needles):
    t = open(path, encoding='utf-8', errors='ignore').read()
    t = re.sub(r'<[^>]+>', '', t)
    for n in needles:
        if n not in t:
            sys.exit(f'source changed? "{n}" not found in {path}')


def rec(id_, name, ward, address, hint, hours, status, url, date, heated_only=False,
        lat=None, lon=None, geo=None, precision=None, note=None):
    r = {'id': id_, 'name_ja': name, 'ward': ward, 'lat': lat, 'lon': lon, 'geo': geo,
         'address_ja': address, 'hint_ja': hint, 'hours': hours,
         'heated_only': heated_only, 'status': status,
         'source_url': url, 'source_date': date}
    if lat is None and address and status != 'closed':
        g = geocode(re.split(r'[ 　]', address)[0])
        if g:
            exact = bool(re.search(r'[0-9０-９]+(番|号)', g[2] or ''))
            r.update(lat=round(g[0], 6), lon=round(g[1], 6), geo='address', geo_match=g[2],
                     geo_precision='block' if exact else 'area')
    elif lat is not None and precision:
        r['geo_precision'] = precision
    if note:
        r['note'] = note
    spots.append(r)


# ---------------------------------------------------------------- Kamakura city
page_has(f'{RAW}/kamakura/smoking_area.html', 'アイザ鎌倉3階喫煙所', '大船駅東口歩道橋下（屋内型喫煙所）',
         '大船駅東口2階ペデストリアンデッキ', '大船駅西口の喫煙所は、令和4年度に解体撤去しました')

rec('kamakura-1', 'THE TOBACCO KAMAKURA（アイザ鎌倉3階喫煙所）', 'Kamakura',
    '神奈川県鎌倉市小町一丁目6-15 アイザ鎌倉3F',
    '鎌倉駅東口から徒歩約2分。小町通りの鳥居をくぐり約15m、左手のアイザ鎌倉ビルに入り、ウッドデッキ広場手前の右手の階段で3階へ。屋内・分煙施設（市の補助金で設置、民間運営）',
    '9:00~17:00', 'open', KAMA_URL, KAMA_DATE,
    note=f'Hours and address from the city PDF {AIZA_PDF}')

# Indoor smoking room under the east-exit footbridge. OSM maps a building
# named 喫煙所 (smoking=dedicated) exactly there; GSI only resolves 大船一丁目 (~75 m off).
rec('kamakura-2', '大船駅東口歩道橋下 喫煙所（屋内型）', 'Kamakura',
    '神奈川県鎌倉市大船一丁目',
    '大船駅東口の歩道橋下。湘南モノレール大船駅改札口からまっすぐ進み、ファミリーマート側の階段を降りたところ',
    None, 'open', KAMA_URL, KAMA_DATE,
    lat=35.352811, lon=139.531917, geo='osm', precision='block',
    note='Position from OSM way 1378886987 (building 喫煙所) which matches the official description; source gives no address.')

rec('kamakura-3', '大船駅東口2階ペデストリアンデッキ 喫煙所（屋外型）', 'Kamakura',
    '神奈川県鎌倉市大船一丁目',
    '大船駅東口ペデストリアンデッキ2階。湘南モノレール大船駅改札口の裏の広場、一番奥',
    None, 'open', KAMA_URL, KAMA_DATE,
    note='Source gives no address; geocoded to the 大船一丁目 area only.')

rec('kamakura-4', '大船駅西口 喫煙所', 'Kamakura', None,
    '大船駅西口', None, 'closed', KAMA_URL, KAMA_DATE,
    note='令和4年度（FY2022）に解体撤去 per city page.')

rec('kamakura-5', '鎌倉駅西口 時計台広場 喫煙所', 'Kamakura', None,
    '鎌倉駅西口広場の時計台奥', None, 'closed',
    'https://www.city.kamakura.kanagawa.jp/soudan/joho/documents/29-161.pdf', '2017',
    note='Removed September 2019 during redevelopment of the west-exit plaza (Town News Kamakura 2023-02-17); '
         'not listed on the current city page.')

# ---------------------------------------------------------------- Fujisawa (Enoden terminus)
page_has(f'{RAW}/fujisawa/jore.html', '藤沢駅北口喫煙所の再整備', '紙巻きたばこ', '加熱式たばこ')
# fujisawakitsuenjo1.pdf is a map with two icons: 藤沢駅北口喫煙所 (SE of ビックカメラ,
# at the north edge of the station) and 藤沢駅南口喫煙所 (south exit plaza, east of the
# central passage). Positions read off the map relative to OSM nodes
# ビックカメラ 2684570950 (35.339533,139.488309) and JR 藤沢 4011607028 (35.338819,139.487215).
rec('fujisawa-1', '藤沢駅北口喫煙所', 'Fujisawa', '神奈川県藤沢市藤沢',
    '藤沢駅北口、ビックカメラ付近（公式地図による）。紙巻きたばこエリアと加熱式たばこエリアに分かれている（加熱式エリアでは紙巻き不可）。2026年2月24日に再整備後供用開始',
    None, 'open', FUJI_URL, FUJI_DATE,
    lat=35.3393, lon=139.4881, geo='map', precision='area',
    note=f'Position read off the official map {FUJI_PDF}; rough (~50 m).')
rec('fujisawa-2', '藤沢駅南口喫煙所', 'Fujisawa', '神奈川県藤沢市南藤沢',
    '藤沢駅南口（公式地図による）', None, 'open', FUJI_PDF, FUJI_DATE,
    lat=35.3382, lon=139.4878, geo='map', precision='area',
    note='Position read off the official map; rough (~50 m).')

unparsed = [
    {'ward': 'Kamakura', 'url': 'https://www.city.kamakura.kanagawa.jp/kan-hozen/rojokinennotorikumi.html',
     'note': 'Ban zones (路上喫煙禁止区域) only around Kamakura and Ofuna stations; fine 2,000 yen after warning/order. '
             'Zone maps kamakura.pdf / oofuna.pdf are images; saved, not vectorised.'},
    {'ward': 'Fujisawa', 'url': FUJI_URL,
     'note': 'All station surroundings in Fujisawa are ban zones (incl. 片瀬江ノ島, 江ノ島 (Enoden), 湘南江の島). '
             'The zone maps for those stations show no designated smoking place. Only Fujisawa station has two.'},
    {'ward': 'Kamakura', 'url': 'http://www.clubjt.jp/?state=/map',
     'note': 'City links JT "喫煙所MAP" (CLUB JT, incl. private places). Not used: commercial site, no open data licence.'},
]

out = {'generated': datetime.date.today().isoformat(), 'spots': spots, 'unparsed': unparsed}
json.dump(out, open(OUT, 'w'), ensure_ascii=False, indent=1)
print('total', len(spots), {g: sum(s['geo'] == g for s in spots) for g in ('source', 'address', 'osm', 'map', None)},
      'closed', sum(s['status'] == 'closed' for s in spots))
