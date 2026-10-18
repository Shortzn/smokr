#!/usr/bin/env python3
"""Print readable text and interesting links of a saved HTML page.
Usage: python3 -I pagetext.py FILE [start_marker] [maxchars]"""
import sys, re, html
raw = open(sys.argv[1], 'rb').read()
for enc in ('utf-8', 'cp932', 'euc-jp'):
    try:
        t = raw.decode(enc); break
    except UnicodeDecodeError:
        continue
else:
    t = raw.decode('utf-8', 'ignore')
links = re.findall(r'href="([^"]+)"[^>]*>(.*?)</a>', t, re.S)
s = re.sub(r'<script.*?</script>|<style.*?</style>|<!--.*?-->', '', t, flags=re.S)
s = re.sub(r'<br\s*/?>', ' ', s)
s = re.sub(r'<[^>]+>', '\n', s); s = html.unescape(s); s = re.sub(r'[ \t　]+', ' ', s)
s = re.sub(r'\n\s*\n+', '\n', s)
start = sys.argv[2] if len(sys.argv) > 2 else None
if start and start in s:
    s = s[s.index(start):]
mx = int(sys.argv[3]) if len(sys.argv) > 3 else 6000
print(s[:mx])
for h, x in links:
    if re.search(r'pdf|csv|xls|kml|kmz|google|map|geojson|lat|ll=', h, re.I):
        print('LINK', h, re.sub('<[^>]+>', '', x).strip()[:70])
