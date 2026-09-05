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
ALL_TMP = os.path.join(tempfile.gettempdir(), 'ridefit_all_configs.json')
with open(ALL_TMP, 'w', encoding='utf-8') as _f:
    json.dump([dict(c, brand=b['name'], model=m['name']) for b in data['brands'] for m in b['models'] for c in m['configs']], _f)
# Default crew for the static first paint — MUST match state.party / state.person in app.js:
# you 5'10" (70 in), an adult 5'5" (65), a tall kid 4'10" (58 in, typical at 12), a small kid 3'4" (40 in, typical at 4), one dog.
DEFAULT_PERSON = 70
DEFAULT_PARTY = {'person': DEFAULT_PERSON, 'people': [{'kind': 'adult', 'h': 65}, {'kind': 'kid', 'h': 58}, {'kind': 'kid', 'h': 40}], 'dogs': 1, 'cats': 0, 'adults': 2, 'kids': 2}
node_src = """
var VVY = require(%s);
var cfg = %s, party = %s, person = %s;
var e = VVY.effective(cfg, null);
var out = {
  svg: VVY.renderScene([e], person, false, { party: party }),
  inside: VVY.renderInside(e, person, false, { party: party, role: 'A', idPrefix: 'pb' }),
  specs: VVY.specsHtml(e, false),
  comps: VVY.compsHtml(e, person, false),
  src: VVY.sourceHtml(cfg),
  room: VVY.roomHtml(cfg, party, false),
  fit: VVY.fitHtml(cfg, party)
};
/* fleet ceiling for car-seat toddlers with strollers, from the data */
var all = JSON.parse(require('fs').readFileSync(%s, 'utf8')), best = null, i, n;
for (i = 0; i < all.length; i++) { n = VVY.carSeatCapacity(all[i]); if (best === null || n > best.max) { best = { max: n, vehicle: all[i].brand + ' ' + all[i].model + ' ' + all[i].name, rearSeats: null, cargo: (all[i].cargo3 !== undefined ? all[i].cargo3 : all[i].cargo2) }; } }
out.limits = { maxCarSeats: best.max, bestVehicle: best.vehicle, bestCargoCuFt: best.cargo, strollerCuFt: VVY.STROLLER_CUFT, basis: 'rear seats limited by cargo behind the last row / stroller allowance' };
process.stdout.write(JSON.stringify(out));
""" % (json.dumps(os.path.join(HERE, 'geom.js')), json.dumps(cfg), json.dumps(DEFAULT_PARTY), DEFAULT_PERSON,
       json.dumps(ALL_TMP))

res = subprocess.run(['node', '-e', node_src], capture_output=True, text=True)
if res.returncode != 0:
    sys.stderr.write(res.stderr)
    raise SystemExit('node static render failed')
static = json.loads(res.stdout)

def options(items, sel):
    return ''.join('<option value="%d"%s>%s</option>' % (i, ' selected' if i == sel else '', html.escape(n))
                   for i, n in enumerate(items))

# --- brand assets (../brand, committed with the project) -> inlined, no external requests ---------
import base64, re as _re
BRAND = os.path.abspath(os.path.join(HERE, '..', 'brand'))
def brand_asset(name, mode="r"):
    with open(os.path.join(BRAND, name), mode if mode == 'rb' else 'r', **({} if mode == 'rb' else {'encoding': 'utf-8'})) as f:
        return f.read()
def svg_inline(svg, cls):
    # strip the xml namespace attr (inline SVG in HTML) and tag the root with a class
    svg = _re.sub(r'\s*xmlns="http://www.w3.org/2000/svg"', '', svg, count=1)
    return svg.replace('<svg ', '<svg class="' + cls + '" focusable="false" ', 1)
lockup_light = svg_inline(brand_asset('ridefit4-c-lockup-light.svg'), 'lockup lockup-light')
lockup_dark = svg_inline(brand_asset('ridefit4-c-lockup-dark.svg'), 'lockup lockup-dark')
# favicon: ONE svg carrying both small variants; a media query inside the svg picks the scheme
fav_l = brand_asset('ridefit4-c-icon-light-small.svg'); fav_d = brand_asset('ridefit4-c-icon-dark-small.svg')
def inner(svg):
    return _re.sub(r'^<svg[^>]*>', '', svg.strip(), count=1)[:-len('</svg>')]
favicon_svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
               '<style>.d{display:none}@media (prefers-color-scheme:dark){.l{display:none}.d{display:inline}}</style>'
               '<g class="l">' + inner(fav_l) + '</g><g class="d">' + inner(fav_d) + '</g></svg>')
favicon_uri = 'data:image/svg+xml;base64,' + base64.b64encode(favicon_svg.encode('utf-8')).decode('ascii')
touch_uri = 'data:image/png;base64,' + base64.b64encode(brand_asset("ridefit4-c-icon-light-small-180.png", "rb")).decode('ascii')

shell = read('shell.html')
repl = {
    '{{CSS}}': read('style.css'),
    '{{GEOM_JS}}': read('geom.js'),
    '{{APP_JS}}': read('app.js'),
    '{{DATA_JSON}}': json.dumps(vdoc, ensure_ascii=True, separators=(',', ':')),
    '{{DATA_LAYER_JS}}': read('data-layer.js'),
    '{{FILTERS_JS}}': read('filters.js'),
    '{{STATIC_SVG}}': static['svg'],
    '{{STATIC_INSIDE}}': static['inside'],
    '{{STATIC_FIT}}': static['fit'],
    '{{LIMITS_JSON}}': json.dumps(static['limits']),
    '{{LOCKUP_LIGHT}}': lockup_light,
    '{{LOCKUP_DARK}}': lockup_dark,
    '{{FAVICON_URI}}': favicon_uri,
    '{{TOUCH_URI}}': touch_uri,
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
