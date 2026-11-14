'use strict';
// Bundled visual sample reconstructed from the five solid-color 144x144 PNGs
// inspected in the user-provided Simple Gray Tones v1.0.1 icon pack.
// Original pack: Rob Clifton-Harvey, MIT. Metadata and names preserved.
(() => {
  const colors=[['Black',0],['Gray Dark',35],['Gray',68],['Gray Light',128],['White',255]];
  const canvas=document.createElement('canvas');canvas.width=144;canvas.height=144;
  const ctx=canvas.getContext('2d');
  const icons=colors.map(([name,value])=>{
    ctx.fillStyle='rgb('+value+','+value+','+value+')';
    ctx.fillRect(0,0,144,144);
    return {name,tags:['gray','grey','monochrome',name.toLowerCase()],
      image:canvas.toDataURL('image/png')};
  });
  window.D200XSampleIconPack=Object.freeze({
    id:'bundled-simple-gray-tones-1.0.1',name:'Simple Gray Tones',
    version:'1.0.1',author:'Rob Clifton-Harvey',
    source:'bundled',icons
  });
})();
