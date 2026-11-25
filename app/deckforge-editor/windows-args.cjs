'use strict';
function parseWindowsArgs(value){
  const source=String(value||'');
  if(source.length>8192||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(source))throw new Error('잘못된 명령줄 인수입니다.');
  const args=[];let i=0;
  while(i<source.length){
    while(i<source.length&&/\s/.test(source[i]))i++;
    if(i>=source.length)break;
    let word='',quoted=false;
    while(i<source.length){
      if(!quoted&&/\s/.test(source[i]))break;
      if(source[i]==='\\'){
        let count=0;while(source[i]==='\\'){count++;i++;}
        if(source[i]==='"'){
          word+='\\'.repeat(Math.floor(count/2));
          if(count%2){word+='"';i++;continue;}
        }else{word+='\\'.repeat(count);continue;}
      }
      if(source[i]==='"'){
        if(quoted&&source[i+1]==='"'){word+='"';i+=2;continue;}
        quoted=!quoted;i++;continue;
      }
      word+=source[i++];
    }
    if(quoted)throw new Error('인수의 큰따옴표가 닫히지 않았습니다.');
    args.push(word);
  }
  return args;
}
module.exports={parseWindowsArgs};
