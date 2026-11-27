import hashlib
import io
import json
import tempfile
import unittest
import zipfile
import random
import shutil
import subprocess
from pathlib import Path
from PIL import Image
from server import create_app
from package_inspector import inspect_package
from signing import sign_document
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

ORIGIN="https://store.example.test"
PASSWORD="test-password-12345"
def pack(extra=None):
    out=io.BytesIO();png=io.BytesIO()
    Image.new("RGBA",(16,16),(255,255,255,255)).save(png,format="PNG")
    with zipfile.ZipFile(out,"w",zipfile.ZIP_DEFLATED) as z:
        z.writestr("manifest.json",json.dumps({"Name":"Test icons","Version":"1.0.0"}))
        z.writestr("icons.json",json.dumps([{"path":"lamp_on.png"},{"path":"lamp_off.png"}]))
        z.writestr("icons/lamp_on.png",png.getvalue());z.writestr("icons/lamp_off.png",png.getvalue())
        if extra:z.writestr(extra,b"bad")
    return out.getvalue()
class StoreTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.app=create_app(self.tmp.name,ORIGIN);self.app.testing=True
        self.app.extensions["store_bootstrap"]("owner",PASSWORD)
        self.c=self.app.test_client()
        self.owner=self.login("owner")
        self.c.post("/api/v1/admin/accounts",json={"username":"member","password":PASSWORD},headers=self.owner)
        self.member=self.login("member")
    def tearDown(self):self.tmp.cleanup()
    def login(self,name):
        r=self.c.post("/api/v1/auth/login",json=dict(username=name,password=PASSWORD,client="desktop"))
        self.assertEqual(r.status_code,200)
        return {"Authorization":"Bearer "+r.json["accessToken"]}
    def upload(self,source="third-party",data=None):
        return self.c.post("/api/v1/admin/items",data={"file":(io.BytesIO(data if data is not None else pack()),"icons.zip"),"kind":"iconpack","format":"zip","source":source,"license":"test license"},headers=self.owner)
    def test_acl_draft_publish_withdraw(self):
        uploaded=self.upload();self.assertEqual(uploaded.status_code,201)
        i=uploaded.json["item"];path="/api/v1/items/"+i["id"];download=path+"/releases/"+i["releaseId"]+"/download"
        self.assertEqual(self.c.get(path,headers=self.owner).status_code,404)
        self.assertEqual(self.c.get("/api/v1/catalog?kind=iconpack").status_code,401)
        publish="/api/v1/admin/releases/"+i["releaseId"]+"/publish"
        self.assertEqual(self.c.post(publish,json={"reviewed":True,"visibility":"public"},headers=self.owner).status_code,403)
        self.assertEqual(self.c.post(publish,json={"reviewed":True,"visibility":"private"},headers=self.owner).status_code,200)
        self.assertEqual(self.c.get("/api/v1/catalog?kind=iconpack",headers=self.member).json["items"],[])
        for method in ("GET","HEAD"):
            self.assertEqual(self.c.open(download,method=method,headers=self.member).status_code,404)
        self.assertEqual(self.c.get(path,headers=self.member).status_code,404)
        self.assertEqual(self.c.get(download,headers={**self.member,"Range":"bytes=0-4"}).status_code,404)
        detail=self.c.get(path,headers=self.owner).json
        self.assertTrue(detail["item"]["cover"]);self.assertEqual(len(detail["previews"]),2)
        self.assertIn("state",detail["item"]["tags"])
        got=self.c.get(download,headers=self.owner);self.assertEqual(hashlib.sha256(got.data).hexdigest(),i["sha256"])
        self.assertEqual(self.c.post(path.replace("/items/","/admin/items/")+"/withdraw",headers=self.owner,json={}).status_code,204)
        self.assertEqual(self.c.get(download,headers=self.owner).status_code,404)
        self.assertTrue((Path(self.tmp.name)/"blobs"/i["sha256"]).exists())
    def test_public_and_logout(self):
        i=self.upload("deckforge").json["item"]
        self.assertEqual(self.c.post("/api/v1/admin/releases/"+i["releaseId"]+"/publish",json={"reviewed":True,"visibility":"public"},headers=self.owner).status_code,200)
        self.assertEqual(len(self.c.get("/api/v1/catalog?kind=iconpack",headers=self.member).json["items"]),1)
        self.assertEqual(self.c.get("/api/v1/admin/accounts",headers=self.member).status_code,403)
        self.assertEqual(self.c.post("/api/v1/auth/logout",headers=self.member).status_code,204)
        self.assertEqual(self.c.get("/api/v1/me",headers=self.member).status_code,401)
    def test_zip_and_limits(self):
        self.assertEqual(self.upload(data=pack("../escape")).status_code,400)
        self.assertEqual(self.upload(data=b"bad").status_code,400)
        self.assertEqual(self.c.post("/api/v1/admin/items",headers=self.member).status_code,403)
    def test_web_csrf(self):
        web=self.app.test_client()
        payload=dict(username="owner",password=PASSWORD,client="web")
        self.assertEqual(web.post("/api/v1/auth/login",json=payload).status_code,403)
        self.assertEqual(web.post("/api/v1/auth/login",json=payload,headers={"Origin":ORIGIN,"X-DeckForge-CSRF":"1"},base_url=ORIGIN).status_code,200)
        self.assertEqual(web.post("/api/v1/admin/accounts",json={"username":"other","password":PASSWORD},base_url=ORIGIN).status_code,403)
        self.assertEqual(web.get("/api/v1/me",base_url=ORIGIN).status_code,200)
    def test_review_classification_and_restore(self):
        i=self.upload().json["item"];path="/api/v1/admin/releases/"+i["releaseId"]
        self.assertEqual(self.c.get(path,headers=self.member).status_code,403)
        self.assertEqual(self.c.get(path,headers=self.owner).status_code,200)
        self.assertEqual(self.c.get(path+"/download",headers=self.member).status_code,403)
        self.assertEqual(self.c.get(path+"/download",headers=self.owner).data,(Path(self.tmp.name)/"blobs"/i["sha256"]).read_bytes())
        revised=dict(purpose="ha",naming=["ha-name","state"],styles=["white","white-line"])
        self.assertEqual(self.c.post(path+"/classification",json=revised,headers=self.owner).json["item"]["tags"],["ha","ha-name","state","white","white-line"])
        self.assertEqual(self.c.post(path+"/classification",json={**revised,"styles":["unknown","white"]},headers=self.owner).status_code,400)
        self.assertEqual(self.c.post(path+"/publish",json={"reviewed":True,"visibility":"private"},headers=self.owner).status_code,200)
        # No active DB operations: copy DB + blob volume as a stopped-service backup.
        with tempfile.TemporaryDirectory() as destination:
            restored=Path(destination)/"restored";shutil.copytree(self.tmp.name,restored)
            app=create_app(restored,ORIGIN);client=app.test_client()
            self.assertEqual(client.get("/api/v1/items/"+i["id"],headers=self.owner).json["item"]["tags"],["ha","ha-name","state","white","white-line"])
            self.assertEqual(client.get("/api/v1/items/"+i["id"],headers=self.member).status_code,404)
    def test_native_signing_and_desktop_contract(self):
        native={"id":"com.deckforge.optional","name":"테스트 Native","version":"1.0.0","apiVersion":2}
        manifest={"format":"deckforge-plugin","formatVersion":2,"plugin":{k:native[k] for k in ("id","name","version")},
                  "runtime":{"type":"deckforge-sdk","directory":"payload","apiVersion":2},"source":{"kind":"deckforge"}}
        out=io.BytesIO()
        with zipfile.ZipFile(out,"w") as z:
            z.writestr("deckforge-plugin.json",json.dumps(manifest));z.writestr("payload/native.json",json.dumps(native))
        data=out.getvalue()
        result=self.c.post("/api/v1/admin/items",data={"file":(io.BytesIO(data),"native.deckforgePlugin"),"kind":"plugin","format":"deckforgePlugin","source":"deckforge","license":"test"},headers=self.owner)
        self.assertEqual(result.status_code,201);i=result.json["item"];path="/api/v1/admin/releases/"+i["releaseId"]
        self.assertEqual(self.c.get(path+"/signing-request",headers=self.owner).status_code,403)
        i=self.c.post(path+"/publish",json={"reviewed":True,"visibility":"private"},headers=self.owner).json["item"]
        request=json.loads(self.c.get(path+"/signing-request",headers=self.owner).data)
        key=Ed25519PrivateKey.generate();document=sign_document(request["origin"],request["item"],data,key)
        tampered={**document,"signature":{**document["signature"],"keyId":"0"*64}}
        self.assertEqual(self.c.post(path+"/signature",json=tampered,headers=self.owner).status_code,400)
        response=self.c.post(path+"/signature",json=document,headers=self.owner);self.assertEqual(response.status_code,200)
        # Exercise the actual desktop signature function against Python-issued signature.
        editor=Path(__file__).resolve().parents[2]/"app/deckforge-editor/store-client.cjs"
        script="""const fs=require('node:fs'),crypto=require('node:crypto'),vm=require('node:vm');
const src=fs.readFileSync(process.argv[1],'utf8');
const fn=vm.runInNewContext(src.slice(src.indexOf('function storeTrustKey('),src.indexOf('function verifyStoreBytes('))+';verifyStoreSignature',{Buffer,createHash:crypto.createHash,createPublicKey:crypto.createPublicKey,verify:crypto.verify});
const x=JSON.parse(fs.readFileSync(0,'utf8'));if(!fn(x.origin,x.item,{origin:x.origin,pem:x.pem}))process.exit(1);if(fn(x.origin,{...x.item,version:'2.0.0'},{origin:x.origin,pem:x.pem}))process.exit(2);"""
        subprocess.run(["node","-e",script,str(editor)],input=json.dumps({"origin":ORIGIN,"item":response.json["item"],"pem":document["publicKey"]}),text=True,check=True)
        self.assertNotIn("signature",self.c.post(path+"/publish",json={"reviewed":True,"visibility":"public"},headers=self.owner).json["item"])
    def test_release_conflict_and_account_revoke(self):
        original=pack();i=self.upload(data=original).json["item"]
        res=self.c.post("/api/v1/admin/items",data={"file":(io.BytesIO(original),"icons.zip"),"kind":"iconpack","format":"zip","source":"third-party","license":"test","itemId":i["id"]},headers=self.owner)
        self.assertEqual(res.status_code,409)
        member=self.c.get("/api/v1/me",headers=self.member).json["account"]
        self.assertEqual(self.c.post("/api/v1/admin/accounts/"+member["id"]+"/disable",headers=self.owner,json={}).status_code,204)
        self.assertEqual(self.c.get("/api/v1/me",headers=self.member).status_code,401)
    def test_folder_pack_and_tags(self):
        png=io.BytesIO();Image.new("RGBA",(16,16),(10,100,200,255)).save(png,format="PNG");image=png.getvalue()
        def data(paths=("win/copy.png","ha/lamp_on.png","ha/lamp_off.png"),tags=None):
            meta={"name":"내 아이콘","version":"1.2.0","author":"제작자","icons":[{"path":p,"tags":tags if tags is not None else ["복사","Windows"] if i==0 else []} for i,p in enumerate(paths)]}
            return {"metadata":(io.BytesIO(json.dumps(meta).encode()),"metadata.json"),"icons":[(io.BytesIO(image),p) for p in paths],"source":"deckforge","license":"own work"}
        endpoint="/api/v1/admin/folder-pack"
        self.assertEqual(self.c.post(endpoint,data=data(),headers=self.member).status_code,403)
        result=self.c.post(endpoint,data=data(),headers=self.owner)
        self.assertEqual(result.status_code,201,result.json)
        item=result.json["item"];self.assertEqual(item["name"],"내 아이콘");self.assertEqual(item["version"],"1.2.0");self.assertEqual(item["author"],"제작자")
        self.assertEqual(item["iconCount"],3);self.assertIn("state",item["tags"])
        path="/api/v1/admin/releases/"+item["releaseId"]
        downloaded=self.c.get(path+"/download",headers=self.owner).data
        with zipfile.ZipFile(io.BytesIO(downloaded)) as z:
            index=json.loads(z.read("icons.json"));self.assertEqual(index[0],{"path":"win/copy.png","name":"copy","tags":["복사","Windows"]})
            self.assertEqual(z.read("icons/win/copy.png"),image)
        archive=Path(self.tmp.name)/"client-read.zip";archive.write_bytes(downloaded)
        parser=Path(__file__).resolve().parents[2]/"app/deckforge-editor/icon-pack.cjs"
        script="""const assert=require('node:assert/strict'),fs=require('node:fs');
const {parseIconPack}=require(process.argv[1]);(async()=>{const p=await parseIconPack(fs.readFileSync(process.argv[2]));assert.equal(p.name,'내 아이콘');assert.equal(p.version,'1.2.0');assert.equal(p.author,'제작자');assert.equal(p.icons[0].name,'copy');assert.equal(p.icons[0].filename,'win/copy.png');assert.deepEqual(p.icons[0].tags,['복사','Windows']);assert.equal(p.icons.length,3);})().catch(e=>{console.error(e);process.exit(1)});"""
        subprocess.run(["node","-e",script,str(parser),str(archive)],check=True,timeout=20)
        for paths in [("../bad.png",),("x.svg",),("copy.png","COPY.png")]:
            self.assertEqual(self.c.post(endpoint,data=data(paths),headers=self.owner).status_code,400)
        self.assertEqual(self.c.post(endpoint,data=data(tags=["x"*61]),headers=self.owner).status_code,400)
        # Beyond the previous 16-part upload limit.
        result=self.c.post(endpoint,data=data(tuple("folder/icon"+str(i)+".png" for i in range(20))),headers=self.owner)
        self.assertEqual(result.status_code,201,result.json);self.assertEqual(result.json["item"]["iconCount"],20)
        # Multipart parser must handle multiple 64KiB chunks, not just toy fixtures.
        large=io.BytesIO()
        Image.frombytes("RGB",(256,256),random.Random(1).randbytes(256*256*3)).save(large,format="PNG")
        self.assertGreater(len(large.getvalue()),65536)
        request_data=data(("large.png",))
        request_data["icons"]=[(io.BytesIO(large.getvalue()),"large.png")]
        result=self.c.post(endpoint,data=request_data,headers=self.owner)
        self.assertEqual(result.status_code,201,result.json)
        # Existing single-file import still accepts a large multipart archive.
        archive=io.BytesIO()
        with zipfile.ZipFile(archive,"w") as z:z.writestr("large.png",large.getvalue())
        self.assertEqual(self.upload(data=archive.getvalue()).status_code,201)
    def test_static_svg_folder(self):
        svg=b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" fill="#ff0000"/></svg>'
        endpoint="/api/v1/admin/svg-preview"
        def preview(data,headers):
            return self.c.post(endpoint,data={"file":(io.BytesIO(data),"x.svg")},headers=headers)
        self.assertEqual(preview(svg,self.member).status_code,403)
        response=preview(svg,self.owner);self.assertEqual(response.status_code,200,response.json)
        import base64
        with Image.open(io.BytesIO(base64.b64decode(response.json["preview"]))) as image:
            self.assertEqual(image.convert("RGBA").getpixel((image.width//2,image.height//2)),(255,0,0,255))
        for body in (b'<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>'+svg,
                     svg.replace(b'<rect',b'<script/><rect'),
                     svg.replace(b'fill="#ff0000"',b'fill="url(http://example.test/a)"'),
                     svg.replace(b'<rect',b'<image href="file:///etc/passwd"/><rect'),
                     b'<?xml-stylesheet href="https://example.test/x"? >'+svg,
                     b'x'*(256*1024+1)):
            self.assertEqual(preview(body,self.owner).status_code,400)
        def upload(paths):
            meta={"name":"SVG","version":"1.0.0","icons":[{"path":p,"tags":["복사"]} for p in paths]}
            return self.c.post("/api/v1/admin/folder-pack",data={"metadata":(io.BytesIO(json.dumps(meta).encode()),"metadata.json"),
              "icons":[(io.BytesIO(svg),p) for p in paths],"source":"deckforge","license":"test"},headers=self.owner)
        result=upload(["win/copy.svg"]);self.assertEqual(result.status_code,201,result.json)
        item=result.json["item"]
        downloaded=self.c.get("/api/v1/admin/releases/"+item["releaseId"]+"/download",headers=self.owner).data
        with zipfile.ZipFile(io.BytesIO(downloaded)) as z:
            self.assertEqual(z.read("originals/win/copy.svg"),svg)
            self.assertEqual(json.loads(z.read("icons.json")),[{"path":"win/copy.png","name":"copy","tags":["복사"]}])
            self.assertTrue(z.read("icons/win/copy.png").startswith(b"\x89PNG"))
        archive=Path(self.tmp.name)/"svg-pack.zip";archive.write_bytes(downloaded)
        parser=Path(__file__).resolve().parents[2]/"app/deckforge-editor/icon-pack.cjs"
        script="const fs=require('node:fs');require(process.argv[1]).parseIconPack(fs.readFileSync(process.argv[2])).then(p=>{if(p.icons.length!==1||p.icons[0].filename!=='win/copy.png')process.exit(1)}).catch(e=>{console.error(e);process.exit(1)});"
        subprocess.run(["node","-e",script,str(parser),str(archive)],check=True,timeout=20)
        self.assertEqual(upload(["copy.svg","copy.png"]).status_code,400)
    def test_catalog_search_before_pagination(self):
        endpoint="/api/v1/catalog"
        def create(name,ident,source="deckforge",visibility="public",publish=True,tag=""):
            data=io.BytesIO()
            with zipfile.ZipFile(io.BytesIO(pack())) as original, zipfile.ZipFile(data,"w") as z:
                for n in original.namelist():
                    if n=="manifest.json": z.writestr(n,json.dumps({"Name":name,"Version":"1.0.0","Author":"ÜBER"}))
                    elif n=="icons.json": z.writestr(n,json.dumps([{"path":"lamp_on.png","tags":[tag]},{"path":"lamp_off.png"}]))
                    else: z.writestr(n,original.read(n))
            res=self.c.post("/api/v1/admin/items",data={"file":(io.BytesIO(data.getvalue()),"icons.zip"),"kind":"iconpack","format":"zip","source":source,"license":"test","itemId":ident},headers=self.owner)
            self.assertEqual(res.status_code,201,res.json)
            item=res.json["item"]
            if publish:
                self.assertEqual(self.c.post("/api/v1/admin/releases/"+item["releaseId"]+"/publish",json={"reviewed":True,"visibility":visibility},headers=self.owner).status_code,200)
            return item
        for i in range(21): create("Unrelated","a%02d"%i)
        create("Windows 100% 단축키","z01",tag="복사")
        create("Windows second","z02",tag="복사")
        create("Windows secret","z03","third-party","private",tag="복사")
        create("Windows draft","z04",publish=False,tag="복사")
        def query(headers=None,**args):
            return self.c.get(endpoint,query_string={"kind":"iconpack",**args},headers=headers or self.member)
        first=query(q="복사",limit=1,purpose="windows",naming="state",design="white")
        self.assertEqual(first.status_code,200)
        self.assertEqual([x["id"] for x in first.json["items"]],["z01"])
        self.assertEqual(first.json["nextCursor"],"z01")
        second=query(q="복사",limit=1,cursor=first.json["nextCursor"],purpose="windows")
        self.assertEqual([x["id"] for x in second.json["items"]],["z02"])
        self.assertEqual(second.json["nextCursor"],"")
        self.assertNotIn("searchTerms",first.json["items"][0])
        self.assertEqual([x["id"] for x in query(q="100%").json["items"]],["z01"])
        self.assertEqual([x["id"] for x in query(q="ＷＩＮＤＯＷＳ").json["items"]],["z01","z02"])
        self.assertEqual([x["id"] for x in query(self.owner,q="복사").json["items"]],["z01","z02","z03"])
        self.assertEqual(query(q="secret").json["items"],[])
        self.assertEqual(query(q="lamp_on.png",limit=1).json["items"][0]["id"],"a00")
        self.assertEqual(query(q="über",limit=1).json["items"][0]["id"],"a00")
        for args in ({"q":"x"*121},{"purpose":"unknown"},{"kind":"plugin","design":"white"}):
            self.assertEqual(query(**args).status_code,400)
    def test_metadata_and_release_history(self):
        first=self.upload("deckforge").json["item"]
        endpoint="/api/v1/admin/releases/"+first["releaseId"]
        history="/api/v1/admin/items/"+first["id"]+"/releases"
        self.assertEqual(self.c.get(history,headers=self.member).status_code,403)
        self.assertEqual(self.c.get(history,headers=self.owner).json["releases"][0]["status"],"draft")
        data={"description":"한글 설명 변경","license":"updated license"}
        self.assertEqual(self.c.post(endpoint+"/metadata",json=data,headers=self.member).status_code,403)
        self.assertEqual(self.c.post(endpoint+"/metadata",json={**data,"version":"2.0.0"},headers=self.owner).status_code,400)
        self.assertEqual(self.c.post(endpoint+"/metadata",json={**data,"license":" "},headers=self.owner).status_code,400)
        result=self.c.post(endpoint+"/metadata",json=data,headers=self.owner)
        self.assertEqual(result.status_code,200)
        self.assertEqual(result.json["item"]["sha256"],first["sha256"])
        self.assertEqual(result.json["item"]["name"],first["name"])
        self.assertEqual(result.json["item"]["description"],data["description"])
        self.assertEqual(self.c.post(endpoint+"/publish",json={"reviewed":True,"visibility":"public"},headers=self.owner).status_code,200)
        archive=io.BytesIO()
        with zipfile.ZipFile(io.BytesIO(pack())) as original,zipfile.ZipFile(archive,"w") as z:
            for name in original.namelist():
                z.writestr(name,json.dumps({"Name":"Test icons","Version":"2.0.0"}) if name=="manifest.json" else original.read(name))
        result=self.c.post("/api/v1/admin/items",data={"file":(io.BytesIO(archive.getvalue()),"icons.zip"),"kind":"iconpack","format":"zip","source":"deckforge","license":"test","itemId":first["id"]},headers=self.owner)
        self.assertEqual(result.status_code,201,result.json)
        second=result.json["item"]
        rows=self.c.get(history,headers=self.owner).json["releases"]
        self.assertEqual(len(rows),2)
        self.assertEqual([r["releaseId"] for r in rows if r["current"]],[first["releaseId"]])
        self.assertEqual([r["status"] for r in rows if r["releaseId"]==second["releaseId"]],["draft"])
        self.assertEqual(self.c.get("/api/v1/items/"+first["id"],headers=self.member).json["item"]["description"],data["description"])
        self.assertEqual(hashlib.sha256(self.c.get(endpoint+"/download",headers=self.owner).data).hexdigest(),first["sha256"])
        self.assertEqual(self.c.get("/api/v1/admin/items/missing/releases",headers=self.owner).status_code,404)
if __name__=="__main__": unittest.main()
