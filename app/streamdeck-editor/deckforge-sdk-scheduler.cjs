'use strict';
// Bound concurrent renderer work across plugins. Per-context FIFO remains
// owned by NativePluginHost; a busy plugin cannot consume all global slots.
class SdkScheduler{
  constructor({globalLimit=6,pluginLimit=2,queueLimit=128}={}){
    this.globalLimit=globalLimit;this.pluginLimit=pluginLimit;this.queueLimit=queueLimit;
    this.running=0;this.byPlugin=new Map();this.waiting=[];this.closed=false;
  }
  run(plugin,active,work){
    if(this.closed||!active())return Promise.resolve(undefined);
    this.prune();
    if(this.waiting.length>=this.queueLimit)return Promise.reject(Error('SDK scheduler capacity'));
    return new Promise((resolve,reject)=>{
      this.waiting.push({plugin,active,work,resolve,reject});this.drain();
    });
  }
  prune(){
    const keep=[];
    for(const task of this.waiting){
      if(this.closed||!task.active())task.resolve(undefined);
      else keep.push(task);
    }
    this.waiting=keep;
  }
  drain(){
    this.prune();
    if(this.closed)return;
    while(this.running<this.globalLimit){
      const index=this.waiting.findIndex(t=>(this.byPlugin.get(t.plugin)||0)<this.pluginLimit);
      if(index<0)return;
      const task=this.waiting.splice(index,1)[0];
      this.running++;this.byPlugin.set(task.plugin,(this.byPlugin.get(task.plugin)||0)+1);
      Promise.resolve().then(()=>task.active()?task.work():undefined).then(task.resolve,task.reject).finally(()=>{
        this.running--;
        const count=this.byPlugin.get(task.plugin)-1;
        if(count)this.byPlugin.set(task.plugin,count);else this.byPlugin.delete(task.plugin);
        this.drain();
      });
    }
  }
  close(){this.closed=true;this.prune();}
}
module.exports={SdkScheduler};
