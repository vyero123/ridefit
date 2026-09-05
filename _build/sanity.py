import json,io,sys
d=json.load(io.open('data.json',encoding='utf-8'))
n=0;bad=[]
for b in d['brands']:
    for m in b['models']:
        for c in m['configs']:
            n+=1
            for f in ('height','length','template','seats','rows','name'):
                if c.get(f) is None: bad.append(b['name']+' '+m['name']+' missing '+f)
            for k,v in c.items():
                if v is None or v=='': bad.append(b['name']+' '+m['name']+' empty '+k)
print('configs:',n,'brands:',len(d['brands']),'| problems:',bad or 'none')
