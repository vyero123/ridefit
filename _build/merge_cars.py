#!/usr/bin/env python3
"""Attach cars.com market data (raw_cars_<brand>.json) to every config of the matched model.
Market fields go under c['market']; cargo1/2/3, passengerVolume, payload, towing are filled ONLY
where the Edmunds-derived value is absent, and each such fill is recorded in c['fieldSources'].
Edmunds stays authoritative for every dimension. Atomic write."""
import json, os, sys, tempfile, datetime
HERE=os.path.dirname(os.path.abspath(__file__)); DATA=os.path.join(HERE,'data.json')
recs=json.load(open(os.path.join(HERE,sys.argv[1]),encoding='utf-8'))
d=json.load(open(DATA,encoding='utf-8')); today=datetime.date.today().isoformat()
MARKET=('msrp','mpgCity','mpgHwy','mpgCombined','horsepower','torque','engine','packages','trim')
FILL=('cargo1','cargo2','cargo3','passengerVolume','payload','towing')
n=0; fills=0; miss=[]
def num(v):
    if isinstance(v,(int,float)): return v
    try: return float(str(v).replace(',',''))
    except Exception: return None
for r in recs:
    if 'brand' not in r or r.get('status')=='no-page': continue
    hit=False
    for b in d['brands']:
        if b['name']!=r['brand']: continue
        for m in b['models']:
            if m['name'].lower()!=r['model'].lower(): continue
            for c in m['configs']:
                mk={'source':r.get('src','cars.com 2026 specs'),'asOf':today}
                for k in MARKET:
                    v=r.get(k)
                    if v in (None,'',[]): continue
                    mk[k]= num(v) if k in ('msrp','mpgCity','mpgHwy','mpgCombined','horsepower','torque') else v
                c['market']=mk
                for k in FILL:
                    v=num(r.get(k))
                    if v is not None and c.get(k) is None:
                        c[k]=v; c.setdefault('fieldSources',{})[k]=mk['source']; fills+=1
                n+=1; hit=True
    if not hit: miss.append(r['brand']+' '+r['model'])
fd,tmp=tempfile.mkstemp(dir=HERE,suffix='.tmp')
with os.fdopen(fd,'w',encoding='utf-8') as f: json.dump(d,f,indent=1,ensure_ascii=False)
os.replace(tmp,DATA)
print('%s: market on %d configs, %d gap fills; unmatched: %s'%(sys.argv[1],n,fills,miss))
