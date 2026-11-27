"""Bounded offline inspection. Never extract files, execute code, or resolve URLs."""
import base64
import io
import json
import re
import stat
import zipfile
from pathlib import PurePosixPath
from PIL import Image, UnidentifiedImageError

MIB = 1024 * 1024
BUILTINS = {"com.deckforge.native.home-assistant", "de.perdoctus.streamdeck.homeassistant",
            "com.autodesk.fusionstreamdeck", "com.deckforge.native.github-status"}
RASTER = {".png": "PNG", ".jpg": "JPEG", ".jpeg": "JPEG", ".gif": "GIF", ".webp": "WEBP"}
Image.MAX_IMAGE_PIXELS = 4096 * 4096

def require(ok, message):
    if not ok:
        raise ValueError(message)

def text(value, limit):
    require(isinstance(value, str) and value.strip() and len(value) <= limit
            and not re.search(r"[\x00-\x1f\x7f]", value), "invalid package metadata")
    # Reject unpaired surrogates before signing or serializing.
    value.encode("utf-8", "strict")
    return value

def safe_path(name):
    return (isinstance(name, str) and 0 < len(name) < 500 and not re.search(r"[\\:\x00-\x1f\x7f]", name)
            and all(part not in ("", ".", "..") and len(part) <= 250 for part in name.split("/")))

def read_json(archive, name, limit=MIB):
    require(name in archive.namelist() and archive.getinfo(name).file_size <= limit, "missing or oversized manifest")
    return json.loads(archive.read(name).decode("utf-8-sig"))

def png_preview(image, max_bytes):
    for side in (128, 96, 72, 48, 32):
        thumb = image.copy()
        thumb.thumbnail((side, side))
        output = io.BytesIO()
        thumb.save(output, format="PNG", optimize=True)
        if output.tell() <= max_bytes:
            return base64.b64encode(output.getvalue()).decode("ascii")
    return None

def image_sample(image):
    image = image.copy()
    image.thumbnail((48, 48))
    pixels = list(image.getdata())
    visible = [p for p in pixels if p[3] >= 64]
    if len(visible) < 4:
        return []
    n = len(visible)
    color = sum(max(p[:3])-min(p[:3]) >= 30 and max(p[:3]) >= 50 for p in visible)
    white = sum(min(p[:3]) >= 200 for p in visible)
    black = sum(max(p[:3]) <= 55 for p in visible)
    tone = "color" if color/n >= .06 else "white" if white/n >= .75 else "black" if black/n >= .75 else "gray"
    bbox = image.getchannel("A").point(lambda a: 255 if a >= 64 else 0).getbbox()
    tags = [tone]
    if bbox and n < len(pixels):
        ratio = n / ((bbox[2]-bbox[0])*(bbox[3]-bbox[1]))
        if ratio <= .34:
            tags.append("line")
            if tone in ("white", "black"):
                tags.append(tone+"-line")
        elif ratio >= .78:
            tags.append("solid")
    return tags

def inspect_iconpack(z, names, fallback):
    indexes = [n for n in names if re.search(r"(^|/)icons\.json$", n, re.I)]
    require(len(indexes) <= 1, "ambiguous icon index")
    root = indexes[0][:-len("icons.json")] if indexes else ""
    manifest = read_json(z, root+"manifest.json") if root+"manifest.json" in names else {}
    require(isinstance(manifest, dict), "invalid manifest")
    name = text(str(manifest.get("Name") or manifest.get("name") or fallback).strip()[:120], 120)
    version = text(str(manifest.get("Version") or manifest.get("version") or "1.0.0").strip()[:40], 40)
    author = str(manifest.get("Author") or "")[:120]
    search_terms=[]
    if indexes:
        items = read_json(z, indexes[0])
        require(isinstance(items, list) and all(isinstance(x, dict) for x in items), "invalid icon index")
        paths = [x.get("path") for x in items]
        require(all(safe_path(x) for x in paths), "invalid icon path")
        for row in items:
            if isinstance(row.get("name"),str):
                search_terms.append(row["name"][:100])
            if isinstance(row.get("tags"),list):
                search_terms.extend(t[:60] for t in row["tags"][:30] if isinstance(t,str))
        paths = [root+"icons/"+p for p in paths]
    else:
        paths = [n for n in names if PurePosixPath(n).suffix.lower() in RASTER or n.lower().endswith(".svg")]
        paths = [n for n in paths if not re.search(r"(^|/)(icon|categoryicon|preview)\.(png|svg|jpe?g)$", n, re.I)]
    require(0 < len(paths) <= 2500 and len(set(paths)) == len(paths), "invalid icon count")
    search_terms.extend(paths)
    # SVG requires an isolated rasterizer; reject instead of exposing active XML.
    samples = {round(i*(len(paths)-1)/max(1,min(16,len(paths))-1)) for i in range(min(16,len(paths)))}
    previews, cover, styles = [], None, set()
    pairs = {}
    ha_named = False
    decoded_pixels = 0
    for i, name_path in enumerate(paths):
        suffix = PurePosixPath(name_path).suffix.lower()
        require(name_path in names and suffix in RASTER, "only raster icons supported by this server")
        info = z.getinfo(name_path)
        require(0 < info.file_size <= 6*MIB, "icon size limit")
        with Image.open(io.BytesIO(z.read(name_path))) as image:
            require(image.format == RASTER[suffix] and 0 < image.width <= 4096 and 0 < image.height <= 4096, "invalid raster")
            decoded_pixels += image.width*image.height
            require(decoded_pixels <= 100_000_000, "total decoded pixel limit")
            image.seek(0)
            image.load()
            if i in samples:
                rgba = image.convert("RGBA")
                styles.update(image_sample(rgba))
                if len(previews) < 12:
                    preview = png_preview(rgba, 49152)
                    if preview:
                        previews.append(preview)
                if cover is None:
                    cover = png_preview(rgba, 12288)
        stem = re.sub(r"@[23]x$", "", str(PurePosixPath(name_path).with_suffix("")), flags=re.I)
        # Domain-qualified HA entity naming is only a filename heuristic.
        if re.fullmatch(r"(light|switch|sensor|binary_sensor|climate|cover|fan|lock|media_player|scene|automation|input_boolean|vacuum|alarm_control_panel)\.[a-z0-9_]+(?:[ _-](on|off))?",PurePosixPath(stem).name,re.I):
            ha_named = True
        match = re.match(r"(.+?)[ _-]+(on|off)$", stem, re.I)
        if match:
            pairs.setdefault(match.group(1).casefold(), set()).add(match.group(2).lower())
    hint = (name+" "+author).lower()
    purpose = ("ha" if re.search(r"\b(home[ _-]?assistant|ha|iot)\b|스마트홈", hint)
               else "windows" if re.search(r"windows|hotkey|shortcut|단축키", hint)
               else "fusion" if re.search(r"fusion|\bcad\b", hint)
               else "media" if re.search(r"media|music|audio|음악", hint)
               else "app" if re.search(r"logo|\bapp\b|프로그램",hint) else "general")
    naming = (["ha-name"] if ha_named else []) + (["state"] if any(len(v)==2 for v in pairs.values()) else [])
    tags = [purpose, *(naming or ["general-name"]), *(sorted(styles) or ["unknown"])]
    return dict(name=name, version=version, author=author, packageId="", native=False, cover=cover,
                previews=previews, tags=tags, iconCount=len(paths), searchTerms="\n".join(search_terms),
                packageProfile="elgato-icon-index" if indexes and re.search(r"\.sdIconPack/$",root,re.I) else "indexed-icons" if indexes else "raster-images")

def inspect_plugin(z, names, fmt, source):
    native = False
    if fmt == "deckforgePlugin":
        meta = read_json(z, "deckforge-plugin.json", 32768)
        require(isinstance(meta, dict) and meta.get("format") == "deckforge-plugin", "invalid DeckForge package")
        plugin = meta.get("plugin", {})
        runtime = meta.get("runtime", {})
        require(isinstance(plugin, dict) and isinstance(runtime, dict), "invalid manifest")
        package_id, name, version = (plugin.get(k) for k in ("id","name","version"))
        if meta.get("formatVersion") == 2:
            require(set(names)=={"deckforge-plugin.json","payload/native.json"} and runtime.get("type")=="deckforge-sdk"
                    and runtime.get("directory")=="payload" and runtime.get("apiVersion") in (1,2)
                    and meta.get("source",{}).get("kind")=="deckforge", "unsupported native package")
            payload = read_json(z, "payload/native.json")
            require(all(payload.get(k)==plugin.get(k) for k in ("id","name","version"))
                    and payload.get("apiVersion")==runtime.get("apiVersion"), "native identity mismatch")
            native = True
        else:
            require(meta.get("formatVersion")==1 and runtime.get("type")=="streamdeck-sdk" and runtime.get("directory")=="payload"
                    and meta.get("source",{}).get("kind") in ("deckforge","streamdeck"), "unsupported compatibility package")
            require(all(n=="deckforge-plugin.json" or n.startswith("payload/") for n in names), "invalid payload path")
            legacy = read_json(z, "payload/manifest.json")
            require((legacy.get("UUID"),legacy.get("Name"),legacy.get("Version"))==(package_id,name,version), "identity mismatch")
    else:
        manifests = [n for n in names if re.fullmatch(r"[^/]+\.sdPlugin/manifest\.json",n,re.I)]
        require(len(manifests)==1, "unsupported external plugin archive")
        legacy = read_json(z, manifests[0])
        package_id,name,version = (legacy.get(k) for k in ("UUID","Name","Version"))
    package_id = text(package_id,160)
    require(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{2,159}",package_id) and package_id.lower() not in BUILTINS
            and not package_id.lower().startswith("com.deckforge.native.ulanzi-"), "excluded plugin identity")
    require(source=="third-party" or native, "own plugins must be native packages")
    return dict(name=text(name,120),version=text(version,40),author="",packageId=package_id,native=native,cover=None,previews=[],tags=["native" if native else "compatible"],iconCount=0,packageProfile="deckforge-sdk" if native else "elgato-sdk")

def inspect_package(data, kind, fmt, source, fallback):
    require(kind in ("plugin","iconpack"),"invalid kind")
    formats = ("deckforgePlugin","streamDeckPlugin","zip") if kind=="plugin" else ("streamDeckIconPack","sdIconPack","zip")
    require(fmt in formats and source in ("deckforge","third-party"),"invalid format or source")
    require(0 < len(data) <= (40 if kind=="plugin" else 60)*MIB and data[:2]==b"PK","invalid archive size or format")
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            infos=z.infolist()
            require(0 < len(infos)<=2530,"archive entry limit")
            seen=set(); names=[]; total=0
            for info in infos:
                n=info.filename.rstrip("/") if info.is_dir() else info.filename
                require(info.orig_filename==info.filename and safe_path(n) and n.casefold() not in seen
                        and not stat.S_ISLNK(info.external_attr>>16) and not info.flag_bits&1
                        and info.compress_type in (zipfile.ZIP_STORED,zipfile.ZIP_DEFLATED),"unsafe archive entry")
                seen.add(n.casefold())
                if not info.is_dir():
                    total+=info.file_size
                    require(total<=100*MIB,"expanded archive limit")
                    names.append(n)
            # Read every file bounded by declared limits; zipfile verifies CRC on read.
            for n in names:
                with z.open(n) as stream:
                    read=0
                    while chunk:=stream.read(65536):
                        read+=len(chunk)
                        require(read<=z.getinfo(n).file_size,"expanded size mismatch")
                    require(read==z.getinfo(n).file_size,"expanded size mismatch")
            if kind=="iconpack":
                return inspect_iconpack(z,names,fallback)
            result=inspect_plugin(z,names,fmt,source)
            require(not result["native"] or len(data)<=MIB,"native package size limit")
            return result
    except (zipfile.BadZipFile,UnidentifiedImageError,Image.DecompressionBombError,UnicodeError,KeyError,TypeError,AttributeError,OSError,RuntimeError) as exc:
        raise ValueError("invalid or unsupported package") from exc
