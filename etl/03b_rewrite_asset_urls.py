# etl/03b_rewrite_asset_urls.py
import csv, pathlib

# Project root is one level up from the "etl" folder
ROOT = pathlib.Path(__file__).resolve().parents[1]
IN   = ROOT / "data" / "processed" / "entity_assets.csv"
OUT  = ROOT / "data" / "processed" / "entity_assets.csv"  # overwrite in place

rows = []
with IN.open("r", encoding="utf-8", newline="") as f:
    r = csv.DictReader(f)
    for rec in r:
        p = pathlib.Path(rec["url"])
        try:
            rel = p.relative_to(ROOT).as_posix()   # relative to project root
        except ValueError:
            rel = p.as_posix().split("/HanziDex/")[-1]
        rec["url"] = "/" + rel                    # /data/30_strokes/hanzi_writer_data/data/一.json
        rows.append(rec)

with OUT.open("w", encoding="utf-8", newline="") as f:
    w = csv.DictWriter(f, fieldnames=r.fieldnames)
    w.writeheader()
    w.writerows(rows)

print("Rewrote URLs to project-relative paths.")
