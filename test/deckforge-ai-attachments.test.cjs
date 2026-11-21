'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {prepareAttachments}=require('../app/streamdeck-editor/ai/attachments.cjs');
const {chat,cleanHistory}=require('../app/streamdeck-editor/ai/responses.cjs');

const encoded=(name,bytes,mime='application/octet-stream')=>({
  name,dataUrl:'data:'+mime+';base64,'+Buffer.from(bytes).toString('base64')
});
const events=(...items)=>new Response(items.map(event=>'data: '+JSON.stringify(event)+'\r\n\r\n').join(''),{status:200});
const finish=()=>events(
  {type:'response.output_text.delta',delta:'첨부 분석 완료'},
  {type:'response.completed',response:{status:'completed',output:[],usage:{input_tokens:5,output_tokens:3,total_tokens:8}}}
);
test('validated PNG, PDF and text files generate one-turn multimodal parts',()=>{
  const items=prepareAttachments([
    encoded('capture.png',Buffer.from('89504e470d0a1a0a00','hex'),'image/png'),
    encoded('report.pdf',Buffer.from('%PDF-1.7\nDemo'),'application/pdf'),
    encoded('trace.log',Buffer.from('2026-11-21: test\n'))
  ]);
  assert.deepEqual(items.names,['capture.png','report.pdf','trace.log']);
  assert.equal(items.parts.length,3);
  assert.equal(items.parts[0].type,'input_image');
  assert.equal(items.parts[0].detail,'auto');
  assert.equal(items.parts[1].type,'input_file');
  assert.equal(items.parts[1].filename,'report.pdf');
  assert.equal(items.parts[2].filename,'trace.log');
  assert.ok(items.parts[0].image_url.startsWith('data:image/png;base64,'));
  assert.ok(items.parts[1].file_data.startsWith('data:application/pdf;base64,'));
});

test('rejects invalid input, formats and oversize attachments',()=>{
  const png=encoded('valid.png',Buffer.from('89504e470d0a1a0a00','hex'),'image/png');
  assert.throws(()=>prepareAttachments([png,png,png,png]),/최대 3개/);
  assert.throws(()=>prepareAttachments([encoded('run.exe',Buffer.from('exe'))]),/지원하지 않는/);
  assert.throws(()=>prepareAttachments([encoded('../danger.png',Buffer.from('89504e470d0a1a0a','hex'))]),/이름/);
  assert.throws(()=>prepareAttachments([encoded('bad.png',Buffer.from('not png'))]),/이미지/);
  assert.throws(()=>prepareAttachments([encoded('bad.pdf',Buffer.from('not pdf'))]),/PDF/);
  assert.throws(()=>prepareAttachments([encoded('invalid.txt',Buffer.from([0xff]))]),/UTF-8/);
  assert.throws(()=>prepareAttachments([encoded('huge.pdf',Buffer.alloc(6*1024*1024+1))]),/너무 큽니다/);
  assert.throws(()=>prepareAttachments([{name:'bad.txt',dataUrl:'data:text/plain;base64,@@@'}]),/인코딩/);
  assert.deepEqual(prepareAttachments(null),{parts:[],names:[]});
});

test('attachments are present only in the current request; prior text history stays text-only',async()=>{
  const files=prepareAttachments([encoded('note.txt',Buffer.from('Hello file'))]);
  let request;
  const result=await chat({
    token:'mock',model:'mock',messages:[
      {role:'user',content:'Previous prompt'},
      {role:'assistant',content:'Previous answer'},
      {role:'user',content:'Review note.txt'}
    ],attachments:files.parts,
    fetcher:async(_url,options)=>{request=JSON.parse(options.body);return finish();}
  });
  assert.equal(result.text,'첨부 분석 완료');
  assert.equal(request.input[0].content,'Previous prompt');
  assert.equal(request.input[1].content,'Previous answer');
  assert.equal(request.input[2].content[0].type,'input_text');
  assert.equal(request.input[2].content[0].text,'Review note.txt');
  assert.equal(request.input[2].content[1].type,'input_file');
  assert.equal(request.input[2].content[1].filename,'note.txt');
  const history=cleanHistory([{role:'user',content:'Review note.txt\n[첨부 파일: note.txt · 원본은 대화 기록에 저장하지 않음]'}]);
  assert.equal(typeof history[0].content,'string');
  assert.doesNotMatch(JSON.stringify(history),/SGVsbG8gZmlsZQ/);
});
test('inspector preserves original cards and uses Key Up, Key Down, then preview ordering',()=>{
  const editor=fs.readFileSync(path.join(__dirname,'../app/streamdeck-editor/editor.js'),'utf8');
  const style=fs.readFileSync(path.join(__dirname,'../app/streamdeck-editor/style.css'),'utf8');
  assert.match(editor,/layout\.append\(iconRegion,preview\)/);
  assert.match(editor,/layout\.append\(titleFields,preview\)/);
  assert.match(style,/\.state-title-inspector \.state-title-layout\{\s*grid-template-columns:minmax\(0,1fr\) 98px/);
  assert.match(style,/\.action-layout-inspector \.action-single-visual\{\s*grid-template-columns:minmax\(0,1fr\) 98px/);
  assert.match(style,/\.action-layout-inspector \.action-preview-card \.preview-key\{width:86px;height:86px/);
  assert.match(style,/\.state-title-inspector \.state-title-layout \.sdk-state-buttons button\{[\s\S]*?width:76px;height:25px/);
});
