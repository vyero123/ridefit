#!/usr/bin/env python3
"""data.json (editing format, grouped by brand) -> ../vehicles.json (canonical data layer).

vehicles.json is the artifact the app is built from and the shape a future HTTP endpoint will
serve: { schemaVersion, generatedAt, vehicles: [record...] }.  One record per configuration,
stable id, grouped fields, provenance kept per record (source strings + approx list + asOf).
"""
import json, os, re, datetime, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'data.json')
OUT = os.path.abspath(os.path.join(HERE, '..', 'vehicles.json'))

SCHEMA_VERSION = 2   # v2: adds safety (NHTSA) and market (cars.com) groups + provenance.fieldSources
GROUPS = {
    'exterior': ['height', 'length', 'width', 'wheelbase', 'frontOverhang', 'rearOverhang', 'clearance',
                 'tire', 'bedLen', 'bedHeight', 'bedInnerHeight', 'hoodHeight'],
    'interior': ['headroom1', 'legroom1', 'shoulder1', 'hip1',
                 'headroom2', 'legroom2', 'shoulder2', 'hip2',
                 'headroom3', 'legroom3', 'shoulder3', 'hip3',
                 'passengerVolume', 'cargo1', 'cargo2', 'cargo3'],
    'capacity': ['seats', 'rows', 'weight', 'towing', 'payload'],
}
IDENTITY = ['brand', 'model', 'config', 'year', 'bodyClass', 'template', 'cab']

def slug(s):
    s = re.sub(r"[''\"]", '', s.lower())
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return s

def convert(d):
    today = datetime.date.today().isoformat()
    out, seen = [], set()
    for b in d['brands']:
        for m in b['models']:
            for c in m['configs']:
                rid = slug('%s %s %s' % (b['name'], m['name'], c['name']))
                assert rid not in seen, 'duplicate id ' + rid
                seen.add(rid)
                rec = {'id': rid, 'identity': {'brand': b['name'], 'model': m['name'], 'config': c['name']}}
                for k in ['year', 'bodyClass', 'template', 'cab']:
                    if c.get(k) is not None: rec['identity'][k] = c[k]
                for g, keys in GROUPS.items():
                    grp = {k: c[k] for k in keys if c.get(k) is not None}
                    if grp: rec[g] = grp
                prov = {'asOf': c.get('asOf', today)}
                if c.get('src'): prov['source'] = c['src']
                if c.get('roomSrc'): prov['roomSource'] = c['roomSrc']
                if c.get('approx'): prov['approx'] = sorted(set(c['approx']))
                if c.get('fieldSources'): prov['fieldSources'] = c['fieldSources']   # per-field source overrides (cars.com fills)
                rec['provenance'] = prov
                if c.get('safety'): rec['safety'] = c['safety']     # NHTSA stars + ADAS flags, with ratingYear + vehicleId
                if c.get('market'): rec['market'] = c['market']     # cars.com: msrp, mpg, hp/torque, packages
                # Opportunistic equipment: captured only when a page already fetched for dimensions
                # happens to list features. Keyed by trim from day one so per-trim data later needs
                # no migration. Absent when nothing was observed.
                if c.get('equipment'):
                    rec['equipment'] = {
                        'status': 'opportunistic-incomplete',
                        'modelYear': c.get('year'),
                        'trims': c['equipment']   # { "<trim name>": { source, asOf, standard:[...], optional:[...] } }
                    }
                out.append(rec)
    return {'schemaVersion': SCHEMA_VERSION, 'generatedAt': datetime.datetime.utcnow().replace(microsecond=0).isoformat() + 'Z',
            'units': {'length': 'in', 'mass': 'lb', 'volume': 'cu ft'}, 'count': len(out), 'vehicles': out}

if __name__ == '__main__':
    with open(SRC, encoding='utf-8') as f:
        d = json.load(f)
    doc = convert(d)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(OUT), suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(doc, f, indent=1, ensure_ascii=False)
    os.replace(tmp, OUT)
    print('vehicles.json: %d records, schema v%d' % (doc['count'], SCHEMA_VERSION))
