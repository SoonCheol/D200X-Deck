'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {scan}=require('../app/streamdeck-editor/backup-privacy.cjs');
function fixture(actions){
  const row=Array.from({length:19},(_,i)=>actions[i]||null);
  return {profiles:{
    profileNames:[{id:'default',name:'기본 프로필',appPath:''}],profileId:'default',
    pages:[row],inactiveProfiles:[],pinned:[],controls:{global:[],pages:[]},profileTemplates:[]
  },packs:[]};
}
const action=(type,settings)=>({type,title:'',settings,children:[]});
test('detects likely personal and financial data without returning values',()=>{
  const data=fixture([
    action('text',{body:'신용카드 4111 1111 1111 1111 / 휴대전화 010-1234-5678 / example@example.test'}),
    action('text',{body:'경기도 고양시 중앙로 123 / 국민은행 계좌 123-456-789012'}),
    action('sd-plugin',{pluginSettings:{apiKey:'private-value-12345'}}),
    action('website',{url:'https://example.test/?token=private-1234567890'}),
    action('open',{path:'C:\\Users\\private-person\\Documents\\secret.txt'})
  ]);
  const report=scan(data),kinds=new Set(report.findings.map(f=>f.type));
  for(const kind of ['카드번호 의심','휴대전화번호','이메일 주소','주소 의심','계좌번호 의심','인증 정보'])
    assert.equal(kinds.has(kind),true,kind);
  assert.equal(report.incomplete,false);
  const encoded=JSON.stringify(report);
  for(const secret of ['4111','010-1234','example@example','private-value','private-person','중앙로'])assert.equal(encoded.includes(secret),false);
  assert.ok(report.findings.every(f=>f.location.startsWith('프로필 1')));
});
test('checks active, inactive and saved template snapshots',()=>{
  const data=fixture([action('text',{body:'일반 문구'})]);
  const inactive=fixture([action('text',{body:'010-9999-8888'})]).profiles;
  data.profiles.profileNames.push({id:'other',name:'다른 프로필',appPath:''});
  data.profiles.inactiveProfiles=[{id:'other',pages:inactive.pages,controls:inactive.controls,pinned:[]}];
  data.profiles.profileTemplates=[{id:'template-1',name:'템플릿',snapshot:fixture([action('text',{body:'example@example.test'})]).profiles}];
  const report=scan(data);
  assert.ok(report.findings.some(f=>f.type==='휴대전화번호'&&f.location.startsWith('프로필 2')));
  assert.ok(report.findings.some(f=>f.type==='이메일 주소'&&f.location.startsWith('템플릿 1')));
});
test('does not classify ordinary labels, domains or artwork as private data',()=>{
  const data=fixture([action('website',{url:'https://example.test/',browserPath:'C:\\Program Files\\Browser\\Browser.exe'})]);
  data.packs=[{id:'test',name:'Generic',icons:[{name:'example',image:'data:image/png;base64,'+'4'.repeat(200000)}]}];
  assert.equal(scan(data).total,0);
});
test('reports incomplete scanning when a text field exceeds the local limit',()=>{
  const data=fixture([action('text',{body:'test'.repeat(30000)})]);
  const report=scan(data);
  assert.equal(report.incomplete,true);
  assert.equal(report.total,0);
});

test('normal Windows user folder paths do not trigger privacy warnings',()=>{
  const data=fixture([
    action('folder',{path:'C:\\Users\\demo-user\\Documents'}),
    action('open',{path:'D:\\Users\\demo-user\\Music\\Demo'}),
    action('website',{url:'https://example.test',browserPath:'C:\\Users\\demo-user\\AppData\\Local\\Programs\\Browser.exe'})
  ]);
  assert.deepEqual(scan(data),{findings:[],total:0,incomplete:false});
});

test('address and other sensitive content inside folder settings is still detected',()=>{
  const data=fixture([
    action('folder',{path:'C:\\Users\\demo-user\\Documents',description:'새봄로 27'}),
    action('folder',{path:'C:\\Users\\demo-user\\Documents',note:'example@example.test'})
  ]);
  const report=scan(data);
  assert.deepEqual([...new Set(report.findings.map(f=>f.type))].sort(),['이메일 주소','주소 의심']);
  assert.equal(report.total,2);
});
