#!/usr/bin/env python3
"""Add seats / rows to every config in data.json. Standard seating for the recorded trim,
from general product knowledge (not the dimension research). Idempotent, atomic."""
import json, os, tempfile
HERE = os.path.dirname(os.path.abspath(__file__)); DATA = os.path.join(HERE, 'data.json')
d = json.load(open(DATA, encoding='utf-8'))

def rule(brand, model, name, cfg):
    n = name.lower(); m = model.lower(); bc = cfg.get('bodyClass', ''); cab = cfg.get('cab')
    # ---- pickups ----
    if bc in ('full-size-pickup', 'hd-pickup', 'midsize-pickup', 'compact-pickup', 'pickup-wedge'):
        if cab == 'reg': return 3, 1
        if brand == 'Toyota' and m == 'tacoma' and 'xtracab' in n: return 2, 1
        if brand == 'Nissan' and 'king cab' in n: return 4, 2
        # buckets-standard trims
        if any(k in n for k in ('raptor', 'rho', 'rebel', 'tremor', 'zr2', 'at4x', 'trd pro', 'pro-4x', 'lobo', 'xrt', 'mojave', 'rubicon')): return 5, 2
        if brand in ('Ram',) and m in ('1500', '2500', '3500'): return 6, 2          # Tradesman/base 40-20-40 bench
        if brand == 'Ford' and m in ('F-150', 'Super Duty F-250', 'Super Duty F-350'): return 6, 2  # XL bench
        if brand == 'Chevrolet' and m in ('Silverado 1500', 'Silverado 2500 HD'): return 6, 2      # WT/LT bench
        if brand == 'GMC' and m == 'Sierra 1500' and 'pro' in n: return 6, 2
        return 5, 2
    # ---- everything else ----
    if brand == 'Toyota':
        if m == 'gr supra': return 2, 1
        if m == 'gr86': return 4, 2
        if m in ('highlander', 'grand highlander', 'sequoia'): return 8, 3
        if m == 'sienna': return 7, 3
        return 5, 2
    if brand == 'Honda':
        if m in ('pilot', 'odyssey'): return 8, 3
        return 5, 2
    if brand == 'Acura':
        if m == 'mdx': return 7, 3
        return 5, 2
    if brand == 'Chevrolet':
        if m == 'corvette': return 2, 1
        if m == 'traverse': return 8, 3
        if m in ('tahoe', 'suburban'): return 7, 3      # LT: second-row buckets standard
        return 5, 2
    if brand == 'GMC':
        if m == 'acadia': return 7, 3
        if m in ('yukon', 'yukon xl'): return 8, 3      # Elevation: second-row bench standard
        return 5, 2
    return 5, 2

n = 0
for b in d['brands']:
    for mdl in b['models']:
        for c in mdl['configs']:
            s, r = rule(b['name'], mdl['name'], c['name'], c)
            c['seats'] = s; c['rows'] = r; n += 1
fd, tmp = tempfile.mkstemp(dir=HERE, suffix='.tmp')
with os.fdopen(fd, 'w', encoding='utf-8') as f: json.dump(d, f, indent=1, ensure_ascii=False)
os.replace(tmp, DATA)
print('seats/rows set on', n, 'configs')
