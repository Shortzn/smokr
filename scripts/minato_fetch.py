#!/usr/bin/env python3
"""Fetch Minato facility pages (shisetsu/sonota/kitsuen/*.html) and extract
name, address, hours text, and Google Maps q=lat,lon. Output JSON lines."""
import re, json, time, urllib.request, html, sys, os
RAW = '/Users/habo/Projects/smokr/data/raw/official'
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh) smokr-research'}
def get(url, path):
    if not os.path.exists(path):
        req = urllib.request.Request(url, headers=UA)
        data = urllib.request.urlopen(req, timeout=30).read()
        open(path, 'wb').write(data)
        time.sleep(0.8)
    return open(path, 'rb').read().decode('utf-8', 'ignore')
links = set()
for idx in ['', 'index01.html', 'index02.html']:
    t = get('https://www.city.minato.tokyo.jp/shisetsu/sonota/kitsuen/' + idx,
            f'{RAW}/minato_kitsuen_index{idx.replace(".html","") or ""}.html')
    links |= set(re.findall(r'href="(/shisetsu/sonota/kitsuen/\d+\.html)"', t))
out = []
for l in sorted(links, key=lambda x: int(re.search(r'(\d+)\.html', x).group(1))):
    n = re.search(r'(\d+)\.html', l).group(1)
    t = get('https://www.city.minato.tokyo.jp' + l, f'{RAW}/minato_fac/{n}.html')
    body = t[t.find('ここから本文です'):]
    body = body[:body.find('お問い合わせ')]
    txt = re.sub(r'<[^>]+>', '\n', body); txt = html.unescape(txt)
    lines = [x.strip() for x in txt.split('\n') if x.strip()]
    rec = {'page': 'https://www.city.minato.tokyo.jp' + l, 'lines': lines}
    m = re.search(r'maps\.google\.[^"]*?q=([0-9.]+),([0-9.]+)', t)
    if m: rec['lat'], rec['lon'] = float(m.group(1)), float(m.group(2))
    out.append(rec)
json.dump(out, open(f'{RAW}/minato_facilities.json', 'w'), ensure_ascii=False, indent=1)
print(len(out), 'pages,', sum('lat' in r for r in out), 'with coords')
