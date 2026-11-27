"""Create an indexed icon pack from uploaded relative paths, without changing image bytes."""
import io
import json
import zipfile
from pathlib import PurePosixPath
from package_inspector import MIB, RASTER, require, safe_path, text

def make_folder_pack(metadata, files):
    require(isinstance(metadata,dict),"invalid folder metadata")
    name=text(metadata.get("name"),120)
    version=text(metadata.get("version"),40)
    author=metadata.get("author","")
    if author: text(author,120)
    require(isinstance(author,str),"invalid author")
    icons=metadata.get("icons")
    require(isinstance(icons,list) and 1<=len(icons)<=2500 and len(icons)==len(files),"invalid file count")
    seen=set(); index=[]; total=0; out=io.BytesIO()
    with zipfile.ZipFile(out,"w",zipfile.ZIP_DEFLATED,compresslevel=3) as z:
        for row,file in zip(icons,files):
            require(isinstance(row,dict),"invalid icon")
            path=row.get("path")
            require(safe_path(path) and len(path)<490 and len(path.split("/"))<=9 and path.casefold() not in seen
                    and PurePosixPath(path).suffix.lower() in RASTER,"unsafe or unsupported image path")
            require(file.filename==path,"file order/path mismatch")
            seen.add(path.casefold())
            tags=row.get("tags",[])
            require(isinstance(tags,list) and len(tags)<=30,"invalid tags")
            tags=list(dict.fromkeys(text(v,60).strip() for v in tags))
            icon_name=text(PurePosixPath(path).stem,100)
            data=file.stream.read(6*MIB+1)
            require(0<len(data)<=6*MIB,"icon size limit")
            total+=len(data)
            require(total<=58*MIB,"folder upload size limit")
            index.append(dict(path=path,name=icon_name,tags=tags))
            z.writestr("icons/"+path,data)
        manifest=json.dumps({"Name":name,"Version":version,"Author":author},ensure_ascii=False).encode("utf-8")
        index_bytes=json.dumps(index,ensure_ascii=False,separators=(",",":")).encode("utf-8")
        require(len(index_bytes)<=MIB,"icon metadata size limit")
        z.writestr("manifest.json",manifest);z.writestr("icons.json",index_bytes)
    data=out.getvalue()
    require(len(data)<=60*MIB,"archive size limit")
    return data
