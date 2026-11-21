'use strict';
// Tiny safe Markdown subset. No HTML parser, remote image, or clickable URL.
(function(root,factory){
  const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DeckForgeMarkdown=api;
})(globalThis,()=>{
  function inline(text){
    const result=[];let pos=0;
    // Escaped delimiters and code spans are consumed before emphasis.
    const re=/\\([\\*_\x60|])|\x60([^\x60\n]+)\x60|\*\*([^*\n]+)\*\*|__([^_\n]+)__|\*([^*\n]+)\*|_([^_\n]+)_/g;
    for(const m of text.matchAll(re)){
      if(m.index>pos)result.push({tag:'text',text:text.slice(pos,m.index)});
      result.push(m[1]?{tag:'text',text:m[1]}:m[2]?{tag:'code',text:m[2]}:m[3]||m[4]?{tag:'strong',text:m[3]||m[4]}:{tag:'em',text:m[5]||m[6]});
      pos=m.index+m[0].length;
    }
    if(pos<text.length)result.push({tag:'text',text:text.slice(pos)});
    return result;
  }
  function cells(line){
    let s=line.trim().replace(/^\|/,'').replace(/(?<!\\)\|$/,'');return s.split(/(?<!\\)\|/).map(x=>x.trim());
  }
  const separator=s=>{const c=cells(s);return c.length>0&&c.every(x=>/^:?-{3,}:?$/.test(x));};
  const listMatch=s=>/^\s*(?:([-+*])|(\d+)\.)\s+(.+)$/.exec(s);
  const fence=s=>/^\s*(?:\x60{3,}|~{3,})/.test(s);
  const tableAt=(lines,i)=>i+1<lines.length&&lines[i].includes('|')&&separator(lines[i+1])&&cells(lines[i]).length===cells(lines[i+1]).length;
  function parse(source){
    const lines=String(source||'').slice(0,120000).replace(/\r\n?/g,'\n').split('\n'),blocks=[];
    let i=0;
    while(i<lines.length){
      const l=lines[i];if(!l.trim()){i++;continue;}
      if(fence(l)){const mark=l.trim()[0],code=[];i++;while(i<lines.length&&!new RegExp('^\\s*'+mark+'{3,}\\s*$').test(lines[i]))code.push(lines[i++]);if(i<lines.length)i++;blocks.push({tag:'pre',text:code.join('\n')});continue;}
      const heading=/^(#{1,6})\s+(.+)$/.exec(l);
      if(heading){blocks.push({tag:'h'+Math.min(4,heading[1].length),text:heading[2]});i++;continue;}
      if(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(l)){blocks.push({tag:'hr'});i++;continue;}
      if(tableAt(lines,i)){
        const headers=cells(l),rows=[];i+=2;
        while(i<lines.length&&lines[i].trim()&&lines[i].includes('|')){
          const row=cells(lines[i]);if(row.length!==headers.length)break;rows.push(row);i++;
        }
        blocks.push({tag:'table',headers,rows});continue;
      }
      const list=listMatch(l);
      if(list){const ordered=!!list[2],items=[];while(i<lines.length){const m=listMatch(lines[i]);if(!m||!!m[2]!==ordered)break;items.push(m[3]);i++;}blocks.push({tag:ordered?'ol':'ul',items,start:ordered?Number(list[2]):undefined});continue;}
      if(/^>\s?/.test(l)){const quote=[];while(i<lines.length&&/^>\s?/.test(lines[i]))quote.push(lines[i++].replace(/^>\s?/,''));blocks.push({tag:'blockquote',text:quote.join('\n')});continue;}
      const paragraph=[l];i++;
      while(i<lines.length&&lines[i].trim()&&!fence(lines[i])&&!/^#{1,6}\s/.test(lines[i])&&!listMatch(lines[i])&&!/^>\s?/.test(lines[i])&&!tableAt(lines,i)&&!/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i]))paragraph.push(lines[i++]);
      blocks.push({tag:'p',text:paragraph.join('\n')});
    }
    return blocks;
  }
  function render(target,source){
    const doc=target.ownerDocument;
    const el=tag=>doc.createElement(tag);
    const addInline=(node,text)=>{for(const part of inline(text)){if(part.tag==='text')node.append(doc.createTextNode(part.text));else {const child=el(part.tag);child.textContent=part.text;node.append(child);}}};
    target.replaceChildren();
    for(const block of parse(source)){
      if(block.tag==='table'){
        const wrap=el('div');wrap.className='md-table';const table=el('table'),head=el('thead'),tr=el('tr');
        for(const h of block.headers){const th=el('th');addInline(th,h);tr.append(th);}head.append(tr);table.append(head);
        const body=el('tbody');for(const row of block.rows){const t=el('tr');for(const cell of row){const td=el('td');addInline(td,cell);t.append(td);}body.append(t);}table.append(body);wrap.append(table);target.append(wrap);continue;
      }
      const node=el(block.tag);
      if(block.tag==='pre'){const code=el('code');code.textContent=block.text;node.append(code);}
      else if(block.items){if(block.start>0&&block.start<100000)node.start=block.start;for(const item of block.items){const li=el('li');addInline(li,item);node.append(li);}}
      else if(block.text!=null)addInline(node,block.text);
      target.append(node);
    }
  }
  return {parse,inline,render};
});
