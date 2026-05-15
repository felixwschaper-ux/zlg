#!/usr/bin/env python3
"""Geocode Landkreise via Nominatim with on-disk cache + rate limit."""
import csv, json, os, time, urllib.request, urllib.parse, sys

SRC   = '/Users/felixschaper/Downloads/u8wfJatWl_692ddbd73d4d1a1fe736ec13_klassifiziert.csv'
CACHE = '/Users/felixschaper/Downloads/zlg-dashboard/data/geocache.json'
UA    = 'zlg-dashboard/0.1 (felix@bahnexpress)'

cache = {}
if os.path.exists(CACHE):
    with open(CACHE) as f:
        cache = json.load(f)

def query(name, bundesland):
    key = f"{name}|{bundesland}"
    if key in cache:
        return cache[key]
    q = f"{name}, {bundesland}, Deutschland"
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({
        'q': q, 'format': 'json', 'limit': 1, 'countrycodes': 'de',
    })
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.load(r)
        if data:
            res = {'lat': float(data[0]['lat']), 'lon': float(data[0]['lon']),
                   'display_name': data[0]['display_name']}
        else:
            res = None
    except Exception as e:
        print(f"  ERROR {name}: {e}", file=sys.stderr)
        res = None
    cache[key] = res
    return res

with open(SRC) as f:
    rows = list(csv.DictReader(f))

# Unique (Landkreis, Bundesland) pairs
pairs = []
seen = set()
for r in rows:
    name = r['customAttribute2'].strip()
    bl = r['location'].strip()
    if not name or bl == 'state_name': continue
    k = (name, bl)
    if k in seen: continue
    seen.add(k); pairs.append(k)

print(f"Geocoding {len(pairs)} unique pairs (cache: {len(cache)})")
new = 0
for i, (name, bl) in enumerate(pairs, 1):
    key = f"{name}|{bl}"
    if key in cache:
        continue
    r = query(name, bl)
    new += 1
    print(f"  [{i}/{len(pairs)}] {name} ({bl}) → {'OK' if r else 'MISS'}")
    if new % 25 == 0:
        with open(CACHE, 'w') as f:
            json.dump(cache, f, ensure_ascii=False, indent=1)
    time.sleep(1.05)  # Nominatim usage policy: max 1 req/s

with open(CACHE, 'w') as f:
    json.dump(cache, f, ensure_ascii=False, indent=1)

hits = sum(1 for v in cache.values() if v)
print(f"Done. Cache size: {len(cache)} ({hits} hits, {len(cache)-hits} misses)")
