#!/usr/bin/env python3
"""Build data/official/kyoto.json from the City of Kyoto list of public smoking
places (京都市公設喫煙場所), saved in data/raw/official/kyoto/:

  0000027498.html  https://www.city.kyoto.lg.jp/bunshi/page/0000027498.html
                   (section headings + one photo per place, each photo links to the
                   city facility map with lat/lng/id)
  info/<id>.html   https://map.city.kyoto.lg.jp/ajax/more_info.php?id=<id>
                   (official facility-map detail: 施設名, 所在地)
  img/             the photos; captions were read by hand (CAPTION below)

Coordinates come from the source (geo = "source").
Run: python3 -I scripts/build_kyoto_official.py
"""
import datetime, html, json, re, sys, unicodedata

RAW = '/Users/habo/Projects/kitsuen/data/raw/official/kyoto'
OUT = '/Users/habo/Projects/kitsuen/data/official/kyoto.json'
URL = 'https://www.city.kyoto.lg.jp/bunshi/page/0000027498.html'
MAPURL = 'https://map.city.kyoto.lg.jp/?lat={lat}&lng={lon}&id={id}&zoom=17'

WARDS = {'下京区': 'Kyoto Shimogyo', '中京区': 'Kyoto Nakagyo', '東山区': 'Kyoto Higashiyama',
         '山科区': 'Kyoto Yamashina', '南区': 'Kyoto Minami', '伏見区': 'Kyoto Fushimi',
         '上京区': 'Kyoto Kamigyo', '左京区': 'Kyoto Sakyo', '右京区': 'Kyoto Ukyo',
         '北区': 'Kyoto Kita', '西京区': 'Kyoto Nishikyo'}

# Location hints printed on the photos (read by hand from img/).
CAPTION = {
    '006nishikiyamachi-2808.gif': '西木屋町四条上る',
    '004higasisiouzi.gif': '西洞院通塩小路下ル',
    'kyotost.hachizyohigasi2.jpg': '八条東口 東側エレベーター裏',
    '003kyotoeki.gif': '京都駅バスターミナル東',
    '006kitahiroTPe-2904.gif': 'タクシープール東',
    '006kiyomizu1.gif': '清水坂観光駐車場 休憩所内',
    'kiyomizu2014.jpg': '清水坂観光駐車場 北側緑地帯内',
}
AREA_JA = {'市内中心部': '市内中心部', '京都駅地域': '京都駅地域',
           '清水・祇園地域': '清水・祇園地域'}


def clean(s):
    s = html.unescape(re.sub(r'<[^>]+>', '', s)).replace('\xa0', ' ')
    return re.sub(r'[ \t　\n]+', ' ', s).strip()


t = open(f'{RAW}/0000027498.html', encoding='utf-8').read()
date = re.search(r'ページ番号27498.*?(\d{4})年(\d{1,2})月(\d{1,2})日', clean(t))
source_date = f'{date.group(1)}-{int(date.group(2)):02d}-{int(date.group(3)):02d}'
i, j = t.index('京都市公設喫煙場所(Kyoto'), t.index('路上喫煙等対策強化区域(過料')
body = t[i:j]

items, section = [], None
for m in re.finditer(r'<h3>(.*?)</h3>|href="https://map\.city\.kyoto\.lg\.jp/\?lat=([\d.]+)&amp;lng=([\d.]+)&amp;id=(\d+)[^"]*"><img[^>]*src="[^"]*/([^/"]+)"'
                     r'|<p>(※[^<]*)</p>', body):
    if m.group(1):
        section = clean(m.group(1))
    elif m.group(2):
        items.append({'section': section, 'lat': float(m.group(2)), 'lon': float(m.group(3)),
                      'fid': m.group(4), 'img': m.group(5), 'notes': []})
    elif m.group(6) and items:
        items[-1]['notes'].append(clean(m.group(6)))

spots, seen = [], {}
for n, it in enumerate(items, 1):
    info = open(f'{RAW}/info/{it["fid"]}.html', encoding='utf-8').read()
    name = clean(re.search(r'<dt>施設名:</dt>\s*<dd>(.*?)</dd>', info, re.S).group(1))
    addr = clean(re.search(r'<dt>所在地:</dt>\s*<dd>(.*?)</dd>', info, re.S).group(1))
    addr = unicodedata.normalize('NFKC', addr).replace('−', '-')
    ward_ja = re.search(r'京都市(.+?区)', addr).group(1)
    sec_ja = re.sub(r'\(.*\)$', '', it['section'] or '')
    hint = [h for h in (CAPTION.get(it['img']), AREA_JA.get(sec_ja)) if h]
    lat, lon, note, precision = round(it['lat'], 6), round(it['lon'], 6), None, None
    # Nishioji: two photos (北側 / 南側) link to the same map point (南側, id 1000001781).
    if it['img'] == 'nisioojikitagawa.png':
        name = 'JR西大路駅北側喫煙場所'
        hint = ['北側改札口前（2階）']
        precision = 'area'
        note = ('Photo "JR西大路駅北側" with note ※北側改札口前（2階）; the city page links it to the same '
                'map point as the south-side place, so the position is only the station area.')
    elif it['fid'] in seen:
        note = 'Same facility-map point as ' + seen[it['fid']]
    rid = f'kyoto-{n}'
    if it['img'] != 'nisioojikitagawa.png':
        seen.setdefault(it['fid'], rid)
    rec = {'id': rid, 'name_ja': name, 'ward': WARDS.get(ward_ja, 'Kyoto'),
           'lat': lat, 'lon': lon, 'geo': 'source', 'address_ja': addr,
           'hint_ja': ' / '.join(hint) or None, 'hours': None,
           'heated_only': '加熱式' in name and '専用' in name, 'status': 'open',
           'source_url': URL, 'source_date': source_date,
           'map_url': MAPURL.format(lat=it['lat'], lon=it['lon'], id=it['fid'])}
    if precision:
        rec['geo_precision'] = precision
    if note:
        rec['note'] = note
    spots.append(rec)

unparsed = [
    {'ward': 'Kyoto', 'url': URL,
     'note': 'Ban zones with 1,000 yen fine (路上喫煙等対策強化区域) are given only as images: downtown '
             '(Oike-Shijo x Karasuma-Kawaramachi/Kiyamachi incl. Sanjo/Shijo bridges), Kyoto Station area, '
             'Kiyomizu/Gion (Shijo-Higashioji-Kiyomizuzaka-Ninenzaka-Nene-no-michi-Kodaiji). Saved in img/, not vectorised.'},
    {'ward': 'Kyoto', 'url': 'https://www.kyoto-station-building.co.jp/',
     'note': 'Smoking rooms inside Kyoto Station building / Shinkansen gates are not on the city list; '
             'no official operator list found in the time box.'},
    {'ward': 'Kyoto', 'url': 'https://www.clubjt.jp/',
     'note': 'JT CLUB JT smoking-place map not used: commercial site, no open data licence.'},
]

out = {'generated': datetime.date.today().isoformat(), 'spots': spots, 'unparsed': unparsed}
json.dump(out, open(OUT, 'w'), ensure_ascii=False, indent=1)
print('total', len(spots), 'source', sum(s['geo'] == 'source' for s in spots))
for s in spots:
    print(s['id'], s['ward'], s['name_ja'], s['hint_ja'], s['lat'], s['lon'])
