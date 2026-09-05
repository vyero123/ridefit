#!/usr/bin/env python3
"""Merge rear-seat room fields into data.json for ONE brand at a time. Atomic write.
Usage: python3 merge_rooms.py rooms_x.json Brand"""
import json, os, sys, tempfile
HERE=os.path.dirname(os.path.abspath(__file__)); DATA=os.path.join(HERE,'data.json')
FIELDS=['headroom1','legroom1','headroom2','legroom2','headroom3','legroom3']
recs=json.load(open(os.path.join(HERE,sys.argv[1]),encoding='utf-8')); brand=sys.argv[2]
d=json.load(open(DATA,encoding='utf-8'))
idx={}
for b in d['brands']:
    for m in b['models']:
        for c in m['configs']:
            idx[(b['name'],m['name'],c['name'])]=c
n=0; miss=[]
for r in recs:
    if r.get('brand')!=brand: continue
    key=(r['brand'],r['model'],r['name'])
    if key not in idx: miss.append(key); continue
    c=idx[key]
    for f in FIELDS:
        if f in r and r[f] is not None: c[f]=round(float(r[f]),1)
    if r.get('approx'):
        ap=set(c.get('approx',[]))|set(r['approx']); c['approx']=sorted(ap)
    if r.get('src'): c['roomSrc']=r['src']
    n+=1
fd,tmp=tempfile.mkstemp(dir=HERE,suffix='.tmp')
with os.fdopen(fd,'w',encoding='utf-8') as f: json.dump(d,f,indent=1,ensure_ascii=False)
os.replace(tmp,DATA)
print('%s: merged %d configs; unmatched: %s'%(brand,n,miss))
