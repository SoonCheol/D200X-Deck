import hashlib
import io
import json
import tempfile
import unittest
import zipfile
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
        for paths in [("../bad.png",),("x.svg",),("copy.png","COPY.png")]:
            self.assertEqual(self.c.post(endpoint,data=data(paths),headers=self.owner).status_code,400)
        self.assertEqual(self.c.post(endpoint,data=data(tags=["x"*61]),headers=self.owner).status_code,400)
        # Beyond the previous 16-part upload limit.
        result=self.c.post(endpoint,data=data(tuple("folder/icon"+str(i)+".png" for i in range(20))),headers=self.owner)
        self.assertEqual(result.status_code,201,result.json);self.assertEqual(result.json["item"]["iconCount"],20)
if __name__=="__main__": unittest.main()
