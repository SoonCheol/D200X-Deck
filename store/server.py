"""DeckForge Store: authenticated, private-by-default single-service catalog."""
import base64
import contextlib
import getpass
import hashlib
import hmac
import io
import json
import os
import re
import secrets
import sqlite3
import sys
import time
import unicodedata
import zipfile
from pathlib import Path
from urllib.parse import urlsplit
from flask import Flask, Response, abort, g, jsonify, request, send_file
from signing import signature_payload, verify_document, sign_document
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from package_inspector import inspect_package, text, MIB
from folder_pack import make_folder_pack
from svg_raster import rasterize_svg, MAX_SVG
from package_inspector import png_preview, icon_preview_page, set_iconpack_version
from PIL import Image

TTL=3600
MIN_PASSWORD_LENGTH=8
ID=re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$")
USERNAME=re.compile(r"^[A-Za-z0-9_.-]{3,64}$")
TOKEN=re.compile(r"^[A-Za-z0-9_-]{43}$")
COOKIE="deckforge_store_session"
PLATFORMS={"deckforge","ulanzi","elgato","generic","unknown"}
PURPOSES={"general","ha","windows","fusion","media","app"}
NAMING={"general-name","ha-name","state"}
DESIGNS={"color","white","black","gray","line","white-line","black-line","solid","unknown"}
# The container format is not the author or source platform. Legacy Ulanzi declarations
# are not evidence of an implemented Ulanzi package parser.
PACKAGE_FORMAT_SQL="""COALESCE(json_extract(r.meta,'$.packageFormat'),CASE
 WHEN json_extract(r.meta,'$.format') IN ('streamDeckIconPack','sdIconPack','streamDeckPlugin') OR json_extract(r.meta,'$.packageProfile') IN ('elgato-icon-index','elgato-sdk') THEN 'streamdeck'
 WHEN json_extract(r.meta,'$.format')='deckforgePlugin' OR json_extract(r.meta,'$.packageProfile')='deckforge-sdk' THEN 'deckforge'
 WHEN json_extract(r.meta,'$.packageProfile')='indexed-icons' AND json_extract(r.meta,'$.source')='deckforge' AND json_extract(r.meta,'$.platform')='deckforge' THEN 'deckforge'
 WHEN json_extract(r.meta,'$.packageProfile')='indexed-icons' THEN 'indexed'
 WHEN json_extract(r.meta,'$.format')='zip' THEN 'zip' ELSE 'unknown' END)"""
def package_format_of(meta):
    if meta.get("packageFormat"): return meta["packageFormat"]
    if meta.get("format") in ("streamDeckIconPack","sdIconPack","streamDeckPlugin") or meta.get("packageProfile") in ("elgato-icon-index","elgato-sdk"): return "streamdeck"
    if meta.get("format")=="deckforgePlugin" or meta.get("packageProfile")=="deckforge-sdk": return "deckforge"
    if meta.get("packageProfile")=="indexed-icons":
        return "deckforge" if meta.get("source")=="deckforge" and meta.get("platform")=="deckforge" else "indexed"
    return "zip" if meta.get("format")=="zip" else "unknown"
def search_fold(value):
    return unicodedata.normalize("NFKC",value or "").casefold()
SCHEMA="""
CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','user')), active INTEGER NOT NULL DEFAULT 1);
CREATE UNIQUE INDEX IF NOT EXISTS one_owner ON accounts(role) WHERE role='owner';
CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS attempts(bucket TEXT PRIMARY KEY, window INTEGER NOT NULL, count INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS items(id TEXT PRIMARY KEY, kind TEXT NOT NULL, source TEXT NOT NULL, package_id TEXT NOT NULL, current_release TEXT);
CREATE TABLE IF NOT EXISTS releases(id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES items(id), version TEXT NOT NULL, sha256 TEXT NOT NULL, meta TEXT NOT NULL, previews TEXT NOT NULL, native INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'draft', UNIQUE(item_id,version));
CREATE TABLE IF NOT EXISTS release_icon_search(release_id TEXT PRIMARY KEY REFERENCES releases(id), terms TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit(seq INTEGER PRIMARY KEY, at INTEGER NOT NULL, actor TEXT NOT NULL, event TEXT NOT NULL, target TEXT NOT NULL);
"""
def uid(): return secrets.token_hex(16)
def sha(data): return hashlib.sha256(data).hexdigest()
def now(): return int(time.time())
def json_text(value): return json.dumps(value,ensure_ascii=False,separators=(",",":"))
def valid_id(value):
    if not isinstance(value,str) or not ID.fullmatch(value): abort(404)
    return value

def password_hash(password,salt=None):
    if not isinstance(password,str) or not MIN_PASSWORD_LENGTH<=len(password)<=1024: raise ValueError(f"password requires {MIN_PASSWORD_LENGTH}–1024 characters")
    salt=salt or secrets.token_bytes(16)
    key=hashlib.scrypt(password.encode("utf-8"),salt=salt,n=32768,r=8,p=1,maxmem=64*MIB,dklen=32)
    return salt.hex()+":"+key.hex()

def password_matches(password,encoded):
    try:
        return hmac.compare_digest(password_hash(password,bytes.fromhex(encoded.split(":")[0])),encoded)
    except (ValueError,UnicodeError):
        return False

def origin_value(value):
    p=urlsplit(value)
    if p.scheme!="https" or not p.hostname or p.username or p.password or p.path not in ("","/") or p.query or p.fragment:
        raise ValueError("STORE_ORIGIN must be a HTTPS origin")
    host=p.hostname.encode("idna").decode("ascii").lower()
    if ":" in host: host="["+host+"]"
    return "https://"+host+(":"+str(p.port) if p.port and p.port!=443 else "")

def create_app(data_dir=None,origin=None):
    root=Path(data_dir or os.environ.get("STORE_DATA","/data")).resolve()
    root.mkdir(parents=True,exist_ok=True)
    blobs=root/"blobs";blobs.mkdir(exist_ok=True)
    database=root/"store.sqlite3"
    origin=origin_value(origin or os.environ["STORE_ORIGIN"])
    app=Flask(__name__,static_folder=None)
    app.config.update(MAX_CONTENT_LENGTH=61*MIB,MAX_FORM_MEMORY_SIZE=131072,MAX_FORM_PARTS=16)
    @contextlib.contextmanager
    def db(write=False):
        connection=sqlite3.connect(database,timeout=10)
        connection.row_factory=sqlite3.Row
        connection.create_function("search_fold",1,search_fold,deterministic=True)
        connection.execute("PRAGMA foreign_keys=ON")
        try:
            if write: connection.execute("BEGIN IMMEDIATE")
            yield connection
            if write: connection.commit()
        except BaseException:
            connection.rollback();raise
        finally: connection.close()
    with db() as c:
        c.execute("PRAGMA journal_mode=WAL")
        c.executescript(SCHEMA)
    # Compute the same scrypt workload for nonexistent users.
    dummy=password_hash(secrets.token_hex(32))
    def audit(c,actor,event,target):
        c.execute("INSERT INTO audit(at,actor,event,target) VALUES(?,?,?,?)",(now(),actor,event,target))
    def account_create(username,password,role,actor):
        if not isinstance(username,str) or not USERNAME.fullmatch(username): raise ValueError("invalid username")
        encoded=password_hash(password)
        with db(True) as c:
            ident=uid()
            c.execute("INSERT INTO accounts(id,username,password,role) VALUES(?,?,?,?)",(ident,username,encoded,role))
            audit(c,actor,"account.create",ident)
        return ident
    def public_account(row): return dict(id=row["id"],username=row["username"],role=row["role"])
    def authenticate(owner=False):
        auth=request.headers.get("Authorization","")
        cookie=not auth
        token=request.cookies.get(COOKIE,"") if cookie else auth[7:] if auth.startswith("Bearer ") else ""
        if not TOKEN.fullmatch(token): abort(401)
        if cookie and request.method not in ("GET","HEAD","OPTIONS"):
            if request.headers.get("Origin")!=origin or request.headers.get("X-DeckForge-CSRF")!="1": abort(403)
        with db() as c:
            row=c.execute("SELECT a.* FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.hash=? AND s.expires>? AND a.active=1",(sha(token.encode()),now())).fetchone()
        if row is None: abort(401)
        if owner and row["role"]!="owner": abort(403)
        g.actor=row["id"]
        return row,token
    def body():
        if not request.is_json or (request.content_length or 0)>16384: abort(400)
        raw=request.stream.read(16385)
        if len(raw)>16384: abort(413)
        try: result=json.loads(raw)
        except (ValueError,UnicodeError): abort(400)
        if not isinstance(result,dict): abort(400)
        return result
    @app.after_request
    def secure(response):
        response.headers["Cache-Control"]="no-store, private"
        response.headers["X-Content-Type-Options"]="nosniff"
        response.headers["Referrer-Policy"]="no-referrer"
        response.headers["Content-Security-Policy"]="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
        response.headers["X-Frame-Options"]="DENY"
        response.headers["Strict-Transport-Security"]="max-age=31536000"
        return response
    @app.errorhandler(ValueError)
    def invalid(_): return jsonify(error="invalid input or package"),400
    @app.errorhandler(sqlite3.IntegrityError)
    def conflict(_): return jsonify(error="conflict or duplicate"),409
    @app.errorhandler(400)
    @app.errorhandler(401)
    @app.errorhandler(403)
    @app.errorhandler(404)
    @app.errorhandler(409)
    @app.errorhandler(413)
    @app.errorhandler(429)
    def http_error(err): return jsonify(error=err.name),err.code
    @app.get("/api/v1/health")
    def health(): return jsonify(ok=True,service="deckforge-store",apiVersion=1)
    @app.post("/api/v1/auth/login")
    def login():
        data=body()
        username,password=data.get("username"),data.get("password")
        client=data.get("client")
        if client not in ("desktop","web") or not isinstance(username,str) or not USERNAME.fullmatch(username) or not isinstance(password,str) or not MIN_PASSWORD_LENGTH<=len(password)<=1024: abort(401)
        if client=="web" and (request.headers.get("Origin")!=origin or request.headers.get("X-DeckForge-CSRF")!="1"): abort(403)
        # Global and account limits do not trust forwarded client IP headers.
        window=now()//300
        blocked=False
        with db(True) as c:
            c.execute("DELETE FROM attempts WHERE window<?",(window-1,))
            for bucket,limit in (("global",60),("user:"+username.lower(),8)):
                row=c.execute("SELECT window,count FROM attempts WHERE bucket=?",(bucket,)).fetchone()
                count=min(limit+1,row["count"]+1) if row and row["window"]==window else 1
                c.execute("INSERT INTO attempts VALUES(?,?,?) ON CONFLICT(bucket) DO UPDATE SET window=excluded.window,count=excluded.count",(bucket,window,count))
                if count>limit:
                    blocked=True
                    break
            account=c.execute("SELECT * FROM accounts WHERE username=? AND active=1",(username,)).fetchone()
        if blocked: abort(429)
        if not password_matches(password,account["password"] if account else dummy) or account is None: abort(401)
        token=secrets.token_urlsafe(32)
        with db(True) as c:
            active=c.execute("SELECT active FROM accounts WHERE id=?",(account["id"],)).fetchone()
            if not active or not active["active"]: abort(401)
            c.execute("DELETE FROM sessions WHERE expires<=?",(now(),))
            c.execute("INSERT INTO sessions VALUES(?,?,?)",(sha(token.encode()),account["id"],now()+TTL))
            audit(c,account["id"],"login","")
        payload=dict(account=public_account(account),expiresIn=TTL)
        if client=="desktop": return jsonify(**payload,accessToken=token)
        response=jsonify(**payload)
        response.set_cookie(COOKIE,token,max_age=TTL,secure=True,httponly=True,samesite="Strict",path="/")
        return response
    @app.post("/api/v1/auth/logout")
    def logout():
        row,token=authenticate()
        with db(True) as c:
            c.execute("DELETE FROM sessions WHERE hash=?",(sha(token.encode()),))
            audit(c,row["id"],"logout","")
        response=Response(status=204);response.delete_cookie(COOKIE,path="/",secure=True,httponly=True,samesite="Strict")
        return response
    @app.get("/api/v1/me")
    def me(): return jsonify(account=public_account(authenticate()[0]))
    def current(c,ident,role):
        row=c.execute("SELECT r.* FROM items i JOIN releases r ON r.id=i.current_release WHERE i.id=? AND r.status='published'",(valid_id(ident),)).fetchone()
        if row is None: abort(404)
        meta=json.loads(row["meta"])
        if role!="owner" and not meta.get("libraryShared") and (meta["visibility"]!="public" or meta["source"]!="deckforge"): abort(404)
        return row,meta
    @app.get("/api/v1/catalog")
    def catalog():
        user,_=authenticate()
        kind=request.args.get("kind")
        if kind not in ("iconpack","plugin"): abort(400)
        cursor=request.args.get("cursor","")
        if cursor: valid_id(cursor)
        try: limit=max(1,min(20,int(request.args.get("limit","20"))))
        except ValueError: abort(400)
        # Filter by authorization before pagination, not after counts.
        sql="""SELECT r.meta,r.previews,i.id FROM items i JOIN releases r ON r.id=i.current_release
        WHERE i.kind=? AND i.id>? AND r.status='published'"""
        params=[kind,cursor]
        if user["role"]!="owner": sql+=" AND (json_extract(r.meta,'$.libraryShared')=1 OR (i.source='deckforge' AND json_extract(r.meta,'$.visibility')='public'))"
        if request.args.get("mine")=="1":
            sql+=" AND json_extract(r.meta,'$.uploadedBy')=?"
            params.append(user["id"])
        q=request.args.get("q","").strip()
        if len(q)>120 or re.search(r"[\x00-\x1f\x7f]",q): abort(400)
        for key,allowed in (("purpose",PURPOSES),("naming",NAMING),("design",DESIGNS)):
            value=request.args.get(key,"")
            if value:
                if kind!="iconpack" or value not in allowed: abort(400)
                sql+=" AND EXISTS (SELECT 1 FROM json_each(r.meta,'$.tags') WHERE value=?)"
                params.append(value)
        platform=request.args.get("platform","")
        if platform:
            if platform not in PLATFORMS: abort(400)
            sql+=" AND COALESCE(json_extract(r.meta,'$.platform'),'unknown')=?"
            params.append(platform)
        package_format=request.args.get("packageFormat","")
        if package_format:
            if package_format not in {"deckforge","streamdeck","ulanzi","zip","indexed","unknown"}: abort(400)
            sql+=" AND "+PACKAGE_FORMAT_SQL+"=?"
            params.append(package_format)
        if q:
            # Literal Unicode-normalized substring; never search covers, hidden metadata or other releases.
            fields=("name","author","version","description","packageId")
            expressions=["instr(search_fold(json_extract(r.meta,'$."+field+"')),?)>0" for field in fields]
            expressions.append("EXISTS (SELECT 1 FROM json_each(r.meta,'$.tags') WHERE instr(search_fold(value),?)>0)")
            expressions.append("EXISTS (SELECT 1 FROM release_icon_search s WHERE s.release_id=r.id AND instr(s.terms,?)>0)")
            sql+=" AND ("+" OR ".join(expressions)+")"
            params.extend([search_fold(q)]*len(expressions))
        sql+=" ORDER BY i.id LIMIT ?";params.append(limit+1)
        with db() as c: rows=c.execute(sql,params).fetchall()
        result=[]
        for x in rows[:limit]:
            item=json.loads(x["meta"])
            if request.args.get("previews")=="1": item["packageFormat"]=package_format_of(item)
            if request.args.get("previews")=="1" and kind=="iconpack":
                item["cardPreviews"]=json.loads(x["previews"])[:6]
            result.append(item)
        return jsonify(items=result,nextCursor=rows[limit-1]["id"] if len(rows)>limit else "")
    @app.get("/api/v1/items/<ident>")
    def detail(ident):
        user,_=authenticate()
        with db() as c: row,meta=current(c,ident,user["role"])
        return jsonify(item={**meta,"packageFormat":package_format_of(meta)},previews=json.loads(row["previews"]))
    @app.get("/api/v1/items/<ident>/icons")
    def item_icons(ident):
        user,_=authenticate()
        with db() as c: row,meta=current(c,ident,user["role"])
        if meta["kind"]!="iconpack": abort(404)
        if request.args.get("release")!=row["id"]: abort(409)
        try: offset=int(request.args.get("offset","0"))
        except ValueError: abort(400)
        if not 0<=offset<=2500: abort(400)
        page=icon_preview_page(verified_package(row,meta),offset,48)
        if page["total"]!=meta["iconCount"]: abort(409)
        return jsonify(page)
    @app.get("/api/v1/items/<ident>/releases/<release>/download")
    def download(ident,release):
        user,_=authenticate()
        with db() as c: row,meta=current(c,ident,user["role"])
        if valid_id(release)!=row["id"]: abort(404)
        return package_response(row,meta)
    def verified_package(row,meta):
        digest=row["sha256"]
        size=meta.get("size")
        if (not re.fullmatch(r"[a-f0-9]{64}",digest) or meta.get("sha256")!=digest
                or meta.get("releaseId")!=row["id"] or meta.get("id")!=row["item_id"]
                or meta.get("version")!=row["version"] or type(size) is not int or not 0<size<=60*MIB):
            abort(409)
        try:
            with (blobs/digest).open("rb") as stream: data=stream.read(size+1)
        except OSError: abort(404)
        if len(data)!=size or sha(data)!=digest: abort(409)
        return data
    def package_response(row,meta):
        data=verified_package(row,meta)
        return send_file(io.BytesIO(data),mimetype="application/octet-stream",as_attachment=True,
                         download_name=meta["id"]+"."+meta["format"],conditional=False,max_age=0)
    @app.get("/api/v1/admin/accounts")
    def accounts():
        authenticate(True)
        with db() as c:
            return jsonify(accounts=[dict(**public_account(x),active=bool(x["active"])) for x in c.execute("SELECT * FROM accounts ORDER BY username")])
    @app.post("/api/v1/admin/accounts")
    def add_account():
        user,_=authenticate(True);data=body()
        ident=account_create(data.get("username"),data.get("password"),"user",user["id"])
        return jsonify(id=ident),201
    @app.post("/api/v1/admin/accounts/<ident>/disable")
    def disable(ident):
        user,_=authenticate(True)
        with db(True) as c:
            if not c.execute("UPDATE accounts SET active=0 WHERE id=? AND role='user'",(valid_id(ident),)).rowcount: abort(404)
            c.execute("DELETE FROM sessions WHERE account_id=?",(ident,))
            audit(c,user["id"],"account.disable",ident)
        return Response(status=204)
    def store_blob(data,digest):
        target=blobs/digest
        temp=blobs/(".upload-"+uid())
        try:
            with temp.open("xb") as f:
                f.write(data);f.flush();os.fsync(f.fileno())
            try: os.link(temp,target)
            except FileExistsError:
                if target.stat().st_size!=len(data) or sha(target.read_bytes())!=digest: abort(409)
            directory=os.open(blobs,os.O_RDONLY)
            try: os.fsync(directory)
            finally: os.close(directory)
        finally: temp.unlink(missing_ok=True)
    @app.post("/api/v1/library/upload")
    def library_upload():
        user,_=authenticate()
        f=request.files.get("file")
        if f is None: abort(400)
        kind=request.form.get("kind")
        filename=Path(f.filename or "").name
        ext=Path(filename).suffix.lower()
        formats={".streamdeckiconpack":"streamDeckIconPack",".sdiconpack":"sdIconPack",".zip":"zip"} if kind=="iconpack" else {".deckforgeplugin":"deckforgePlugin",".streamdeckplugin":"streamDeckPlugin",".zip":"zip"} if kind=="plugin" else {}
        fmt=formats.get(ext)
        if not fmt: abort(400)
        data=f.stream.read(60*MIB+1)
        if kind=="plugin" and fmt=="zip":
            try:
                with zipfile.ZipFile(io.BytesIO(data)) as archive:
                    if "deckforge-plugin.json" in archive.namelist(): fmt="deckforgePlugin"
            except zipfile.BadZipFile: abort(400)
        return register_upload(user,data,kind,fmt,"third-party",Path(filename).stem[:120],library=True)
    @app.post("/api/v1/library/folder")
    def library_folder():
        user,_=authenticate()
        return read_folder_upload(user,library=True)
    @app.post("/api/v1/library/items/<ident>/metadata")
    def library_metadata(ident):
        user,_=authenticate();data=body()
        if set(data)!={"description","license"}: abort(400)
        description,license_note=data["description"],data["license"]
        if not isinstance(description,str) or len(description)>1500 or not isinstance(license_note,str) or len(license_note)>300: abort(400)
        if any(ord(ch)<32 and ch not in "\n\r\t" or ord(ch)==127 for ch in description+license_note): abort(400)
        for value in (description,license_note): value.encode("utf-8","strict")
        with db(True) as c:
            row,meta=current(c,ident,user["role"])
            if user["role"]!="owner" and meta.get("uploadedBy")!=user["id"]: abort(403)
            meta.update(description=description,license=license_note.strip())
            c.execute("UPDATE releases SET meta=? WHERE id=?",(json_text(meta),row["id"]))
            audit(c,user["id"],"release.metadata",row["id"])
        return jsonify(item=meta)
    @app.post("/api/v1/library/items/<ident>/delete")
    def library_delete(ident):
        user,_=authenticate()
        with db(True) as c:
            row,meta=current(c,ident,user["role"])
            if user["role"]!="owner" and meta.get("uploadedBy")!=user["id"]: abort(403)
            c.execute("UPDATE items SET current_release=NULL WHERE id=?",(ident,))
            c.execute("DELETE FROM release_icon_search WHERE release_id IN (SELECT id FROM releases WHERE item_id=?)",(ident,))
            c.execute("DELETE FROM releases WHERE item_id=?",(ident,))
            c.execute("DELETE FROM items WHERE id=?",(ident,))
            audit(c,user["id"],"library.delete",ident)
        # Immutable blobs are retained for recovery; do not garbage-collect shared archives here.
        return Response(status=204)
    @app.post("/api/v1/library/items/<ident>/remove")
    def library_remove(ident):
        user,_=authenticate()
        with db(True) as c:
            row,meta=current(c,ident,user["role"])
            if user["role"]!="owner" and meta.get("uploadedBy")!=user["id"]: abort(403)
            c.execute("UPDATE items SET current_release=NULL WHERE id=?",(ident,))
            audit(c,user["id"],"release.withdraw",ident)
        return Response(status=204)
    @app.post("/api/v1/admin/items")
    def upload():
        user,_=authenticate(True)
        f=request.files.get("file")
        if f is None: abort(400)
        kind=request.form.get("kind");source=request.form.get("source")
        fmt=request.form.get("format")
        data=f.stream.read(60*MIB+1)
        fallback=Path(f.filename or "Icon pack").stem[:120]
        return register_upload(user,data,kind,fmt,source,fallback)
    @app.post("/api/v1/admin/svg-preview")
    @app.post("/api/v1/library/svg-preview")
    def svg_preview():
        authenticate(request.path.startswith("/api/v1/admin/"))
        request.max_content_length=MAX_SVG+16384
        file=request.files.get("file")
        if file is None: abort(400)
        png=rasterize_svg(file.stream.read(MAX_SVG+1))
        with Image.open(io.BytesIO(png)) as image:
            return jsonify(preview=png_preview(image.convert("RGBA"),49152))
    @app.post("/api/v1/admin/folder-pack")
    def folder_upload():
        user,_=authenticate(True)
        return read_folder_upload(user)
    def read_folder_upload(user,library=False):
        request.max_form_parts=2510
        metadata=request.files.get("metadata")
        if metadata is None: abort(400)
        raw=metadata.stream.read(MIB+1)
        if len(raw)>MIB: abort(413)
        try: info=json.loads(raw)
        except (ValueError,UnicodeError): abort(400)
        data=make_folder_pack(info,request.files.getlist("icons"))
        return register_upload(user,data,"iconpack","zip","deckforge" if library else request.form.get("source"),info["name"],library=library,folder=library)
    def register_upload(user,data,kind,fmt,source,fallback,library=False,folder=False):
        description=request.form.get("description","")[:1500]
        license_note=request.form.get("license","").strip()[:300]
        if not license_note and not library: raise ValueError("license or provenance required")
        for value in (description,license_note):
            value.encode("utf-8","strict")
        platform=request.form.get("platform","unknown")
        if platform not in PLATFORMS: abort(400)
        target=request.form.get("itemId","") if library else ""
        expected=request.form.get("expectedRelease","") if target else ""
        if target:
            valid_id(target);valid_id(expected)
            with db() as c:
                old,previous=current(c,target,user["role"])
            if user["role"]!="owner" and previous.get("uploadedBy")!=user["id"]: abort(403)
            if kind!="iconpack" or previous["kind"]!="iconpack" or old["id"]!=expected: abort(409)
        info=inspect_package(data,kind,fmt,source,fallback)
        if target:
            version=text(request.form.get("newVersion",""),40)
            if version==previous["version"]: abort(409)
            if re.fullmatch(r"[0-9]+(?:\.[0-9]+){1,3}",version) and re.fullmatch(r"[0-9]+(?:\.[0-9]+){1,3}",previous["version"]):
                if tuple(int(x) for x in version.split("."))<=tuple(int(x) for x in previous["version"].split(".")): abort(409)
            if info["version"]!=version:
                data=set_iconpack_version(data,version,previous["name"],info["author"])
                info=inspect_package(data,kind,fmt,source,fallback)
        if library:
            if folder or info["native"]:
                source="deckforge";platform="deckforge"
            else:
                platform="unknown"
        if target: source=previous["source"];platform=previous.get("platform","unknown")
        digest=sha(data);ident=(target or uid()) if library else request.form.get("itemId") or uid();valid_id(ident);release=uid()
        meta={k:info[k] for k in ("name","version","author","packageId","cover","tags","iconCount","packageProfile")}
        meta.update(id=ident,releaseId=release,kind=kind,source=source,platform=platform,visibility="private",format=fmt,
                    size=len(data),sha256=digest,description=description,license=license_note)
        if library:
            meta["packageFormat"]="deckforge" if folder else package_format_of(meta)
            if target:
                meta.update(visibility=previous["visibility"],libraryShared=bool(previous.get("libraryShared")))
                if previous.get("uploadedBy"): meta["uploadedBy"]=previous["uploadedBy"]
            else: meta.update(uploadedBy=user["id"],libraryShared=True)
        # Immutable blob first; a crash may leave an unreferenced blob, never a dangling release.
        with db(True) as c:
            existing=c.execute("SELECT * FROM items WHERE id=?",(ident,)).fetchone()
            if target:
                row,latest=current(c,ident,user["role"])
                if row["id"]!=expected or (user["role"]!="owner" and latest.get("uploadedBy")!=user["id"]): abort(409)
            if existing:
                if (existing["kind"],existing["source"],existing["package_id"])!=(kind,source,info["packageId"]): abort(409)
            else:
                c.execute("INSERT INTO items(id,kind,source,package_id) VALUES(?,?,?,?)",(ident,kind,source,info["packageId"]))
            if c.execute("SELECT 1 FROM releases WHERE item_id=? AND version=?",(ident,info["version"])).fetchone(): abort(409)
            store_blob(data,digest)
            c.execute("INSERT INTO releases(id,item_id,version,sha256,meta,previews,native,status) VALUES(?,?,?,?,?,?,?,?)",
                      (release,ident,info["version"],digest,json_text(meta),json_text(info["previews"]),int(info["native"]),"published" if library else "draft"))
            if library: c.execute("UPDATE items SET current_release=? WHERE id=?",(release,ident))
            if kind=="iconpack":
                c.execute("INSERT INTO release_icon_search VALUES(?,?)",(release,search_fold(info["searchTerms"])))
            audit(c,user["id"],"release.update" if target else "release.upload",release)
        return jsonify(item=meta,status="published" if library else "draft"),201
    @app.get("/api/v1/admin/items")
    def admin_items():
        authenticate(True)
        cursor=request.args.get("cursor","")
        if cursor: valid_id(cursor)
        with db() as c:
            rows=c.execute("SELECT r.*,i.current_release FROM releases r JOIN items i ON i.id=r.item_id WHERE r.id>? ORDER BY r.id LIMIT 21",(cursor,)).fetchall()
        return jsonify(items=[dict(item=json.loads(x["meta"]),status=x["status"],current=x["current_release"]==x["id"]) for x in rows[:20]],
                       nextCursor=rows[19]["id"] if len(rows)>20 else "")
    def admin_release(c,release):
        row=c.execute("SELECT * FROM releases WHERE id=?",(valid_id(release),)).fetchone()
        if not row: abort(404)
        return row,json.loads(row["meta"])
    @app.get("/api/v1/admin/items/<ident>/releases")
    def release_history(ident):
        authenticate(True)
        valid_id(ident)
        cursor=request.args.get("cursor","")
        if cursor: valid_id(cursor)
        with db() as c:
            item=c.execute("SELECT current_release FROM items WHERE id=?",(ident,)).fetchone()
            if item is None: abort(404)
            rows=c.execute("SELECT id,version,sha256,status,meta FROM releases WHERE item_id=? AND id>? ORDER BY id LIMIT 21",(ident,cursor)).fetchall()
        releases=[]
        for row in rows[:20]:
            meta=json.loads(row["meta"])
            releases.append(dict(releaseId=row["id"],version=row["version"],sha256=row["sha256"],
                status=row["status"],visibility=meta["visibility"],current=row["id"]==item["current_release"],
                signed=bool(meta.get("signature")),size=meta["size"]))
        return jsonify(releases=releases,nextCursor=rows[19]["id"] if len(rows)>20 else "")
    @app.post("/api/v1/admin/releases/<release>/metadata")
    def edit_metadata(release):
        user,_=authenticate(True);data=body()
        if set(data) not in ({"description","license"},{"description","license","platform"}): abort(400)
        if "platform" in data and (not isinstance(data["platform"],str) or data["platform"] not in PLATFORMS): abort(400)
        description,license_note=data["description"],data["license"]
        if not isinstance(description,str) or len(description)>1500: abort(400)
        if not isinstance(license_note,str) or not license_note.strip() or len(license_note)>300: abort(400)
        if any(ord(ch)<32 and ch not in "\n\r\t" or ord(ch)==127 for ch in description+license_note): abort(400)
        for value in (description,license_note): value.encode("utf-8","strict")
        with db(True) as c:
            row,meta=admin_release(c,release)
            meta.update(description=description,license=license_note.strip())
            if "platform" in data: meta["platform"]=data["platform"]
            c.execute("UPDATE releases SET meta=? WHERE id=?",(json_text(meta),release))
            audit(c,user["id"],"release.metadata",release)
        return jsonify(item=meta)
    @app.get("/api/v1/admin/releases/<release>")
    def admin_detail(release):
        authenticate(True)
        with db() as c: row,meta=admin_release(c,release)
        return jsonify(item=meta,previews=json.loads(row["previews"]),status=row["status"])
    @app.get("/api/v1/admin/releases/<release>/download")
    def admin_download(release):
        authenticate(True)
        with db() as c: row,meta=admin_release(c,release)
        return package_response(row,meta)
    @app.post("/api/v1/admin/releases/<release>/classification")
    def classify(release):
        user,_=authenticate(True);data=body()
        purposes,names,designs=PURPOSES,NAMING,DESIGNS
        purpose,naming,styles=data.get("purpose"),data.get("naming"),data.get("styles")
        if (not isinstance(purpose,str) or purpose not in purposes or not isinstance(naming,list) or not naming
            or not isinstance(styles,list) or not styles or len(naming)>3 or len(styles)>9
            or any(not isinstance(x,str) or x not in names for x in naming)
            or any(not isinstance(x,str) or x not in designs for x in styles)): abort(400)
        if ("general-name" in naming and len(set(naming))>1) or ("unknown" in styles and len(set(styles))>1): abort(400)
        with db(True) as c:
            row,meta=admin_release(c,release)
            if meta["kind"]!="iconpack": abort(400)
            meta["tags"]=[purpose,*dict.fromkeys(naming),*dict.fromkeys(styles)]
            c.execute("UPDATE releases SET meta=? WHERE id=?",(json_text(meta),release))
            audit(c,user["id"],"release.classify",release)
        return jsonify(item=meta)
    @app.get("/api/v1/admin/releases/<release>/signing-request")
    def signing_request(release):
        authenticate(True)
        with db() as c: row,meta=admin_release(c,release)
        if row["status"]!="published" or not row["native"] or meta["source"]!="deckforge": abort(403)
        document={"origin":origin,"item":{k:meta[k] for k in ("id","releaseId","kind","packageId","name","version","format","size","sha256","source","visibility")}}
        return send_file(io.BytesIO(json_text(document).encode("utf-8")),mimetype="application/json",as_attachment=True,download_name=release+".signing-request.json",conditional=False)
    @app.post("/api/v1/admin/releases/<release>/signature")
    def import_signature(release):
        user,_=authenticate(True);data=body()
        with db(True) as c:
            row,meta=admin_release(c,release)
            if row["status"]!="published" or not row["native"] or meta["source"]!="deckforge": abort(403)
            meta["signature"]=verify_document(origin,meta,data)
            c.execute("UPDATE releases SET meta=? WHERE id=?",(json_text(meta),release))
            audit(c,user["id"],"release.signature-import",release)
        return jsonify(item=meta)
    @app.post("/api/v1/admin/releases/<release>/publish")
    def publish(release):
        user,_=authenticate(True);data=body()
        visibility=data.get("visibility")
        if data.get("reviewed") is not True or visibility not in ("private","public"): abort(400)
        with db(True) as c:
            row=c.execute("SELECT * FROM releases WHERE id=?",(valid_id(release),)).fetchone()
            if not row: abort(404)
            meta=json.loads(row["meta"])
            if meta["source"]=="third-party" and visibility!="private": abort(403)
            if meta["kind"]=="plugin" and visibility=="public" and (not row["native"] or meta["source"]!="deckforge"): abort(403)
            # Validate before changing either release or current pointer. Failed checks roll back.
            verified_package(row,meta)
            previous=c.execute("SELECT current_release FROM items WHERE id=?",(row["item_id"],)).fetchone()["current_release"]
            restoring=row["status"]=="published" and previous!=release
            if meta["visibility"]!=visibility: meta.pop("signature",None)
            meta["visibility"]=visibility
            c.execute("UPDATE releases SET status='published',meta=? WHERE id=?",(json_text(meta),release))
            c.execute("UPDATE items SET current_release=? WHERE id=?",(release,row["item_id"]))
            audit(c,user["id"],"release.restore" if restoring else "release.publish",release)
        return jsonify(item=meta)
    @app.post("/api/v1/admin/items/<ident>/withdraw")
    def withdraw(ident):
        user,_=authenticate(True)
        with db(True) as c:
            if not c.execute("UPDATE items SET current_release=NULL WHERE id=?",(valid_id(ident),)).rowcount: abort(404)
            audit(c,user["id"],"item.withdraw",ident)
        return Response(status=204)
    @app.get("/")
    def index(): return send_file(Path(__file__).parent/"web/index.html",mimetype="text/html")
    @app.get("/assets/app.js")
    def js(): return send_file(Path(__file__).parent/"web/app.js",mimetype="application/javascript")
    @app.get("/assets/style.css")
    def css(): return send_file(Path(__file__).parent/"web/style.css",mimetype="text/css")
    def bootstrap(username,password):
        return account_create(username,password,"owner","bootstrap")
    def sign_release(release,keyfile):
        # Explicit offline/admin CLI only; never accept private signing keys over HTTP.
        key=serialization.load_pem_private_key(Path(keyfile).read_bytes(),password=None)
        if not isinstance(key,Ed25519PrivateKey): raise ValueError("Ed25519 required")
        with db(True) as c:
            row=c.execute("SELECT * FROM releases WHERE id=? AND status='published'",(release,)).fetchone()
            if not row or not row["native"]: raise ValueError("reviewed native release required")
            meta=json.loads(row["meta"])
            if meta["source"]!="deckforge" or meta["kind"]!="plugin": raise ValueError("own native release required")
            data=(blobs/row["sha256"]).read_bytes()
            document=sign_document(origin,meta,data,key)
            meta["signature"]=verify_document(origin,meta,document)
            c.execute("UPDATE releases SET meta=? WHERE id=?",(json_text(meta),release))
            audit(c,"local-cli","release.sign",release)
        return meta["signature"]["keyId"]
    app.extensions["store_bootstrap"]=bootstrap
    app.extensions["store_sign"]=sign_release
    return app

if __name__=="__main__":
    app=create_app()
    if len(sys.argv)==3 and sys.argv[1]=="create-owner":
        password=getpass.getpass("Owner password: ")
        if password!=getpass.getpass("Repeat password: "): raise SystemExit("password mismatch")
        print(app.extensions["store_bootstrap"](sys.argv[2],password))
    elif len(sys.argv)==4 and sys.argv[1]=="sign-release":
        print(app.extensions["store_sign"](sys.argv[2],sys.argv[3]))
    else: raise SystemExit("Use create-owner USER or sign-release RELEASE PRIVATE_KEY; run HTTP with gunicorn.")
