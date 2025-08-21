# etl/02_ccd_to_csv.py
import csv, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW  = ROOT / "data" / "20_decomposition" / "ChineseCharactersDecomposition.tsv"
CLEAN= ROOT / "data" / "20_decomposition" / "ccd_clean.tsv"  # <-- use this if it exists
SRC  = CLEAN if CLEAN.exists() else RAW

OUT  = ROOT / "data" / "processed"
OUT.mkdir(parents=True, exist_ok=True)

NEEDED = ["Component","LeftComponent","RightComponent"]

def looks_cjk(ch: str) -> bool:
    return len(ch) == 1 and (
        0x3400 <= ord(ch) <= 0x9FFF or
        0xF900 <= ord(ch) <= 0xFAFF
    )

rows = []

# If we're reading the cleaned file, treat it as a true TSV with a real header
if SRC == CLEAN:
    with SRC.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f, delimiter="\t")
        if not reader.fieldnames:
            print("ERROR: no header found in ccd_clean.tsv")
            sys.exit(1)

        # Some editors write a BOM on the first fieldname; strip it
        reader.fieldnames = [fn.lstrip("\ufeff") for fn in reader.fieldnames]

        missing = [c for c in NEEDED if c not in reader.fieldnames]
        if missing:
            print("ERROR: missing expected columns:", missing)
            print("Found headers:", reader.fieldnames)
            sys.exit(1)

        for rec in reader:
            ch = (rec.get("Component") or "").strip()
            if not looks_cjk(ch):
                continue

            comps = []
            for col in ("LeftComponent","RightComponent"):
                cell = (rec.get(col) or "").strip("[](){}<>").strip()
                if not cell or cell in ("*", "-"):
                    continue
                for tok in re.split(r"\s+", cell):
                    tok = tok.strip("[](){}<>")
                    if looks_cjk(tok) and tok != ch:
                        comps.append(tok)

            for pos, part in enumerate(comps, start=1):
                rows.append({
                    "hanzi": ch,
                    "part_symbol": part,
                    "relation": "component",
                    "position": pos
                })

# Otherwise, parse the raw wiki file: walk ALL <pre> blocks (first = header-only, second = data)
else:
    in_pre = False
    have_header = False
    col_index = {}
    HEADER = ["Component","Strokes","CompositionType","LeftComponent","LeftStrokes",
              "RightComponent","RightStrokes","Signature","Notes","Section"]

    with SRC.open("r", encoding="utf-8", newline="") as f:
        for raw in f:
            line = raw.rstrip("\n")

            if "<pre>" in line:
                in_pre = True
                have_header = False
                col_index = {}
                continue
            if "</pre>" in line:
                in_pre = False
                continue
            if not in_pre or not line.strip():
                continue

            if not have_header:
                cols = [c.lstrip("\ufeff").strip() for c in line.split("\t")]
                if cols[:len(HEADER)] == HEADER:
                    col_index = {name: i for i, name in enumerate(cols)}
                    have_header = True
                continue

            parts = line.split("\t")
            if len(parts) < len(col_index):
                continue

            def get(name: str) -> str:
                i = col_index.get(name, -1)
                return parts[i].strip() if 0 <= i < len(parts) else ""

            ch = get("Component")
            if not looks_cjk(ch):
                continue

            comps = []
            for col in ("LeftComponent","RightComponent"):
                cell = get(col).strip("[](){}<>")
                if not cell or cell in ("*", "-"):
                    continue
                for tok in re.split(r"\s+", cell):
                    tok = tok.strip("[](){}<>")
                    if looks_cjk(tok) and tok != ch:
                        comps.append(tok)

            for pos, part in enumerate(comps, start=1):
                rows.append({
                    "hanzi": ch,
                    "part_symbol": part,
                    "relation": "component",
                    "position": pos
                })

out_path = OUT / "character_parts.csv"
with out_path.open("w", encoding="utf-8", newline="") as w:
    writer = csv.DictWriter(w, fieldnames=["hanzi","part_symbol","relation","position"])
    writer.writeheader()
    writer.writerows(rows)

print(f"Source: {SRC}")
print(f"Wrote: {out_path} rows: {len(rows)}")
