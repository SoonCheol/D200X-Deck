'use strict';
// Adapter between the editor's committed mounts and the original Ulanzi host.
// It never replays physical input and never requests approval automatically.
const same=(a,b)=>!!a&&!!b&&['context','instanceId','mountGeneration','pluginUUID','actionUUID','slot','gesture','configRevision'].every(k=>a[k]===b[k])&&JSON.stringify(a.settings||{})===JSON.stringify(b.settings||{});
const sameIdentity=(a,b)=>!!a&&!!b&&['context','instanceId','mountGeneration','pluginUUID','actionUUID','slot','gesture'].every(k=>a[k]===b[k]);
class UlanziEditorHost{
  constructor(store,onUpdate=()=>{}){
    this.store=store;this.onUpdate=onUpdate;this.desired=new Map();this.confirmed=new Map();this.queue=Promise.resolve();this.suspended=false;this.closed=false;this.revision=0;
  }
  list(){return this.store.list();}
  retireUnmatched(configs){
    this.desired=new Map(configs.map(c=>[c.context,structuredClone(c)]));
    for(const [id,entry] of this.confirmed)if(!same(entry,this.desired.get(id)))this.confirmed.delete(id);
    for(const [id,host] of this.store.active){
      if(host.closed)continue;
      const retained=[...host.mounts.values()].filter(c=>sameIdentity(c,this.desired.get(c.context)));
      if(retained.length!==host.mounts.size)host.sync(retained);
    }
  }
  sync(configs,active=()=>true){
    const revision=++this.revision;
    this.retireUnmatched(configs);
    const current=()=>!this.closed&&!this.suspended&&revision===this.revision&&active();
    const work=this.queue.then(async()=>{
      if(!current())return;
      const groups=new Map();
      for(const cfg of configs){if(!groups.has(cfg.pluginUUID))groups.set(cfg.pluginUUID,[]);groups.get(cfg.pluginUUID).push(cfg);}
      for(const id of [...this.store.active.keys()])if(!groups.has(id))await this.store.stop(id);
      for(const [id,mounts] of groups){
        if(!current())return;
        try{
          const host=await this.store.startApproved(id,message=>{
            if(this.closed||this.suspended)return;
            if(message.context){
              const live=this.store.active.get(id)?.mounts.get(message.context);
              if(!sameIdentity(live,this.desired.get(message.context)))return;
            }
            this.onUpdate(message);
          });
          if(!current()){await this.store.stop(id);return;}
          host.sync(mounts);
          for(const cfg of mounts)this.confirmed.set(cfg.context,structuredClone(cfg));
        }catch(error){
          await this.store.stop(id).catch(()=>{});
          for(const cfg of mounts)this.confirmed.delete(cfg.context);
          // Unapproved plugins remain visible but inert until permission is granted.
          if(!/approval required/.test(String(error?.message)))this.onUpdate({kind:'error',message:'Ulanzi 원본 플러그인 실행 실패: '+id});
        }
      }
    });
    this.queue=work.catch(()=>{});return work;
  }
  key(context,gesture,ticks,desired){
    const cfg=this.confirmed.get(context);
    if(this.closed||this.suspended||!same(cfg,desired)||!same(cfg,this.desired.get(context)))return false;
    return this.store.active.get(cfg.pluginUUID)?.key(context,gesture,ticks)===true;
  }
  suspend(){
    this.suspended=true;this.revision++;this.confirmed.clear();
    const work=this.queue.then(async()=>{for(const id of [...this.store.active.keys()])await this.store.stop(id);});
    this.queue=work.catch(()=>{});return work;
  }
  async resume(){
    if(this.closed)return;this.suspended=false;
    const revision=this.revision,ids=new Set((await this.list()).map(p=>p.uuid));
    if(this.closed||this.suspended||revision!==this.revision)return;
    return this.sync([...this.desired.values()].filter(c=>ids.has(c.pluginUUID)));
  }
  async close(){this.closed=true;this.revision++;this.confirmed.clear();await this.queue;await this.store.close();}
}
module.exports={UlanziEditorHost};
