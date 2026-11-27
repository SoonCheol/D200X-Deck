"""Real desktop StoreClient against an ephemeral loopback HTTPS server.
No NAS, production credentials, permanent trust change or external host."""
import datetime
import io
import json
import os
import subprocess
import tempfile
import threading
import unittest
from ipaddress import ip_address
from pathlib import Path
from cryptography import x509
from cryptography.hazmat.primitives import hashes,serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from werkzeug.serving import make_server
from server import create_app
from test_store import pack,PASSWORD

def create_certificate(directory):
    key=rsa.generate_private_key(public_exponent=65537,key_size=2048)
    name=x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,"DeckForge isolated test")])
    now=datetime.datetime.now(datetime.timezone.utc)
    cert=(x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
          .serial_number(x509.random_serial_number()).not_valid_before(now-datetime.timedelta(minutes=1))
          .not_valid_after(now+datetime.timedelta(days=1))
          .add_extension(x509.BasicConstraints(ca=True,path_length=0),critical=True)
          .add_extension(x509.SubjectAlternativeName([x509.IPAddress(ip_address("127.0.0.1"))]),critical=False)
          .sign(key,hashes.SHA256()))
    certpath=directory/"tls-cert.pem";keypath=directory/"tls-key.pem"
    certpath.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    keypath.write_bytes(key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()))
    return certpath,keypath

class LiveClientTest(unittest.TestCase):
    def test_real_https_client(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);cert,key=create_certificate(root)
            server=make_server("127.0.0.1",0,lambda env,start:[],threaded=True,ssl_context=(str(cert),str(key)))
            origin=f"https://127.0.0.1:{server.server_port}"
            app=create_app(root/"server",origin)
            app.extensions["store_bootstrap"]("owner",PASSWORD)
            browser=app.test_client()
            response=browser.post("/api/v1/auth/login",json=dict(username="owner",password=PASSWORD,client="desktop"))
            headers={"Authorization":"Bearer "+response.json["accessToken"]}
            package=pack()
            response=browser.post("/api/v1/admin/items",headers=headers,data={"file":(io.BytesIO(package),"icons.zip"),"kind":"iconpack","format":"zip","source":"third-party","license":"test"})
            self.assertEqual(response.status_code,201)
            item=response.json["item"]
            self.assertEqual(browser.post("/api/v1/admin/releases/"+item["releaseId"]+"/publish",headers=headers,json={"reviewed":True,"visibility":"private"}).status_code,200)
            server.app=app
            thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            try:
                client_path=Path(__file__).resolve().parents[2]/"app/deckforge-editor/store-client.cjs"
                script=Path(__file__).with_name("live_client.cjs")
                args=["node",str(script),str(client_path),str(root/"desktop"),origin]
                env=os.environ.copy()
                env.pop("NODE_TLS_REJECT_UNAUTHORIZED",None)
                env.pop("NODE_EXTRA_CA_CERTS",None)
                # Same client and endpoint must fail without the independently supplied test CA.
                subprocess.run(args+["reject"],env=env,check=True,timeout=25)
                env["NODE_EXTRA_CA_CERTS"]=str(cert)
                subprocess.run(args+["accept"],env=env,check=True,timeout=45)
            finally:
                server.shutdown();thread.join(timeout=5);server.server_close()

if __name__=="__main__":unittest.main()
