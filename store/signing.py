"""Offline signing tool. The NAS HTTP process never receives a private key."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey,Ed25519PublicKey
from package_inspector import inspect_package

FIELDS=("id","releaseId","kind","packageId","name","version","format","size","sha256","source","visibility")
def signature_payload(origin,item):
    return json.dumps(["DeckForge Store release v1",origin,*[item[k] for k in FIELDS]],
                      ensure_ascii=False,separators=(",",":")).encode("utf-8")
def sha(data):return hashlib.sha256(data).hexdigest()
def verify_document(origin,item,document):
    try:
        if not isinstance(document,dict) or set(document)!={"publicKey","signature"}:raise ValueError("signature document")
        pem=document["publicKey"]
        if not isinstance(pem,str) or len(pem)>2048:raise ValueError("public key")
        key=serialization.load_pem_public_key(pem.encode("ascii"))
        if not isinstance(key,Ed25519PublicKey):raise ValueError("Ed25519 required")
        sig=document["signature"]
        if not isinstance(sig,dict) or set(sig)!={"keyId","value"}:raise ValueError("signature format")
        der=key.public_bytes(serialization.Encoding.DER,serialization.PublicFormat.SubjectPublicKeyInfo)
        value=base64.b64decode(sig["value"],validate=True)
        if sig["keyId"]!=sha(der) or len(value)!=64 or base64.b64encode(value).decode("ascii")!=sig["value"]:raise ValueError("signature identity")
        key.verify(value,signature_payload(origin,item))
        return sig
    except (TypeError,KeyError,UnicodeError,InvalidSignature,ValueError) as exc:
        raise ValueError("release signature does not verify") from exc
def sign_document(origin,item,data,key):
    if not isinstance(key,Ed25519PrivateKey) or item["kind"]!="plugin" or item["source"]!="deckforge" or item["format"]!="deckforgePlugin":
        raise ValueError("own native package and Ed25519 key required")
    if len(data)!=item["size"] or sha(data)!=item["sha256"]:raise ValueError("archive mismatch")
    info=inspect_package(data,"plugin","deckforgePlugin","deckforge",item["name"])
    if not info["native"] or any(info[k]!=item[k] for k in ("name","version","packageId")):raise ValueError("archive identity mismatch")
    pub=key.public_key()
    der=pub.public_bytes(serialization.Encoding.DER,serialization.PublicFormat.SubjectPublicKeyInfo)
    pem=pub.public_bytes(serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo).decode("ascii")
    return {"publicKey":pem,"signature":{"keyId":sha(der),"value":base64.b64encode(key.sign(signature_payload(origin,item))).decode("ascii")}}
if __name__=="__main__":
    parser=argparse.ArgumentParser(description="Sign an independently reviewed DeckForge native release offline")
    parser.add_argument("request",type=Path);parser.add_argument("package",type=Path);parser.add_argument("private_key",type=Path);parser.add_argument("output",type=Path)
    args=parser.parse_args()
    if args.request.stat().st_size>16384 or args.package.stat().st_size>1024*1024 or args.private_key.stat().st_size>16384:
        raise SystemExit("file size limit")
    request=json.loads(args.request.read_text(encoding="utf-8"))
    key=serialization.load_pem_private_key(args.private_key.read_bytes(),password=None)
    document=sign_document(request["origin"],request["item"],args.package.read_bytes(),key)
    with args.output.open("x",encoding="utf-8") as f:json.dump(document,f,ensure_ascii=False)
    print("Public key SHA256:",document["signature"]["keyId"])
