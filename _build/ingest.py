#!/usr/bin/env python3
"""Normalize a raw brand-agent JSON array and run the whole pipeline.
Usage: python3 ingest.py raw_<brand>.json
- drops empty approx / null fields, strips the trailing {"notes"} element
- wraps equipment trims with source + asOf provenance
- merge.py -> export_vehicles.py -> build.py -> sanity.py"""
import json, sys, os, datetime, subprocess
HERE = os.path.dirname(os.path.abspath(__file__))
src = sys.argv[1]
raw = json.load(open(os.path.join(HERE, src), encoding='utf-8'))
today = datetime.date.today().isoformat()
out = []
for r in raw:
    if 'brand' not in r:
        continue
    r = {k: v for k, v in r.items() if v is not None and v != '' and not (k == 'approx' and not v)}
    if isinstance(r.get('approx'), (bool, dict)):
        r.pop('approx')
    if 'equipment' in r:
        eq = {}
        for trim, spec in r['equipment'].items():
            eq[trim] = {'source': r.get('src', '').split(';')[0], 'asOf': today,
                        'standard': sorted(set(spec.get('standard', []))), 'optional': sorted(set(spec.get('optional', [])))}
        r['equipment'] = eq
    out.append(r)
clean = os.path.join(HERE, 'records_' + os.path.basename(src).replace('raw_', ''))
json.dump(out, open(clean, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print('normalized %d records -> %s' % (len(out), os.path.basename(clean)))
for cmd in (['python3', 'merge.py', os.path.basename(clean)], ['python3', 'export_vehicles.py'], ['python3', 'build.py'], ['python3', 'sanity.py']):
    res = subprocess.run(cmd, cwd=HERE, capture_output=True, text=True)
    print(res.stdout.strip().splitlines()[-1] if res.stdout.strip() else res.stderr.strip()[-300:])
    if res.returncode:
        raise SystemExit('FAILED: ' + ' '.join(cmd))
