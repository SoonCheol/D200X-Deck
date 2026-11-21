'use strict';
// User-selected, one-turn attachment validation for ChatGPT subscription Responses.
// Never read a filesystem path, persist attachment bytes, or use Files upload API.
const MAX_FILES=3, MAX_FILE_BYTES=6*1024*1024, MAX_TOTAL_BYTES=12*1024*1024;
const formats=Object.freeze({
  png:{mime:'image/png',kind:'image'},jpg:{mime:'image/jpeg',kind:'image'},
  jpeg:{mime:'image/jpeg',kind:'image'},webp:{mime:'image/webp',kind:'image'},
  pdf:{mime:'application/pdf',kind:'file'},
  txt:{mime:'text/plain',kind:'file'},log:{mime:'text/plain',kind:'file'},
  md:{mime:'text/markdown',kind:'file'},json:{mime:'application/json',kind:'file'},
  csv:{mime:'text/csv',kind:'file'},xml:{mime:'text/xml',kind:'file'},
  js:{mime:'text/javascript',kind:'file'},
  py:{mime:'text/plain',kind:'file'},
  docx:{mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',kind:'file'},
  xlsx:{mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',kind:'file'}
});
const textExtensions=new Set(['txt','log','md','json','csv','xml','js','py']);
function prepareAttachments(items){
  if(items==null)return {parts:[],names:[]};
  if(!Array.isArray(items)||items.length>MAX_FILES)throw Error('첨부는 최대 3개까지 가능합니다.');
  const parts=[],names=[];let total=0;
  for(const entry of items){
    const name=entry?.name,raw=entry?.dataUrl;
    if(typeof name!=='string'||!name||name.length>120||/[\\/\x00-\x1f\x7f]/.test(name)||name==='.'||name==='..')
      throw Error('첨부 파일 이름이 올바르지 않습니다.');
    const ext=name.split('.').pop().toLowerCase(),format=formats[ext];
    if(!format||!name.includes('.'))throw Error('지원하지 않는 첨부 형식입니다: '+ext.slice(0,12));
    if(typeof raw!=='string'||raw.length>MAX_FILE_BYTES*4/3+150)throw Error('첨부 파일이 너무 큽니다.');
    const match=/^data:([a-zA-Z0-9.+\/-]*)(?:;charset=[A-Za-z0-9-]+)?;base64,([A-Za-z0-9+/]+={0,2})$/.exec(raw);
    if(!match||match[2].length%4===1)throw Error('첨부 파일 인코딩이 올바르지 않습니다.');
    const bytes=Buffer.from(match[2],'base64');
    if(!bytes.length||bytes.length>MAX_FILE_BYTES)throw Error('첨부 파일이 너무 큽니다.');
    if(bytes.toString('base64')!==match[2])throw Error('첨부 파일 인코딩이 올바르지 않습니다.');
    total+=bytes.length;if(total>MAX_TOTAL_BYTES)throw Error('첨부 전체 크기는 12MB를 초과할 수 없습니다.');
    if(format.kind==='image'){
      const png=ext==='png'&&bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'));
      const jpeg=(ext==='jpg'||ext==='jpeg')&&bytes.subarray(0,3).equals(Buffer.from('ffd8ff','hex'));
      const webp=ext==='webp'&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
      if(!png&&!jpeg&&!webp)throw Error('이미지 파일의 실제 형식을 확인하세요.');
      parts.push({type:'input_image',image_url:'data:'+format.mime+';base64,'+match[2],detail:'auto'});
    }else{
      if(ext==='pdf'&&bytes.toString('ascii',0,5)!=='%PDF-')throw Error('PDF 파일 형식이 올바르지 않습니다.');
      if((ext==='docx'||ext==='xlsx')&&!bytes.subarray(0,4).equals(Buffer.from('504b0304','hex')))
        throw Error('Office 문서 형식이 올바르지 않습니다.');
      if(textExtensions.has(ext)){
        try{
          const content=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
          if(content.includes('\0'))throw Error('binary');
        }catch{throw Error('텍스트 첨부는 UTF-8 형식이어야 합니다.');}
      }
      parts.push({type:'input_file',filename:name,file_data:'data:'+format.mime+';base64,'+match[2]});
    }
    names.push(name);
  }
  return {parts,names};
}
module.exports={prepareAttachments,MAX_FILES,MAX_FILE_BYTES,MAX_TOTAL_BYTES};
