#!/usr/bin/env python3
"""Build data/official/osaka.json from the City of Osaka list of smoking places
(大阪市内の喫煙可能な場所について), saved in data/raw/official/osaka/:

  page_0000607135.html  https://www.city.osaka.lg.jp/kankyo/page/0000607135.html
                        24 ward sections, each with
                        - 大阪市指定喫煙所: free, open to everyone (city or private operator)
                        - 情報提供喫煙所: smoking rooms in shops / facilities, as a rule
                          only for customers (purchase needed)
                        Every address links to the city map system マップナビおおさか
                        (mapnavi.city.osaka.lg.jp, layer mid=9902) with mpx/mpy = lon/lat.

Coordinates come from those map links (geo "source"). Text licence: CC BY 4.0
(City of Osaka). Hours are normalised for the common "every day" patterns,
otherwise kept as written.
Run: python3 -I scripts/build_osaka_official.py
"""
import datetime, html, json, re, sys

RAW = '/Users/habo/Projects/kitsuen/data/raw/official/osaka'
OUT = '/Users/habo/Projects/kitsuen/data/official/osaka.json'
URL = 'https://www.city.osaka.lg.jp/kankyo/page/0000607135.html'

WARDS = {'北区': 'Kita', '都島区': 'Miyakojima', '福島区': 'Fukushima', '此花区': 'Konohana',
         '中央区': 'Chuo', '西区': 'Nishi', '港区': 'Minato', '大正区': 'Taisho',
         '天王寺区': 'Tennoji', '浪速区': 'Naniwa', '西淀川区': 'Nishiyodogawa',
         '淀川区': 'Yodogawa', '東淀川区': 'Higashiyodogawa', '東成区': 'Higashinari',
         '生野区': 'Ikuno', '旭区': 'Asahi', '城東区': 'Joto', '鶴見区': 'Tsurumi',
         '阿倍野区': 'Abeno', '住之江区': 'Suminoe', '住吉区': 'Sumiyoshi',
         '東住吉区': 'Higashisumiyoshi', '平野区': 'Hirano', '西成区': 'Nishinari'}


def clean(s):
    s = html.unescape(re.sub(r'<[^>]+>', '', s)).replace('\xa0', ' ')
    return re.sub(r'[ \t　\n]+', ' ', s).strip()


def hours_of(s):
    s = s.strip()
    m = re.fullmatch(r'月曜日から日曜日（祝日含む）の終日', s)
    if m:
        return '終日'
    m = re.fullmatch(r'月曜日から日曜日（祝日含む）の\s*(\d+)時(?:(\d+)分)?から(\d+)時(?:(\d+)分)?まで', s)
    if m:
        h1, m1, h2, m2 = m.groups()
        return f'{int(h1)}:{int(m1 or 0):02d}~{int(h2)}:{int(m2 or 0):02d}'
    return s


t = open(f'{RAW}/page_0000607135.html', encoding='utf-8').read()
d = re.search(r'ページ番号：607135', clean(t)) and re.search(r'(\d{4})年(\d{1,2})月(\d{1,2})日\s*ページ番号：607135', clean(t))
if not d:
    sys.exit('date / page number not found')
source_date = f'{d.group(1)}-{int(d.group(2)):02d}-{int(d.group(3)):02d}'
body = t[t.index('<h2>北区内の喫煙所</h2>'):]
body = body[:body.index('探している情報が見つからない')] if '探している情報が見つからない' in body else body

spots, ward, kind, n = [], None, None, 0
pat = re.compile(r'<h2>(.*?)</h2>|<h3>(.*?)</h3>|<ul class="ul_type01">(.*?)</ul>(.*?)(?=<ul class="ul_type01">|<h2>|<h3>|<div class="sub_h)', re.S)
for m in pat.finditer(body):
    if m.group(1):
        w = clean(m.group(1)).replace('内の喫煙所', '')
        ward = WARDS.get(w)
        if not ward:
            sys.exit(f'unknown ward heading {w}')
        continue
    if m.group(2):
        h3 = clean(m.group(2))
        kind = 'designated' if h3.startswith('大阪市指定喫煙所') else 'info' if h3.startswith('情報提供喫煙所') else None
        if not kind:
            sys.exit(f'unknown section {h3}')
        continue
    name = clean(m.group(3))
    p = m.group(4)
    if '所在地' not in p:
        if name:
            sys.exit(f'no address block for {name}')
        continue  # empty list item in the source
    lines = [x for x in re.split(r'<br\s*/?>|</?p>', p)]
    cond, addr, extra, area, hours, form, notes = None, None, '', None, None, None, []
    lat = lon = None
    map_url = None
    for ln in lines:
        c = clean(ln)
        if not c:
            continue
        if c.startswith('利用条件：'):
            cond = c[5:]
        elif c.startswith('所在地：') or '所在地：' in c[:8]:
            a = re.search(r'<a href="([^"]*mapnavi[^"]*)"[^>]*>(.*?)</a>(.*)', ln, re.S)
            if a:
                map_url = html.unescape(a.group(1))
                addr = clean(a.group(2)); extra = clean(a.group(3))
                q = re.search(r'mpx=([\d.]+)&mpy=([\d.]+)', map_url)
                if q:
                    lon, lat = float(q.group(1)), float(q.group(2))
            else:
                addr = clean(c.split('所在地：', 1)[1])
        elif re.match(r'面積(等)?：', c):
            area = c.split('：', 1)[1]
        elif c.startswith('供用時間：'):
            hours = c[5:]
        elif '喫煙所形態：' in c:
            pre, form = c.split('喫煙所形態：', 1)
            if pre.strip():
                notes.append(pre.strip())
        elif c.startswith('※'):
            notes.append(c)
        elif addr and not area:  # continuation of the address line (building / floor)
            extra = (extra + ' ' + c).strip()
        else:
            notes.append(c)
    if addr is None:
        sys.exit(f'no address for {name}')
    n += 1
    heated = bool(cond and '加熱式専用' in cond) or '加熱式たばこ専用' in (area or '')
    hint = []
    if kind == 'info':
        hint.append('情報提供喫煙所：' + (cond or '店舗・施設の利用者向け'))
    else:
        hint.append('大阪市指定喫煙所（無料・誰でも利用可）')
    if extra:
        hint.append(extra.strip('　 '))
    if form:
        hint.append(form)
    if area:
        hint.append('面積 ' + area)
    hint += notes
    r = {'id': f'osaka-{n}', 'name_ja': name, 'ward': f'Osaka {ward}', 'lat': lat and round(lat, 6),
         'lon': lon and round(lon, 6), 'geo': 'source' if lat else None,
         'address_ja': addr if addr.startswith('大阪市') else f'大阪市{[k for k, v in WARDS.items() if v == ward][0]} {addr}',
         'hint_ja': ' / '.join(hint), 'hours': hours_of(hours) if hours else None,
         'heated_only': heated, 'status': 'open', 'source_url': URL, 'source_date': source_date,
         'access': 'public' if kind == 'designated' or (cond and '店舗利用者' not in cond) else 'customers'}
    if map_url:
        r['map_url'] = map_url
        if 'uid=' not in map_url:
            r['note'] = 'Map link has no feature id; coordinates are the map centre of the link.'
    spots.append(r)

if len(spots) < 400:
    sys.exit(f'only {len(spots)} entries parsed - page changed?')

unparsed = [
    {'ward': 'Osaka', 'url': 'https://www.city.osaka.lg.jp/kankyo/page/0000503379.html',
     'note': 'Street smoking banned citywide since 2025-01-27 on all city-managed roads, plazas, parks and other public places '
             '(1号区域) plus the national highways in the city (2号区域); heated tobacco included; 1,000 yen 過料 collected on the spot. '
             'Private land / shop premises are not covered (shops may keep outdoor ashtrays on their own land, page 0000630108).'},
    {'ward': 'Osaka', 'url': 'https://www.mapnavi.city.osaka.lg.jp/osakacity/MAP?API=1&mid=9902',
     'note': 'The same places are on the city map system マップナビおおさか (layer mid=9902); coordinates were taken from the per-entry links, '
             'the map service itself was not queried.'},
    {'ward': 'Osaka', 'url': 'http://www.clubjt.jp/?state=/map',
     'note': 'JT "喫煙所MAP" (CLUB JT) also lists private places; commercial site, not used.'},
]

out = {'generated': datetime.date.today().isoformat(), 'spots': spots, 'unparsed': unparsed}
json.dump(out, open(OUT, 'w'), ensure_ascii=False, indent=1)
print('total', len(spots), 'designated', sum('大阪市指定喫煙所' in s['hint_ja'] for s in spots),
      'info', sum(s['hint_ja'].startswith('情報提供') for s in spots), 'customers_only', sum(s['access'] == 'customers' for s in spots),
      'source', sum(s['geo'] == 'source' for s in spots), 'nocoord', sum(s['lat'] is None for s in spots),
      'heated_only', sum(s['heated_only'] for s in spots), 'date', source_date)
