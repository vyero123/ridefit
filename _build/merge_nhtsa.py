#!/usr/bin/env python3
"""Attach NHTSA safety records (raw_nhtsa_<brand>.json) to every config of the matched model.
Record shape from the haiku agents: {brand, model, ratingYear, vehicleId, description, overall,
front, side, rollover, rolloverProb, esc, fcw, ldw, recalls, complaints}. Atomic write."""
import json, os, sys, tempfile, datetime
HERE=os.path.dirname(os.path.abspath(__file__)); DATA=os.path.join(HERE,'data.json')
recs=json.load(open(os.path.join(HERE,sys.argv[1]),encoding='utf-8'))
d=json.load(open(DATA,encoding='utf-8')); today=datetime.date.today().isoformat()
STARS=('overall','front','side','rollover'); n=0; miss=[]
def num(v):
    try: return int(v)
    except Exception: return None
for r in recs:
    if 'brand' not in r or not r.get('vehicleId'): continue
    hit=False
    for b in d['brands']:
        if b['name']!=r['brand']: continue
        for m in b['models']:
            if m['name'].lower()!=r['model'].lower(): continue
            for c in m['configs']:
                s={'source':'NHTSA SafetyRatings API','asOf':today,'ratingYear':r.get('ratingYear'),'vehicleId':r['vehicleId'],'ratedAs':r.get('description')}
                for k in STARS:
                    v=num(r.get(k))
                    if v: s[k]=v
                if isinstance(r.get('rolloverProb'),(int,float)): s['rolloverProb']=r['rolloverProb']
                for k in ('esc','fcw','ldw'):
                    if isinstance(r.get(k),str) and r[k] and r[k]!='Not Rated': s[k]=r[k]
                for k in ('recalls','complaints'):
                    if isinstance(r.get(k),int): s[k]=r[k]
                c['safety']=s; n+=1; hit=True
    if not hit: miss.append(r['brand']+' '+r['model'])
fd,tmp=tempfile.mkstemp(dir=HERE,suffix='.tmp')
with os.fdopen(fd,'w',encoding='utf-8') as f: json.dump(d,f,indent=1,ensure_ascii=False)
os.replace(tmp,DATA)
print('%s: safety attached to %d configs; unmatched models: %s'%(sys.argv[1],n,miss))
