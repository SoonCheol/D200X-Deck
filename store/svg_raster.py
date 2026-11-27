"""Static SVG subset only; render in a resource-limited Linux child, not the web process."""
import io
import re
import subprocess
import tempfile
import threading
import xml.etree.ElementTree as ET
from PIL import Image

MAX_SVG=256*1024
MAX_SVG_COUNT=500
NS="{http://www.w3.org/2000/svg}"
TAGS=set("svg g path rect circle ellipse line polyline polygon title desc".split())
ATTRS=set("viewBox width height x y x1 x2 y1 y2 cx cy r rx ry d points fill stroke stroke-width stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset fill-rule clip-rule opacity fill-opacity stroke-opacity transform preserveAspectRatio color id version".split())
SAFE_VALUE=re.compile(r"[\w\s#.,%()+\-]*",re.ASCII)
SLOT=threading.BoundedSemaphore(1)

def validate_svg(data):
    if not 0<len(data)<=MAX_SVG: raise ValueError("SVG size limit")
    try:
        source=data.decode("utf-8-sig")
        source=re.sub(r"^\s*<\?xml\s+[^?]*\?>","",source,count=1)
        if "<!" in source or "<?" in source: raise ValueError("SVG declarations prohibited")
        root=ET.fromstring(source)
    except (UnicodeError,ET.ParseError) as exc:
        raise ValueError("invalid SVG XML") from exc
    if root.tag!=NS+"svg": raise ValueError("invalid SVG root")
    stack=[(root,0)];count=0
    while stack:
        node,depth=stack.pop();count+=1
        if count>2048 or depth>24 or not node.tag.startswith(NS) or node.tag[len(NS):] not in TAGS:
            raise ValueError("unsupported SVG structure")
        for key,value in node.attrib.items():
            if key not in ATTRS or len(value)>65536 or not SAFE_VALUE.fullmatch(value) or re.search(r"url\s*\(|(?:https?|file|data|javascript)\s*:",value,re.I):
                raise ValueError("unsupported SVG attribute")
        if node.tag not in (NS+"title",NS+"desc") and (node.text or "").strip():
            raise ValueError("unsupported SVG text")
        if (node.tail or "").strip(): raise ValueError("unsupported SVG text")
        stack.extend((child,depth+1) for child in node)
    return ET.tostring(root,encoding="utf-8")

def rasterize_svg(data):
    clean=validate_svg(data)
    if not SLOT.acquire(timeout=3): raise ValueError("SVG converter busy")
    try:
        with tempfile.TemporaryDirectory(prefix="deckforge-svg-") as directory, tempfile.TemporaryFile() as output:
            try:
                subprocess.run(["/usr/bin/prlimit","--as=268435456","--cpu=2","--fsize=1048576","--nofile=64","--",
                    "/usr/bin/rsvg-convert","--format=png","--width=256","--height=256","--keep-aspect-ratio"],
                    input=clean,stdout=output,stderr=subprocess.DEVNULL,cwd=directory,
                    env={"PATH":"/usr/bin:/bin","HOME":directory,"LANG":"C.UTF-8"},timeout=4,check=True)
            except (OSError,subprocess.SubprocessError) as exc:
                raise ValueError("SVG conversion failed") from exc
            output.seek(0); png=output.read(1048577)
        if len(png)>1048576: raise ValueError("SVG output limit")
        try:
            with Image.open(io.BytesIO(png)) as image:
                if image.format!="PNG" or not 0<image.width<=256 or not 0<image.height<=256:
                    raise ValueError("invalid SVG raster")
                image.load()
        except OSError as exc:
            raise ValueError("invalid SVG raster") from exc
        return png
    finally:
        SLOT.release()
