'use strict';
// Native plugin dependency metadata only. No shared execution, automatic
// package downloads, or access to another plugin's settings.
const semver=require('semver');
const ID=/^com\.deckforge\.native\.[a-z0-9][a-z0-9.-]{0,110}$/;
function assert(ok,message){if(!ok)throw Error('DeckForge dependencies: '+message);}
function validateDependencies(id,deps){
  if(deps===undefined)return;
  assert(deps&&typeof deps==='object'&&!Array.isArray(deps),'invalid dependencies');
  const pairs=Object.entries(deps);
  assert(pairs.length<=32,'dependency limit');
  for(const [key,range] of pairs){
    assert(ID.test(key)&&!key.endsWith('.')&&!key.includes('..')&&key!==id,'invalid dependency ID: '+key);
    assert(typeof range==='string'&&range.length<=128&&range.trim()&&semver.validRange(range)!==null,'invalid version range: '+key);
  }
}
// Kahn traversal: a plugin becomes ready only when all direct dependencies
// are ready. Missing versions, invalid versions, cycles and their dependents
// cannot execute. Independent plugins remain available.
function resolveDependencies(manifests){
  const byId=new Map(manifests.map(m=>[m.id,m]));
  const blocked=new Map(),ready=new Set(),remaining=new Map(),dependents=new Map();
  for(const [id,m] of byId){
    const deps=Object.entries(m.dependencies||{});
    remaining.set(id,deps.length);
    for(const [target,range] of deps){
      const other=byId.get(target);
      if(!other){if(!blocked.has(id))blocked.set(id,'missing dependency: '+target+' '+range);continue;}
      if(!semver.valid(other.version)||!semver.satisfies(other.version,range)){
        if(!blocked.has(id))blocked.set(id,'incompatible dependency: '+target+' requires '+range+' (installed '+other.version+')');
        continue;
      }
      if(!dependents.has(target))dependents.set(target,[]);
      dependents.get(target).push(id);
    }
  }
  const queue=[...byId.keys()].filter(id=>!blocked.has(id)&&remaining.get(id)===0).sort();
  for(let i=0;i<queue.length;i++){
    const id=queue[i];ready.add(id);
    for(const next of dependents.get(id)||[]){
      if(blocked.has(next))continue;
      remaining.set(next,remaining.get(next)-1);
      if(remaining.get(next)===0)queue.push(next);
    }
  }
  for(const id of byId.keys())if(!ready.has(id)&&!blocked.has(id))
    blocked.set(id,'cyclic or unavailable transitive dependency');
  return {ready,blocked,order:queue};
}
function assertDependencyChange(installed,next){
  const before=resolveDependencies(installed),after=resolveDependencies([
    ...installed.filter(m=>m.id!==next.id),next
  ]);
  assert(after.ready.has(next.id),after.blocked.get(next.id)||'candidate unavailable');
  for(const id of before.ready)if(!after.ready.has(id))
    throw Error('DeckForge dependencies: change would disable '+id+': '+after.blocked.get(id));
  return after;
}
module.exports={validateDependencies,resolveDependencies,assertDependencyChange};
