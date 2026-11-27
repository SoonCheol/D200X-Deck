"""Offline read-only validation of a stopped service or separate backup copy."""
import argparse
import hashlib
import json
import re
import sqlite3
from pathlib import Path

def verify_data(directory):
    root=Path(directory).resolve(strict=True)
    database=root/"store.sqlite3"
    blobs=root/"blobs"
    if not database.is_file() or database.is_symlink() or not blobs.is_dir() or blobs.is_symlink():
        raise ValueError("database or blob directory missing/unsafe")
    # mode=ro includes a retained WAL, if present; never open an empty replacement DB.
    with sqlite3.connect(database.as_uri()+"?mode=ro",uri=True) as c:
        c.row_factory=sqlite3.Row
        c.execute("PRAGMA query_only=ON")
        if [r[0] for r in c.execute("PRAGMA integrity_check")]!=["ok"]:
            raise ValueError("SQLite integrity check failed")
        if c.execute("PRAGMA foreign_key_check").fetchone():
            raise ValueError("SQLite foreign key check failed")
        if c.execute("""SELECT 1 FROM items i LEFT JOIN releases r ON r.id=i.current_release
                        WHERE i.current_release IS NOT NULL AND
                        (r.id IS NULL OR r.item_id!=i.id OR r.status!='published')""").fetchone():
            raise ValueError("invalid current release pointer")
        checked={}
        count=0
        for row in c.execute("SELECT r.*,i.kind,i.source,i.package_id FROM releases r JOIN items i ON i.id=r.item_id"):
            meta=json.loads(row["meta"])
            digest=row["sha256"];size=meta.get("size")
            if not re.fullmatch(r"[a-f0-9]{64}",digest) or type(size) is not int or not 0<size<=60*1024*1024:
                raise ValueError("invalid release digest or size")
            expected={"id":row["item_id"],"releaseId":row["id"],"version":row["version"],"sha256":digest,
                      "kind":row["kind"],"source":row["source"],"packageId":row["package_id"]}
            if any(meta.get(k)!=v for k,v in expected.items()):
                raise ValueError("release metadata mismatch: "+row["id"])
            if meta.get("visibility") not in ("private","public") or (row["source"]=="third-party" and meta["visibility"]!="private"):
                raise ValueError("release visibility mismatch")
            if digest not in checked:
                file=blobs/digest
                if file.is_symlink() or not file.is_file() or file.stat().st_size!=size:
                    raise ValueError("blob missing or invalid size: "+digest)
                h=hashlib.sha256()
                with file.open("rb") as stream:
                    for chunk in iter(lambda:stream.read(1024*1024),b""):
                        h.update(chunk)
                if h.hexdigest()!=digest: raise ValueError("blob hash mismatch: "+digest)
                checked[digest]=size
            elif checked[digest]!=size: raise ValueError("inconsistent blob size")
            count+=1
        return {"ok":True,"releases":count,"verifiedBlobs":len(checked)}

if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory")
    args=parser.parse_args()
    try: print(json.dumps(verify_data(args.directory)))
    except (OSError,ValueError,sqlite3.Error,TypeError,KeyError) as exc:
        raise SystemExit("verification failed: "+str(exc))
