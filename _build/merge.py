#!/usr/bin/env python3
"""Merge a flat array of vehicle records into the nested data.json.
Usage: python3 merge.py records_x.json [records_y.json ...]
Idempotent on (brand, model, name). Writes data.json atomically."""
import json, os, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data.json')

FIELD_ORDER = ['name', 'year', 'template', 'bodyClass', 'cab', 'seats', 'rows', 'height', 'length',
               'width', 'wheelbase', 'frontOverhang', 'rearOverhang', 'clearance',
               'weight', 'tire', 'bedLen', 'bedHeight', 'bedInnerHeight',
               'hoodHeight', 'headroom1', 'legroom1', 'shoulder1', 'hip1', 'headroom2', 'legroom2', 'shoulder2', 'hip2', 'headroom3', 'legroom3', 'shoulder3', 'hip3', 'passengerVolume', 'cargo1', 'cargo2', 'cargo3', 'towing', 'payload', 'equipment', 'safety', 'market', 'fieldSources', 'roomSrc', 'approx', 'src']

with open(DATA, encoding='utf-8') as f:
    data = json.load(f)

def get_brand(name):
    for b in data['brands']:
        if b['name'] == name:
            return b
    b = {'name': name, 'models': []}
    data['brands'].append(b)
    return b

def get_model(brand, name):
    for m in brand['models']:
        if m['name'] == name:
            return m
    m = {'name': name, 'configs': []}
    brand['models'].append(m)
    return m

added = replaced = 0
for path in sys.argv[1:]:
    with open(os.path.join(HERE, path), encoding='utf-8') as f:
        recs = json.load(f)
    for r in recs:
        if 'brand' not in r:
            continue
        b = get_brand(r['brand'])
        m = get_model(b, r['model'])
        cfg = {k: r[k] for k in FIELD_ORDER if k in r and r[k] is not None}
        if cfg.get('approx') == []:
            cfg.pop('approx')
        hit = None
        for i, c in enumerate(m['configs']):
            if c['name'] == cfg['name']:
                hit = i
        if hit is None:
            m['configs'].append(cfg)
            added += 1
        else:
            m['configs'][hit] = cfg
            replaced += 1

# drop any config still flagged PLACEHOLDER
for b in data['brands']:
    for m in b['models']:
        m['configs'] = [c for c in m['configs'] if 'PLACEHOLDER' not in c.get('src', '')]
    b['models'] = [m for m in b['models'] if m['configs']]
data['brands'] = [b for b in data['brands'] if b['models']]

fd, tmp = tempfile.mkstemp(dir=HERE, suffix='.tmp')
with os.fdopen(fd, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=1, ensure_ascii=False)
os.replace(tmp, DATA)
n = sum(len(m['configs']) for b in data['brands'] for m in b['models'])
print('added %d, replaced %d, total %d configs across %d brands' % (added, replaced, n, len(data['brands'])))
