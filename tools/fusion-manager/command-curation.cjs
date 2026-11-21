'use strict';
// UI-based curation never deletes or rewrites the original Fusion command catalog.
// All command IDs remain distinct. A repeated path is merged only for the SAME ID.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.FusionCuration=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const STATES=['primary','review','hidden'];
  const sourceCategory=item=>String(item?.category||'');
  function sourcePaths(item){return Array.isArray(item?.paths)?item.paths:[]}
  function classify(item){
    const paths=sourcePaths(item),cat=sourceCategory(item);
    const isApi=paths.some(p=>p&&p.source==='fusion-api');
    const direct=cat==='direct_toolbar'||paths.some(p=>p.location==='toolbar'&&!p.path?.some(s=>s.kind==='dropdown'));
    const dropdown=cat==='toolbar_dropdown'||paths.some(p=>p.location==='toolbar'&&p.path?.some(s=>s.kind==='dropdown'));
    if(direct||dropdown)return 'primary';
    if(cat==='menu_only'||paths.some(p=>p.location==='menu'))return 'review';
    // Unknown, unplaced and debug-only stay preserved, but not advertised by default.
    return 'hidden';
  }
  function validateCapture(data){
    if(!data||!['deckforge-fusion-ui-placements-v1','deckforge-fusion-ui-placements-v2'].includes(data.format)
      ||!Array.isArray(data.placements)||!Array.isArray(data.errors))throw Error('Fusion UI 수집 JSON 형식 오류');
    if(data.placements.length>250000||data.errors.length>50000)throw Error('Fusion UI 수집 데이터 크기 초과');
    const entries=new Map();
    for(const p of data.placements){
      if(!p||typeof p.commandId!=='string'||p.commandId.length>256||!p.commandId
        ||!Array.isArray(p.path)||p.path.length>30)continue;
      let entry=entries.get(p.commandId);
      if(!entry){entry={id:p.commandId,name:String(p.commandName||p.commandId).slice(0,160),placements:[],visible:false};entries.set(p.commandId,entry)}
      if(entry.placements.length<20)entry.placements.push({
        path:p.path,
        kind:p.placementKind||'unknown',
        visible:p.isVisible===true,
        enabled:p.isEnabled===true,
        promoted:p.isPromoted===true
      });
      if(p.isVisible===true)entry.visible=true;
    }
    return {entries,errors:data.errors.length,version:String(data.fusionVersion||'unknown')};
  }
  function captureClassify(item,capture){
    const c=capture?.entries?.get(item.id);
    if(!c)return classify(item); // never imply absent from current scan = invalid
    return 'primary';
  }
  function visibleItems(commands,mode,capture,overrides={}){
    return commands.filter(v=>{
      const state=STATES.includes(overrides[v.id])?overrides[v.id]:captureClassify(v,capture);
      return mode==='all'||mode===state;
    });
  }
  function sortByPlacement(a,b,capture){
    const pathKey=item=>{
      const recorded=capture?.entries?.get(item.id)?.placements?.[0]?.path;
      const source=recorded||(sourcePaths(item)[0]?.path||[]);
      return source.map(x=>{
        const kind=x.kind||Object.keys(x)[0]||'';
        const val=x.id||x[kind]?.id||x.controlId||'';
        const position=Number.isInteger(x.position)?String(x.position).padStart(6,'0'):'999999';
        return kind+':'+position+':'+val;
      }).join('/')||'~';
    };
    return pathKey(a).localeCompare(pathKey(b),'ko')||a.name.localeCompare(b.name,'ko')||a.id.localeCompare(b.id);
  }
  function nameCollisionGroups(items){
    const groups=new Map();
    for(const item of items){
      const key=String(item.ko||item.name||'').trim();
      if(!key)continue;
      const group=groups.get(key)||[];
      group.push(item);groups.set(key,group);
    }
    return [...groups.entries()].filter(([,g])=>new Set(g.map(x=>x.id)).size>1)
      .map(([name,group])=>({name,ids:group.map(x=>x.id)}));
  }
  return Object.freeze({classify,validateCapture,captureClassify,visibleItems,sortByPlacement,nameCollisionGroups});
});
