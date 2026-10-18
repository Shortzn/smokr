#!/usr/bin/env python3
"""GSI address geocoder with on-disk cache (<=1 req/s).
geocode(addr) -> (lat, lon, matched_title) or None."""
import json, os, time, urllib.parse, urllib.request
CACHE = '/Users/habo/Projects/kitsuen/data/raw/official/gsi_cache.json'
_cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
_last = [0.0]
def geocode(addr):
    if addr in _cache:
        r = _cache[addr]
    else:
        wait = 1.05 - (time.time() - _last[0])
        if wait > 0: time.sleep(wait)
        url = 'https://msearch.gsi.go.jp/address-search/AddressSearch?q=' + urllib.parse.quote(addr)
        try:
            r = json.load(urllib.request.urlopen(url, timeout=30))
        except Exception as e:
            print('geocode error', addr, e); r = []
        _last[0] = time.time()
        _cache[addr] = r
        json.dump(_cache, open(CACHE, 'w'), ensure_ascii=False)
    if not r: return None
    lon, lat = r[0]['geometry']['coordinates']
    return lat, lon, r[0]['properties'].get('title')
