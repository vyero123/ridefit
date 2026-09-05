#!/usr/bin/env python3
"""Assemble vehicles-vs-you.html FROM ../vehicles.json (the canonical data layer) + geom.js +
data-layer.js + app.js + style.css.  data.json is only the editing format; export_vehicles.py turns
it into vehicles.json, and this script never reads data.json.
Writes atomically (temp file then os.replace) so the deliverable on disk is
never half-written."""
import json, os, subprocess, sys, html, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, '..', 'vehicles-vs-you.html'))

def read(p):
    with open(os.path.join(HERE, p), encoding='utf-8') as f:
        return f.read()

VEH = os.path.abspath(os.path.join(HERE, '..', 'vehicles.json'))
if os.path.getmtime(os.path.join(HERE, 'data.json')) > os.path.getmtime(VEH):
    raise SystemExit('data.json is newer than vehicles.json — run export_vehicles.py first')
with open(VEH, encoding='utf-8') as f:
    vdoc = json.load(f)
assert vdoc.get('schemaVersion') == 2 and vdoc.get('vehicles'), 'vehicles.json missing or wrong schema'

# rebuild the brand->model->config tree the rest of this script expects (same as data-layer.js toTree)
def flat(r):
    c = {'id': r['id'], 'brand': r['identity']['brand'], 'model': r['identity']['model'], 'name': r['identity']['config']}
    for k, v in r['identity'].items():
        if k != 'config': c[k] = v
    for g in ('exterior', 'interior', 'capacity'):
        c.update(r.get(g, {}))
    p = r.get('provenance', {})
    if 'source' in p: c['src'] = p['source']
    if 'roomSource' in p: c['roomSrc'] = p['roomSource']
    if 'approx' in p: c['approx'] = p['approx']
    return c
data = {'brands': []}
_bi = {}
for r in vdoc['vehicles']:
    c = flat(r)
    if c['brand'] not in _bi:
        _bi[c['brand']] = {'name': c['brand'], 'models': [], '_m': {}}
        data['brands'].append(_bi[c['brand']])
    b_ = _bi[c['brand']]
    if c['model'] not in b_['_m']:
        b_['_m'][c['model']] = {'name': c['model'], 'configs': []}
        b_['models'].append(b_['_m'][c['model']])
    b_['_m'][c['model']]['configs'].append(c)
for b_ in data['brands']: del b_['_m']

# --- locate default: Ram 1500 Crew Cab -------------------------------------
def find_default(d):
    for bi, b in enumerate(d['brands']):
        for mi, m in enumerate(b['models']):
            for ci, c in enumerate(m['configs']):
                if b['name'] == 'Ram' and m['name'] == '1500' and c['name'].startswith('Crew Cab'):
                    return bi, mi, ci
    return 0, 0, 0

bi, mi, ci = find_default(data)
brand = data['brands'][bi]
model = brand['models'][mi]
cfg = dict(model['configs'][ci])
cfg['brand'] = brand['name']
cfg['model'] = model['name']
cfg['fullName'] = '%s %s — %s' % (brand['name'], model['name'], cfg['name'])

count = sum(len(m['configs']) for b in data['brands'] for m in b['models'])

# --- static render via node (same geometry code the browser runs) ----------
node_src = """
var VVY = require(%s);
var cfg = %s;
var out = VVY.renderAll(cfg, 75, false);
out.room = VVY.roomHtml(cfg, { people: [] }, false);
process.stdout.write(JSON.stringify(out));
""" % (json.dumps(os.path.join(HERE, 'geom.js')), json.dumps(cfg))

res = subprocess.run(['node', '-e', node_src], capture_output=True, text=True)
if res.returncode != 0:
    sys.stderr.write(res.stderr)
    raise SystemExit('node static render failed')
static = json.loads(res.stdout)

def options(items, sel):
    return ''.join('<option value="%d"%s>%s</option>' % (i, ' selected' if i == sel else '', html.escape(n))
                   for i, n in enumerate(items))

shell = read('shell.html')
repl = {
    '{{CSS}}': read('style.css'),
    '{{GEOM_JS}}': read('geom.js'),
    '{{APP_JS}}': read('app.js'),
    '{{DATA_JSON}}': json.dumps(vdoc, ensure_ascii=True, separators=(',', ':')),
    '{{DATA_LAYER_JS}}': read('data-layer.js'),
    '{{FILTERS_JS}}': read('filters.js'),
    '{{STATIC_SVG}}': static['svg'],
    '{{STATIC_SPECS}}': static['specs'],
    '{{STATIC_COMPS}}': static['comps'],
    '{{STATIC_SRC}}': static['src'],
    '{{STATIC_ROOM}}': static['room'],
    '{{VEHICLE_COUNT}}': str(count),
    '{{DEF_TITLE}}': html.escape('%s %s %s' % (cfg.get('year', ''), cfg['brand'], cfg['model'])).strip(),
    '{{DEF_SUB}}': html.escape(cfg['name']),
    '{{DEF_CHIP}}': html.escape('%s %s · %s' % (cfg['brand'], cfg['model'], cfg['name'])),
    '{{DEF_LEGEND}}': html.escape('%s %s' % (cfg['brand'], cfg['model'])) + ' <span class="vvy-note">' + html.escape(cfg['name']) + '</span>',
    '{{BRAND_OPTIONS}}': options([b['name'] for b in data['brands']], bi),
    '{{MODEL_OPTIONS}}': options([m['name'] for m in brand['models']], mi),
    '{{CONFIG_OPTIONS}}': options([c['name'] for c in model['configs']], ci),
}
for k, v in repl.items():
    shell = shell.replace(k, v)

assert '{{' not in shell, 'unreplaced placeholder remains'
assert shell.count('Vadim Yerokhin') == 1, 'attribution must appear exactly once'

d = os.path.dirname(OUT)
fd, tmp = tempfile.mkstemp(dir=d, suffix='.tmp')
with os.fdopen(fd, 'w', encoding='utf-8') as f:
    f.write(shell)
os.replace(tmp, OUT)
print('wrote %s  (%d bytes, %d configurations from vehicles.json %s)' % (OUT, len(shell.encode('utf-8')), count, vdoc['generatedAt']))
