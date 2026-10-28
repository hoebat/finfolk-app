"""Import checksum-pinned public source responses; never trust a transfer as provenance."""
import argparse
import hashlib
import json
import tempfile
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path
from depth_explorer.acquire import save_contours
from depth_explorer.catalog import REGIONS
from depth_explorer.store import Store


def review_records():
    return json.loads((Path(__file__).resolve().parents[1]/"metadata/coastal-expansion-review.json").read_text())


def seed(store, path, expected_sha):
    if hashlib.sha256(Path(path).read_bytes()).hexdigest() != expected_sha:
        raise ValueError("Source transfer checksum mismatch")
    review=review_records()
    expected={item["region"]:item for item in review["contours"]}
    with zipfile.ZipFile(path) as archive:
        regions=sorted({name.split("/")[0] for name in archive.namelist()} - {"national"})
        for region in regions:
            if region not in REGIONS or region not in expected:
                raise ValueError("Unknown source transfer region")
            info=archive.getinfo(region+"/original.geojson")
            if info.file_size>256*1024**2:
                raise ValueError("Source response exceeds import limit")
            raw=archive.read(info)
            if hashlib.sha256(raw).hexdigest()!=expected[region]["raw_sha256"]:
                raise ValueError("Original government response checksum mismatch")
            collection=json.loads(raw)
            if len(collection["features"])!=expected[region]["feature_count"]:
                raise ValueError("Original government response feature count mismatch")
            metadata=json.loads(archive.read(region+"/service.json"))
            actual={item["url"] for item in metadata["layers"]}
            configured=set(REGIONS[region].get("contour_services",[REGIONS[region]["contour_service"]]))
            if actual!=configured:
                raise ValueError("Source transfer publisher does not match registry")
            save_contours(store,region,collection,metadata)
            print(region+": imported checksum-verified government source response",flush=True)
        cache=Path(".cache/national")
        for item in archive.infolist():
            parts=Path(item.filename).parts
            if len(parts)==2 and parts[0]=="national" and Path(parts[1]).suffix in [".json",".xml",".geojson"]:
                if item.file_size>80*1024**2:raise ValueError("National cache entry exceeds import limit")
                cache.mkdir(parents=True,exist_ok=True)
                target=cache/parts[1]
                if not target.exists():target.write_bytes(archive.read(item))


if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--url",required=True)
    parser.add_argument("--sha256",required=True)
    parser.add_argument("--data",default="datasets")
    parser.add_argument("--regions",nargs="+",required=True)
    args=parser.parse_args()
    expected={item["region"]:item for item in review_records()["contours"]}
    current=Store(args.data).load()["contours"]
    if all(region in current and current[region]["sha256"]==expected[region]["raw_sha256"] for region in args.regions):
        print("Checksum-verified source archives already available")
        raise SystemExit(0)
    url=urllib.parse.urlsplit(args.url)
    if url.scheme!="https" or url.username or url.password:
        parser.error("Source transfers require credential-free HTTPS")
    with tempfile.TemporaryDirectory() as temp:
        path=Path(temp)/"sources.zip"
        request=urllib.request.Request(args.url,headers={"User-Agent":"ShoreDepthExplorer/1.0","bypass-tunnel-reminder":"true"})
        with urllib.request.urlopen(request,timeout=120) as response,path.open("wb") as output:
            size=0
            while chunk:=response.read(1024**2):
                size+=len(chunk)
                if size>80*1024**2:raise ValueError("Source transfer exceeds download limit")
                output.write(chunk)
        seed(Store(args.data),path,args.sha256)
