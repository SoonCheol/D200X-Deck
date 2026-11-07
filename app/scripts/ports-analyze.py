import re,sys,datetime,collections
L=sys.argv[1]
ts=lambda s: datetime.datetime.strptime(s,'%Y-%m-%d %H:%M:%S')
marks={};rows=[]
for l in open(L):
    m=re.match(r'# (\S+ \S+) (\S+)',l)
    if m: marks[m[2]]=ts(m[1]); continue
    m=re.match(r'(\S+ \S+) ws=(\d+) ports=(\d+) app=(\d+) young: (.*)',l)
    if m: rows.append((ts(m[1]),int(m[2]),int(m[3]),int(m[4]),m[5]))
def phase(a,b,skip=1):
    r=[x for x in rows if marks.get(a) and x[0]>=marks[a] and (marks.get(b) is None or x[0]<=marks[b])][skip:]
    return r
def slope(r):  # least squares ports per minute
    t=[(x[0]-r[0][0]).total_seconds()/60 for x in r]; p=[x[2] for x in r]
    n=len(r); mt=sum(t)/n; mp=sum(p)/n
    return sum((a-mt)*(b-mp) for a,b in zip(t,p))/sum((a-mt)**2 for a in t)
def young(r):
    c=collections.Counter()
    for x in r:
        for tok in x[4].split():
            k,_,v=tok.partition('=')
            if v.isdigit() and k not in('awk','sh','ps','grep'): c[k]+=int(v)
    return c
for name,a,b in tuple((n,k+'_START',k+'_END') for n,k in (('A app open','PHASE_A'),('B app closed','PHASE_B'),('C window visible','WINVISIBLE'),('D window closed','WINCLOSED'),('E no pages','NOPAGES'),('F page 1 only','PAGE1ONLY'),('G no claude/codex','NOCLAUDE'),('H claude+codex only','USAGEONLY'),('I claude only','CLAUDEONLY'),('J full profile OLD codex','FULLOLD'),('K full profile NEW codex','FULLNEW'),('L page 2 active','PAGE2'),('M page 2 repeat','PAGE2B'),('N page 3','PAGE3'))):
    r=phase(a,b)
    if len(r)<3: print(name,'not enough samples',len(r)); continue
    mins=(r[-1][0]-r[0][0]).total_seconds()/60
    print(f"{name}: n={len(r)} {r[0][0].time()}-{r[-1][0].time()} ports {r[0][2]}->{r[-1][2]} endpoints {(r[-1][2]-r[0][2])/mins:+.1f}/min, fit {slope(r):+.1f}/min, min={min(x[2] for x in r)} max={max(x[2] for x in r)} ws={sorted(set(x[1] for x in r))} app_flags={sorted(set(x[3] for x in r))}")
    print('   top short-lived programs:',young(r).most_common(6))
