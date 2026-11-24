'use strict';
// Model 5 candidate boundary, not wired into production. All data is parsed
// and validated in the host before a trusted painter receives any command.
const MAX_RESULT_BYTES=512*1024,MAX_MEMORY_BYTES=8192;
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
 Object.keys(v).every(k=>keys.includes(k));
const check=(ok)=>{if(!ok)throw Error('invalid SDK draw operation');};
function validateDrawSpec(spec){
 const color=v=>typeof v==='string'&&/^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(v);
 const coord=v=>Number.isFinite(v)&&Math.abs(v)<=576;
 const size=v=>Number.isFinite(v)&&v>=0&&v<=288;
 check(exact(spec,['width','height','background','commands'])&&[spec.width,spec.height].every(v=>Number.isInteger(v)&&v>=1&&v<=144)&&
  (spec.background===undefined||color(spec.background))&&Array.isArray(spec.commands)&&spec.commands.length<=32);
 for(const cmd of spec.commands){
  check(cmd&&color(cmd.color));
  if(cmd.type==='rect'){
   check(exact(cmd,['type','color','x','y','width','height'])&&[cmd.x,cmd.y].every(coord)&&[cmd.width,cmd.height].every(size));
  }else if(cmd.type==='circle'){
   check(exact(cmd,['type','color','x','y','radius'])&&[cmd.x,cmd.y].every(coord)&&size(cmd.radius));
  }else if(cmd.type==='line'){
   check(exact(cmd,['type','color','x','y','toX','toY','width'])&&[cmd.x,cmd.y,cmd.toX,cmd.toY].every(coord)&&Number.isFinite(cmd.width)&&cmd.width>0&&cmd.width<=32);
  }else if(cmd.type==='text'){
   check(exact(cmd,['type','color','x','y','text','size','font','align','bold'])&&[cmd.x,cmd.y].every(coord)&&
    typeof cmd.text==='string'&&cmd.text.length<=128&&!/[\x00-\x1f\x7f]/.test(cmd.text)&&
    Number.isInteger(cmd.size)&&cmd.size>=6&&cmd.size<=96&&['sans-serif','serif','monospace'].includes(cmd.font??'sans-serif')&&
    ['left','center','right'].includes(cmd.align??'center')&&(cmd.bold===undefined||typeof cmd.bold==='boolean'));
  }else check(false);
 }
 return spec;
}
// This function may be serialized into a trusted painter renderer only.
// It never evaluates plugin code; its input is already host-validated JSON.
function paintValidatedDrawSpec(spec){
 const canvas=document.createElement('canvas');canvas.width=spec.width;canvas.height=spec.height;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});
 if(!ctx)throw Error('SDK draw context unavailable');
 if(spec.background){ctx.fillStyle=spec.background;ctx.fillRect(0,0,canvas.width,canvas.height);}
 for(const cmd of spec.commands){
  ctx.fillStyle=cmd.color;ctx.strokeStyle=cmd.color;
  if(cmd.type==='rect')ctx.fillRect(cmd.x,cmd.y,cmd.width,cmd.height);
  else if(cmd.type==='circle'){ctx.beginPath();ctx.arc(cmd.x,cmd.y,cmd.radius,0,Math.PI*2);ctx.fill();}
  else if(cmd.type==='line'){ctx.lineWidth=cmd.width;ctx.beginPath();ctx.moveTo(cmd.x,cmd.y);ctx.lineTo(cmd.toX,cmd.toY);ctx.stroke();}
  else if(cmd.type==='text'){
   ctx.font=(cmd.bold?'bold ':'')+cmd.size+'px '+(cmd.font??'sans-serif');
   ctx.textAlign=cmd.align??'center';ctx.textBaseline='middle';ctx.fillText(cmd.text,cmd.x,cmd.y,canvas.width);
  }else throw Error('invalid SDK draw operation');
 }
 const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
 let binary='';for(let i=0;i<data.length;i+=4096)binary+=String.fromCharCode(...data.subarray(i,i+4096));
 return {op:'pixels',width:canvas.width,height:canvas.height,rgba:btoa(binary)};
}
function parseWorkerDrawProgram(raw){
 check(typeof raw==='string'&&Buffer.byteLength(raw)<=MAX_RESULT_BYTES);
 const program=JSON.parse(raw);
 check(exact(program,['ops','memory'])&&Array.isArray(program.ops)&&program.ops.length<=16&&
  program.memory!==null&&typeof program.memory==='object'&&!Array.isArray(program.memory)&&Buffer.byteLength(JSON.stringify(program.memory))<=MAX_MEMORY_BYTES);
 let drawings=0;
 for(const op of program.ops){
  check(op!==null&&typeof op==='object'&&!Array.isArray(op)&&typeof op.op==='string');
  // Raw pixels are never accepted from a Worker; only trusted paint output.
  check(op.op!=='pixels');
  if(op.op==='drawKey'){
   check(exact(op,['op','spec'])&&++drawings<=2);
   validateDrawSpec(op.spec);
  }
 }
 return program;
}
function validatePaintResult(op,spec){
 check(exact(op,['op','width','height','rgba'])&&op.op==='pixels'&&op.width===spec.width&&op.height===spec.height&&typeof op.rgba==='string'&&
  op.rgba.length===4*Math.ceil(spec.width*spec.height*4/3)&&/^[A-Za-z0-9+/]+={0,2}$/.test(op.rgba));
 const bytes=Buffer.from(op.rgba,'base64');
 check(bytes.length===spec.width*spec.height*4&&bytes.toString('base64')===op.rgba);
}
async function resolveWorkerDrawProgram(raw,paint,active=()=>true){
 const program=parseWorkerDrawProgram(raw),ops=[];
 const ensureActive=()=>{if(!active())throw Error('SDK draw cancelled');};
 for(const op of program.ops){
  ensureActive();
  if(op.op!=='drawKey'){ops.push(op);continue;}
  const result=await paint(op.spec);
  ensureActive();validatePaintResult(result,op.spec);ops.push(result);
 }
 ensureActive();
 const result={ops,memory:program.memory};
 check(Buffer.byteLength(JSON.stringify(result))<=MAX_RESULT_BYTES);
 // Caller MUST still invoke NativePluginHost.validateScriptOps before effects.
 return result;
}
module.exports={validateDrawSpec,parseWorkerDrawProgram,paintValidatedDrawSpec,resolveWorkerDrawProgram};
