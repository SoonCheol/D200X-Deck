"""Create indexed packs; keep original SVGs outside the install index."""
import io
import json
import zipfile
import time
import hashlib
from PIL import Image, UnidentifiedImageError
from svg_raster import rasterize_svg, MAX_SVG, MAX_SVG_COUNT
from pathlib import PurePosixPath
from package_inspector import MIB, RASTER, require, safe_path, text, display_icon_name

def make_folder_pack(metadata, files):
    require(isinstance(metadata,dict),"invalid folder metadata")
    name=text(metadata.get("name"),120)
    version=text(metadata.get("version"),40)
    author=metadata.get("author","")
    if author: text(author,120)
    require(isinstance(author,str),"invalid author")
    icons=metadata.get("icons")
    require(isinstance(icons,list) and 1<=len(icons)<=2500 and len(icons)==len(files),"invalid file count")
    root='com.deckforge.icons.'+hashlib.sha256((author+'\0'+name).encode('utf-8')).hexdigest()[:24]+'.sdIconPack/'
    seen=set(); installed=set(); index=[]; total=0; svg_count=0; deadline=time.monotonic()+60; out=io.BytesIO()
    with zipfile.ZipFile(out,"w",zipfile.ZIP_DEFLATED,compresslevel=3) as z:
        for row,file in zip(icons,files):
            require(isinstance(row,dict),"invalid icon")
            path=row.get("path")
            require(safe_path(path) and safe_path(root+'originals/'+path) and len(path.split("/"))<=9 and path.casefold() not in seen
                    and PurePosixPath(path).suffix.lower() in (set(RASTER)|{".svg"}),"unsafe or unsupported image path")
            require(file.filename==path,"file order/path mismatch")
            seen.add(path.casefold())
            tags=row.get("tags",[])
            require(isinstance(tags,list) and len(tags)<=30,"invalid tags")
            tags=list(dict.fromkeys(text(v,60).strip() for v in tags))
            icon_name=text(display_icon_name(PurePosixPath(path).stem),100)
            data=file.stream.read(6*MIB+1)
            require(0<len(data)<=6*MIB,"icon size limit")
            total+=len(data)
            require(total<=58*MIB,"folder upload size limit")
            target=path
            if PurePosixPath(path).suffix.lower()==".svg":
                svg_count+=1
                require(svg_count<=MAX_SVG_COUNT and len(icons)+svg_count+3<=2530 and len(data)<=MAX_SVG and time.monotonic()<deadline,"SVG folder limit")
                target=str(PurePosixPath(path).with_suffix(".png"))
                original=data
                data=rasterize_svg(original)
                z.writestr(root+"originals/"+path,original)
            require(target.casefold() not in installed,"converted icon path conflict")
            installed.add(target.casefold())
            index.append(dict(path=target,name=icon_name,tags=tags))
            z.writestr(root+"icons/"+target,data)
            if len(index)==1:
                try:
                    with Image.open(io.BytesIO(data)) as im:
                        require(im.format==RASTER[PurePosixPath(target).suffix.lower()] and 0<im.width<=4096 and 0<im.height<=4096,"invalid raster")
                        cover=im.convert("RGBA");cover.thumbnail((56,56))
                        canvas=Image.new("RGBA",(56,56));canvas.paste(cover,((56-cover.width)//2,(56-cover.height)//2))
                        buf=io.BytesIO();canvas.save(buf,format="PNG")
                        z.writestr(root+"icon.png",buf.getvalue())
                except (UnidentifiedImageError,Image.DecompressionBombError,OSError) as exc:
                    raise ValueError("invalid raster") from exc
        manifest=json.dumps({"Name":name,"Version":version,"Author":author,"Icon":"icon.png"},ensure_ascii=False).encode("utf-8")
        index_bytes=json.dumps(index,ensure_ascii=False,separators=(",",":")).encode("utf-8")
        require(len(index_bytes)<=MIB,"icon metadata size limit")
        z.writestr(root+"manifest.json",manifest);z.writestr(root+"icons.json",index_bytes)
    data=out.getvalue()
    require(len(data)<=60*MIB,"archive size limit")
    return data
