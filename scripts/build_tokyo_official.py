#!/usr/bin/env python3
"""Build data/official/tokyo.json from saved official ward sources in
data/raw/official/. Coordinates come from the source where available
(Taito CSV, Chuo map CSV, Minato facility pages, Koto CSV); otherwise
addresses are geocoded with the GSI address API (geo = "address").

Run: python3 -I scripts/build_tokyo_official.py
"""
import csv, html, io, json, re, sys, unicodedata, datetime, difflib
sys.path.insert(0, '/Users/habo/Projects/smokr/scripts')
from gsi_geocode import geocode

RAW = '/Users/habo/Projects/smokr/data/raw/official'
OUT = '/Users/habo/Projects/smokr/data/official/tokyo.json'

spots, unparsed = [], []


def nfkc(s):
    return unicodedata.normalize('NFKC', s or '').strip()


def norm_name(s):
    s = nfkc(s)
    s = re.sub(r'（[^）]*指定喫煙場所）', '', s)
    s = re.sub(r'\((区営|民間)指定喫煙場所\)', '', s)
    s = s.replace('指定喫煙場所', '').replace('高島屋', '髙島屋')
    s = s.replace('①', '(1)').replace('②', '(2)').replace('③', '(3)').replace('④', '(4)').replace('⑤', '(5)')
    return re.sub(r'[\s　・~～「」()（）]', '', s).lower()


def lines_of(fragment):
    fragment = re.sub(r'<br\s*/?>', '\n', fragment)
    fragment = re.sub(r'</(p|li|div|td|th|tr|h\d)>', '\n', fragment)
    txt = html.unescape(re.sub(r'<[^>]+>', '', fragment))
    return [re.sub(r'[ \t　]+', ' ', l).strip() for l in txt.split('\n') if l.strip()]


def strip_addr(a):
    """Address -> geocodable string (drop building / 先 / floor)."""
    a = nfkc(a)
    a = re.sub(r'^(東京都)?', '', a)
    a = re.split(r'[ 　(（]', a)[0]
    a = a.replace('番地先', '番地').replace('番先', '番').replace('先', '')
    return a


KANJI = {'一': '1', '二': '2', '三': '3', '四': '4', '五': '5', '六': '6', '七': '7', '八': '8', '九': '9'}


def addr_key(a):
    """('芝', (5, 33)) style key: town name + first two numbers, for matching."""
    a = nfkc(a or '')
    a = re.sub(r'^(東京都)?(港区|中央区)?', '', a)
    a = re.sub(r'([一二三四五六七八九])丁目', lambda m: KANJI[m.group(1)] + '丁目', a)
    m = re.match(r'^([^\d]+?)(\d+)', a)
    if not m:
        return None
    nums = re.findall(r'\d+', a)[:2]
    return (m.group(1).replace('丁目', ''), tuple(nums))


def geo_addr(ward_ja, addr):
    a = strip_addr(addr)
    if not a.startswith(ward_ja):
        a = ward_ja + a
    cands = ['東京都' + a]
    a2 = re.sub(r'([一二三四五六七八九])丁目', lambda m: KANJI[m.group(1)] + '丁目', a)
    if a2 != a:
        cands.append('東京都' + a2)
    m = re.match(r'^(.*?\d+丁目\d+)', a2)
    if m:
        cands.append('東京都' + m.group(1).replace('丁目', '-'))
    m2 = re.match(r'^(.*?丁目)', a)
    if m2:
        cands.append('東京都' + m2.group(1))
    for q in cands:
        r = geocode(q)
        if r:
            exact = bool(re.search(r'[0-9０-９]+(番|号)', r[2] or ''))
            return {'lat': round(r[0], 6), 'lon': round(r[1], 6), 'geo_match': r[2],
                    'geo_precision': 'block' if exact else 'area'}
    return None


def heated(text):
    t = nfkc(text)
    if re.search(r'加熱式(たばこ)?専用エリアあり|紙巻き?専用', t):
        return False
    return bool(re.search(r'加熱式(たばこ)?専用', t))


CLOSED_RE = re.compile(r'休止中|一時休止します|当分の間\s*利用不可|閉鎖中|工事中')


def add(ward, ward_ja, n, name, address, hint, hours, status, url, date,
        lat=None, lon=None, extra_text=''):
    rec = {
        'id': f'{ward.lower()}-{n}', 'name_ja': name.strip(), 'ward': ward,
        'lat': lat, 'lon': lon, 'geo': 'source' if lat is not None else 'address',
        'address_ja': ('東京都' + ward_ja + strip_ward(nfkc(address), ward_ja)) if address else None,
        'hint_ja': hint or None, 'hours': hours or None,
        'heated_only': heated(name + ' ' + (extra_text or '')),
        'status': status, 'source_url': url, 'source_date': date,
    }
    if lat is None:
        g = geo_addr(ward_ja, address) if address else None
        if g:
            rec['lat'], rec['lon'], rec['geo_match'] = g['lat'], g['lon'], g['geo_match']
            rec['geo_precision'] = g['geo_precision']
        else:
            rec['geo'] = None
    spots.append(rec)


def strip_ward(a, ward_ja):
    a = re.sub(r'^東京都', '', a)
    return a[len(ward_ja):] if a.startswith(ward_ja) else a


# ---------------------------------------------------------------- Taito
def taito():
    url = 'https://www.city.taito.lg.jp/kusei/online/opendata/seikatu/shisethutizujouhou.files/20260818_koshukitsuenjo.csv'
    raw = open(f'{RAW}/taito_20260818_koshukitsuenjo.csv', 'rb').read().decode('utf-8-sig')
    for i, r in enumerate(csv.DictReader(io.StringIO(raw)), 1):
        s, e = r['利用開始時間'], r['利用終了時間']
        hours = '終日' if '終日' in s else f'{s}-{e}'
        note = r['特記事項'].replace('\n', ' ').strip()
        if note:
            hours += '（' + note + '）'
        name = r['名称'].strip()
        add('Taito', '台東区', i, name, r['設置位置'].strip(), nfkc(r['方書']) or None, hours,
            'open', url, '2026-08-18', float(r['緯度']), float(r['経度']), note)


# ---------------------------------------------------------------- Koto (bonus, catalog CSV)
def koto():
    n = 0
    for f, src in [('koto_station.csv', 'https://www.opendata.metro.tokyo.lg.jp/koto/131083_237_public_smoking_area_station.csv'),
                   ('koto_park.csv', 'https://www.opendata.metro.tokyo.lg.jp/koto/131083_237_public_smoking_area_park.csv')]:
        b = open(f'{RAW}/{f}', 'rb').read()
        try:
            txt = b.decode('utf-8-sig')
        except UnicodeDecodeError:
            txt = b.decode('cp932')
        for r in csv.DictReader(io.StringIO(txt)):
            n += 1
            add('Koto', '江東区', n, r['喫煙所名'], None, r.get('場所') or None, None, 'unknown',
                src, None, float(r['緯度']), float(r['経度']))


# ---------------------------------------------------------------- Chuo
def chuo():
    url = 'https://www.city.chuo.lg.jp/a0030/kenkouiryou/kenkou/tobacco/kitsuenbasho/kitsuenichiran.html'
    # coordinates from the ward's facility-map CSV (category 13007003000 = 指定喫煙場所)
    coords = []
    for r in csv.DictReader(open(f'{RAW}/chuo_map_data.csv', encoding='utf-8-sig')):
        if r['category'] == '13007003000':
            coords.append((norm_name(r['title']), float(r['lat']), float(r['lng']), r['address']))
    t = open(f'{RAW}/chuo_kitsuenichiran.html', encoding='utf-8').read()
    body = t[t.find('<h2>区営指定喫煙場所'):] if '<h2>区営指定喫煙場所' in t else t
    L = lines_of(body)
    start = [i for i, l in enumerate(L) if l == '区営指定喫煙場所']
    L = L[start[-1]:] if start else L
    end = next((i for i, l in enumerate(L) if l.startswith('お問い合わせ')), len(L))
    L = L[:end]
    blocks, section = [], None
    for l in L:
        if l in ('区営指定喫煙場所', '民間指定喫煙場所'):
            section = l; continue
        m = re.match(r'^(\d+)\.(.+)$', l)
        if m:
            blocks.append({'section': section, 'name': m.group(2).strip(), 'lines': []})
        elif blocks:
            blocks[-1]['lines'].append(l)
    n = 0
    for b in blocks:
        ls = b['lines']
        addrs = [ls[i + 1] for i, l in enumerate(ls) if l == '所在地' and i + 1 < len(ls)]
        hrs = [ls[i + 1] for i, l in enumerate(ls) if l == '供用時間' and i + 1 < len(ls)]
        notes = [l for l in ls if l.startswith('注記') or (l not in ('所在地', '供用時間', '備考') and l not in addrs and l not in hrs and not l.startswith('【'))]
        floors = [l for l in ls if l.startswith('【')]
        biko = ' '.join(notes)
        status = 'open'
        if re.search(r'紙巻きたばこの利用を休止', biko):
            biko += ' 加熱式たばこ専用'  # cigarettes suspended -> heated tobacco only
        elif re.search(r'休止します', biko) and not re.search(r'再開', biko):
            status = 'closed'
        hours = ' / '.join(hrs)
        extra = [x for x in notes if x.startswith('注記')]
        if extra:
            hours += '（' + '、'.join(x.replace('注記:', '') for x in extra) + '）'
        rem = [x for x in notes if not x.startswith('注記') and '清掃作業中' not in x and 'ご理解' not in x]
        hint = ' '.join(floors + rem) or None
        name = b['name']
        key = norm_name(name)
        ak = addr_key(addrs[0]) if addrs else None
        pool = [c for c in coords if ak and addr_key(c[3]) == ak] or []
        best = max(pool, key=lambda c: difflib.SequenceMatcher(None, key, c[0]).ratio()) if pool else None
        ratio = difflib.SequenceMatcher(None, key, best[0]).ratio() if best else 0
        n += 1
        prefix = '（区営）' if b['section'] == '区営指定喫煙場所' else ''
        if best and (ratio >= 0.6 or key in best[0] or best[0] in key):
            add('Chuo', '中央区', n, prefix + name, addrs[0] if addrs else best[3], hint, hours, status,
                url, '2026-10-13', best[1], best[2], biko)
        else:
            add('Chuo', '中央区', n, prefix + name, addrs[0] if addrs else None, hint, hours, status,
                url, '2026-10-13', extra_text=biko)


# ---------------------------------------------------------------- Minato
def minato():
    url = 'https://www.city.minato.tokyo.jp/kankyouseisaku/shiteikitsuenbasyo.html'
    fac = json.load(open(f'{RAW}/minato_facilities.json', encoding='utf-8'))
    fkeys = [(norm_name(re.sub(r'（(コンテナ型|加熱式たばこ専用|トレーラー型)）', '', r['lines'][1])), r) for r in fac if len(r['lines']) > 3 and 'lat' in r]
    t = open(f'{RAW}/minato_shiteikitsuenbasyo.html', encoding='utf-8').read()
    main = t[t.find('<h1>指定喫煙場所一覧'):t.find('港区喫煙場所マップ</a>') if '港区喫煙場所マップ</a>' in t else len(t)]
    n = 0
    # split into tables with their preceding heading
    for m in re.finditer(r'(<h2>.*?</h2>|<p>[^<]*喫煙場所[^<]*</p>)?\s*<table.*?</table>', main, re.S):
        tbl = m.group(0)
        for tr in re.findall(r'<tr>(.*?)</tr>', tbl, re.S):
            tds = re.findall(r'<td[^>]*>(.*?)</td>', tr, re.S)
            if len(tds) < 2:
                continue
            cell, addr_cell = tds[-2], tds[-1]
            cl = lines_of(cell)
            al = lines_of(addr_cell)
            if not cl:
                continue
            name = cl[0]
            hint_parts, hour_parts = [], []
            for x in cl[1:]:
                if re.match(r'^[（(].*(店|店内)[）)]$', nfkc(x)):
                    name += x
                elif x.startswith('※'):
                    hint_parts.append(x.lstrip('※'))
                else:
                    hour_parts.append(x)
            address = al[0] if al else None
            if len(al) > 1:
                hint_parts.insert(0, ' '.join(al[1:]))
            hours = nfkc(' '.join(hour_parts)) or None
            status = 'closed' if '休止中' in name else 'open'
            not_designated = '（＊）' in name or '(*)' in nfkc(name)
            if not_designated:
                hint_parts.append('区指定外だが一般開放の喫煙室（ページ注記＊）')
            key = norm_name(re.sub(r'（(休止中|コンテナ型|加熱式たばこ専用|トレーラー型|＊)）', '', name))
            ak = addr_key(address)
            best, ratio = None, 0
            for k, r in fkeys:
                if addr_key(r['lines'][3]) != ak:
                    continue
                rr = difflib.SequenceMatcher(None, key, k).ratio()
                if rr > ratio:
                    best, ratio = r, rr
            n += 1
            full = name + ' ' + ' '.join(hint_parts)
            if best and ratio >= 0.6:
                add('Minato', '港区', n, name, address, ' '.join(hint_parts) or None, hours, status,
                    url, '2026-10-01', best['lat'], best['lon'], full)
            else:
                add('Minato', '港区', n, name, address, ' '.join(hint_parts) or None, hours, status,
                    url, '2026-10-01', extra_text=full)


# ---------------------------------------------------------------- Shinjuku
def shinjuku():
    url1 = 'https://www.city.shinjuku.lg.jp/seikatsu/file11_01_00003.html'
    ward_run = [
        ('新宿駅東口公衆喫煙所', '新宿駅東口広場', '新宿三丁目38番先'),
        ('新宿駅西口公衆喫煙所', '新宿駅西口地上ロータリー内', '西新宿一丁目1番先'),
        ('西武新宿駅前公衆喫煙所', '靖国通り大ガード横', '歌舞伎町一丁目30番先'),
        ('新宿駅東南口高架下公衆喫煙所', '新宿駅東南口広場横・国道高架下', '新宿三丁目37番先'),
        ('高田馬場駅前公衆喫煙所', '高田馬場駅前広場', '高田馬場一丁目35番先'),
        ('おおくぼそよかぜ橋公衆喫煙所', '百人町自転車保管場所前', '百人町二丁目3番先'),
        ('信濃町駅公衆喫煙所', '信濃町駅南側駐輪場前', '信濃町34番地先'),
    ]
    # verify against saved page so we never emit something not on it
    page = open(f'{RAW}/shinjuku_file11_01_00003.html', encoding='utf-8').read()
    n = 0
    for name, hint, addr in ward_run:
        assert name in page and addr in page, name
        n += 1
        add('Shinjuku', '新宿区', n, name, addr, hint, None, 'open', url1, '2024-08-05')
    url2 = 'https://www.city.shinjuku.lg.jp/kenkou/eisei01_000001_00005.html'
    t = open(f'{RAW}/shinjuku_eisei01_000001_00005.html', encoding='utf-8').read()
    i0 = t.find('現在運営している喫煙所')
    sec = t[i0:t.find('ご利用について', i0)]
    for h2, body in re.findall(r'<h2[^>]*>(.*?)</h2>(.*?)(?=<h2|$)', sec, re.S):
        name = nfkc(' '.join(lines_of(h2)))
        e = {}
        for li in re.findall(r'<li>(.*?)</li>', body, re.S):
            txt = nfkc(html.unescape(re.sub(r'<[^>]+>', '', li)))
            k, _, v = txt.partition(':')
            e[k.strip()] = v.strip()
        n += 1
        a = e.get('所在地', '').replace('新宿区', '')
        a_main, a_bld = (a.split(' ', 1) + [None])[:2]
        hours = e.get('利用時間')
        if e.get('注意事項'):
            hours = (hours or '') + '（' + e['注意事項'] + '）'
        add('Shinjuku', '新宿区', n, name, a_main, a_bld, hours, 'open', url2, '2026-03-30')


# ---------------------------------------------------------------- Shibuya
def shibuya():
    url = 'https://www.city.shibuya.tokyo.jp/kankyo/machi-seiso/kitsuen/smokingplace.html'
    t = open(f'{RAW}/shibuya_smokingplace.html', encoding='utf-8').read()
    L = lines_of(t)
    # join wrapped lines (e.g. address split across <a>/<span>)
    s = '\n'.join(L)
    s = re.sub(r'（\n', '（', s); s = re.sub(r'\n）', '）', s)
    L = s.split('\n')
    i0 = max(i for i, l in enumerate(L) if l == '区が設置・運営している喫煙所')
    i1 = next(i for i, l in enumerate(L) if i > i0 and l.startswith('お問い合わせ'))
    section, n = None, 0
    for l in L[i0:i1]:
        if l in ('区が設置・運営している喫煙所',):
            section = '区設置'; continue
        if l.startswith('渋谷区公衆喫煙所設置費等助成制度'):
            section = '助成'; continue
        if l.startswith('渋谷区安全・安心なまちづくり'):
            section = '大規模建築物'; continue
        if l in ('その他公共喫煙所',):
            section = 'その他'; continue
        m = re.match(r'^(.+?)（([^（）]*\d[^（）]*)）(.*)$', l)
        if not m or not re.search(r'[:：]', m.group(3) + l):
            continue
        name, addr, rest = m.group(1).strip(), m.group(2).strip(), m.group(3).strip()
        if not re.search(r'\d', addr):
            unparsed.append({'ward': 'Shibuya', 'url': url,
                             'note': f'{name}（{addr}）{rest}: no individual addresses on the page, not geocoded'})
            continue
        rest = rest.lstrip(':：')
        hint = None
        a = nfkc(addr)
        if ' ' in a:
            a, hint = a.split(' ', 1)
        mfloor = re.match(r'^(.*?階[^:：]*)[:：](.*)$', rest)
        if mfloor and section == '大規模建築物':
            hint = ((hint + ' ') if hint else '') + mfloor.group(1)
            rest = mfloor.group(2)
        hours = rest.replace('（注）', '（') + ('）' if '（注）' in rest else '')
        n += 1
        label = {'区設置': '（区設置）', '助成': '', '大規模建築物': '', 'その他': ''}[section]
        add('Shibuya', '渋谷区', n, label + name, a, hint, hours, 'open', url, '2026-07-23', extra_text=rest)


# ---------------------------------------------------------------- Chiyoda
def chiyoda():
    url = 'https://www.city.chiyoda.lg.jp/koho/machizukuri/sekatsu/jore/muryokitsuenjo.html'
    t = open(f'{RAW}/chiyoda_muryokitsuenjo.html', encoding='utf-8').read()
    body = t[t.find('<h2><a id='):t.find('助成施設とは')]
    n = 0
    for area, chunk in re.findall(r'<h2>(.*?)</h2>(.*?)(?=<h2>|$)', body, re.S):
        area = lines_of(area)[0]
        for h3, rest in re.findall(r'<h3>(.*?)</h3>(.*?)(?=<h3>|$)', chunk, re.S):
            name = ' '.join(lines_of(h3))
            ls = lines_of(rest)
            addr, hours, notes = None, None, []
            for j, l in enumerate(ls):
                if l.startswith('設置場所'):
                    v = re.sub(r'^設置場所[：:]', '', l).strip()
                    if not v and j + 1 < len(ls):
                        v = ls[j + 1]
                    addr = v
                elif l.startswith('開放時間'):
                    hours = re.sub(r'^開放時間[：:]', '', l).strip()
                elif addr is None and hours is None:
                    notes.append(l)
                elif l.startswith('（注意）'):
                    notes.append(l)
            if not addr:
                continue
            a = nfkc(addr).replace('千代田区', '')
            m = re.match(r'^([^ (（]+)[ ]?(.*)$', a)
            a_main, a_rest = m.group(1), m.group(2).strip()
            hint = ' '.join(x for x in [a_rest, area] if x) or None
            note = ' '.join(notes)
            status = 'closed' if re.search(r'利用不可|休止', note) else 'open'
            if note:
                hint = (hint + ' ' if hint else '') + note
            n += 1
            add('Chiyoda', '千代田区', n, name, a, hint, hours, status, url, '2026-09-11', extra_text=note)


# ---------------------------------------------------------------- Toshima
def toshima():
    url = 'https://www.city.toshima.lg.jp/152/machizukuri/sumai/bika/taisaku/025701.html'
    t = open(f'{RAW}/toshima_025701.html', encoding='utf-8').read()
    L = [nfkc(x) for x in lines_of(t[t.find('区指定喫煙所設置場所'):t.find('お問い合わせ')])]
    blocks = []
    for l in L:
        m = re.match(r'^(\d)\.(.+)$', l)
        if m:
            blocks.append({'title': m.group(2), 'lines': []})
        elif blocks:
            blocks[-1]['lines'].append(l)
    for i, b in enumerate(blocks, 1):
        title = b['title']
        notes = re.findall(r'※(.+)$', title)
        name = re.sub(r'※.*$', '', title).strip()
        name = name.replace('THETOBACCOIKEBUKUROSECOND', 'THE TOBACCO IKEBUKURO SECOND').replace('THETOBACCOIKEBUKURO', 'THE TOBACCO IKEBUKURO')
        addr = next((re.split('[：:]', x, 1)[1] for x in b['lines'] if x.startswith('住所')), None)
        hours = next((re.split('[：:]', x, 1)[1] for x in b['lines'] if x.startswith('時間')), None)
        days = next((re.split('[：:]', x, 1)[1] for x in b['lines'] if x.startswith('運営日')), None)
        if days:
            hours = f'{days} {hours}'
        status = 'closed' if any('休止' in n for n in notes) else 'open'
        hint = '；'.join(notes) or None
        if 'コンテナ型' in ' '.join(b['lines']):
            hint = ((hint + '；') if hint else '') + 'コンテナ型（加熱式たばこエリアと紙巻たばこエリアに分かれる）'
        a = addr.replace('豊島区', '')
        mm = re.match(r'^(.*?号)(.+)$', a)
        if mm:
            a, bld = mm.group(1), mm.group(2)
            hint = ((hint + '；') if hint else '') + bld
        add('Toshima', '豊島区', i, name, a, hint, hours, status, url, '2026-08-25')


# ---------------------------------------------------------------- Meguro
def meguro():
    url = 'https://www.city.meguro.tokyo.jp/kankyouhozen/kurashi/kankyou/rojyokitsuentaisaku5.html'
    kml = open(f'{RAW}/meguro_mymaps.kml', encoding='utf-8').read()
    pts = []
    for p in re.findall(r'<Placemark>(.*?)</Placemark>', kml, re.S):
        nm = re.search(r'<name>(.*?)</name>', p, re.S).group(1)
        c = re.search(r'<coordinates>\s*([0-9.]+),([0-9.]+)', p)
        pts.append((norm_name(nm), float(c.group(2)), float(c.group(1))))
    t = open(f'{RAW}/meguro_rojyokitsuentaisaku5.html', encoding='utf-8').read()
    L = lines_of(t[t.find('区内指定喫煙所等一覧'):])
    L = L[L.index('備考') + 1:]
    L = L[:next(i for i, l in enumerate(L) if l.startswith('開所時間・休業日は'))]
    entries, area = [], None
    for i, l in enumerate(L):
        if l in ('北部', '東部', '中央', '南部', '西部'):
            area = l; continue
        if i + 1 < len(L) and L[i + 1].startswith('（目黒') or (i + 1 < len(L) and L[i + 1].startswith('（目黒一丁目')):
            entries.append({'name': l.strip(), 'area': area, 'rest': []})
        elif entries and l.startswith('（'):
            entries[-1]['addr'] = l.strip('（）')
        elif entries:
            entries[-1]['rest'].append(l)
    for n, e in enumerate(entries, 1):
        key = norm_name(e['name'])
        best = max(pts, key=lambda p: difflib.SequenceMatcher(None, key, p[0]).ratio())
        ratio = difflib.SequenceMatcher(None, key, best[0]).ratio()
        rest = e['rest']
        hours = rest[0] if rest else None
        notes = [x for x in rest[1:]]
        heated_note = [x for x in notes if '加熱式' in x]
        other = [x for x in notes if '加熱式' not in x]
        if other:
            hours = f"{hours}（{'；'.join(other)}）"
        a = nfkc(e['addr']).replace('目黒区', '')
        hint = None
        if ' ' in a:
            a, hint = a.split(' ', 1)
        name = e['name'] + ('（加熱式たばこ専用）' if heated_note else '')
        if ratio >= 0.55:
            add('Meguro', '目黒区', n, name, a, hint, hours, 'open', url, '2026-10-06', best[1], best[2], ' '.join(notes))
        else:
            add('Meguro', '目黒区', n, name, a, hint, hours, 'open', url, '2026-10-06', extra_text=' '.join(notes))


# ---------------------------------------------------------------- Bunkyo
def bunkyo():
    url = 'https://www.city.bunkyo.lg.jp/bosai/kankyo/rojoukitsuen/okunai.html'
    t = open(f'{RAW}/bunkyo_okunai.html', encoding='utf-8').read()
    body = t[t.find('<h2>助成金を利用した喫煙所'):t.find('お問い合わせ先')]
    for n, (h3, p) in enumerate(re.findall(r'<h3>(.*?)</h3>(.*?)(?=<h3>|$)', body, re.S), 1):
        name = nfkc(' '.join(lines_of(h3)))
        name = re.sub(r'^\d+\s*名称[：:]\s*', '', name)
        hint = None
        m = re.match(r'^(.*?)[（(](.+)[）)]$', name)
        if m:
            name, hint = m.group(1).strip(), m.group(2)
        txt = nfkc(' '.join(lines_of(p)))
        addr = re.search(r'所在地[：:]\s*(.*?)[（(]GoogleMap', txt).group(1).replace(' ', '')
        addr = addr.replace('ー', '-').replace('文京区', '')
        a_main, *bld = addr.split('銀嶺ビル')
        if bld:
            hint = ((hint + ' ') if hint else '') + '銀嶺ビル' + bld[0]
        hours = re.sub(r'\s*シェア.*$', '', re.search(r'運営日時[：:]\s*(.*)$', txt).group(1)).strip()
        lat = lon = None
        link = re.search(r'所在地[：:]\s*<a href="([^"]+)"', p)
        g = re.search(r'!3d([0-9.]+)!4d([0-9.]+)', link.group(1)) if link else None
        if g:
            lat, lon = float(g.group(1)), float(g.group(2))
        add('Bunkyo', '文京区', n, name, a_main, hint, hours, 'open', url, '2026-06-22', lat, lon)


unparsed.extend([
    {'ward': 'Shinagawa', 'url': 'https://www.city.shinagawa.tokyo.jp/',
     'note': 'No official HTML/CSV list of designated smoking places found in the time box (only council PDFs, e.g. contentshozon2020/10.kankyou-rozyoukituenn.pdf). Not attempted further.'},
    {'ward': 'Sumida', 'url': 'https://www.city.sumida.lg.jp/',
     'note': 'No official list page found via search in the time box. Not attempted further.'},
    {'ward': 'Minato', 'url': 'https://www.city.minato.tokyo.jp/kankyouseisaku/kituennbasyomap.html',
     'note': 'Ward also publishes PDF maps (smoking_spaces_map1j/2j.pdf, multilingual). Not parsed; HTML list + facility pages used instead.'},
    {'ward': 'Chuo', 'url': 'https://www.city.chuo.lg.jp/a0030/kenkouiryou/kenkou/tobacco/kitsuenbasho/kitsuenichiran.html',
     'note': 'PDF maps (表/裏) not parsed; HTML list + ward facility-map CSV (/shisetsu/chizu/csv/map_data.csv, category 13007003000) used.'},
    {'ward': 'Chiyoda', 'url': 'https://www.city.chiyoda.lg.jp/documents/30313/chirashi.pdf',
     'note': 'Older PDF flyer (2023) not parsed; current HTML list used. Note: 日比谷公園 喫煙スペース etc. appear only in the old PDF.'},
])

for fn in (shinjuku, shibuya, chiyoda, minato, chuo, taito, toshima, bunkyo, meguro, koto):
    before = len(spots)
    fn()
    print(fn.__name__, len(spots) - before)

out = {'generated': datetime.date.today().isoformat(), 'spots': spots, 'unparsed': unparsed}
json.dump(out, open(OUT, 'w'), ensure_ascii=False, indent=1)
print('total', len(spots), 'source', sum(s['geo'] == 'source' for s in spots),
      'address', sum(s['geo'] == 'address' for s in spots), 'none', sum(s['geo'] is None for s in spots))
