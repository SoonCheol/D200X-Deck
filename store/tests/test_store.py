import hashlib
import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from PIL import Image
from server import create_app
from package_inspector import inspect_package

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
if __name__=="__main__": unittest.main()
