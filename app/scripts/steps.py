import sys,re,statistics
name=sys.argv[2]; on=False; ls=[]
for l in open(sys.argv[1]):
    if name+'_START' in l: on=True; continue
    if name+'_END' in l: break
    if on:
        m=re.match(r'(\S+ \S+) ws=\d+ ports=(\d+) app=(\d)',l)
        if m: ls.append(int(m[2]))
d=[b-a for a,b in zip(ls,ls[1:])]
ok=[x for x in d if abs(x)<=100]
print(name,'ports:',ls)
print('  median step',statistics.median(d),'| mean step (|step|<=100):',round(statistics.mean(ok),1),'| outliers:',[x for x in d if abs(x)>100])
