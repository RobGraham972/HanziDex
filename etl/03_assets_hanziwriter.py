import csv, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parents[1]
HW_ROOT = ROOT / "data" / "30_strokes" / "hanzi_writer_data"
DATA_DIR = HW_ROOT / "data"  # hanzi-writer-data/data/
OUT = ROOT / "data" / "processed"
OUT.mkdir(parents=True, exist_ok=True)

HEX_RE = re.compile(r"^[0-9a-fA-F]{4,6}$")

# Include broader CJK ranges (radicals + extensions)
def looks_cjk(ch: str) -> bool:
    if len(ch) != 1:
        return False
    cp = ord(ch)
    ranges = [
        (0x2E80, 0x2EFF),  # CJK Radicals Supplement
        (0x2F00, 0x2FDF),  # Kangxi Radicals
        (0x3400, 0x4DBF),  # CJK Ext A
        (0x4E00, 0x9FFF),  # CJK Unified Ideographs
        (0xF900, 0xFAFF),  # CJK Compatibility Ideographs
        (0x20000, 0x2A6DF), # Ext B
        (0x2A700, 0x2B73F), # Ext C
        (0x2B740, 0x2B81F), # Ext D
        (0x2B820, 0x2CEAF), # Ext E
        (0x2CEB0, 0x2EBEF), # Ext F
        (0x30000, 0x3134F), # Ext G
        (0x31350, 0x323AF), # Ext H
    ]
    return any(lo <= cp <= hi for lo, hi in ranges)

def hex_to_char(stem: str):
    try:
        return chr(int(stem, 16))
    except Exception:
        return None

rows = []
scanned = 0

# Prefer scanning the repo's data directory (where JSONs live)
candidates = []
if DATA_DIR.exists():
    candidates = list(DATA_DIR.rglob("*.json"))
else:
    # fallback: whole repo
    candidates = list(HW_ROOT.rglob("*.json"))

for p in candidates:
    scanned += 1
    name = p.name

    # Skip aggregate/non-character files
    if name.lower() in ("package.json", "all.json"):
        continue

    base = name[:-5] if name.endswith(".json") else name

    # Try character filename
    ch = base if (len(base) == 1 and looks_cjk(base)) else None

    # Try hex filename fallback (e.g., 4e00.json)
    if ch is None and HEX_RE.match(base):
        ch = hex_to_char(base.lower())

    if ch is None:
        continue

    rows.append({
        "entity_kind": "character",
        "key": ch,
        "kind": "stroke_json",
        "url": p.as_posix(),  # swap to CDN/static URL later
        "source": "hanzi-writer-data",
        "license": "APL"
    })

out_path = OUT / "entity_assets.csv"
with out_path.open("w", encoding="utf-8", newline="") as w:
    writer = csv.DictWriter(w, fieldnames=["entity_kind","key","kind","url","source","license"])
    writer.writeheader()
    writer.writerows(rows)

print(f"Scanned JSON files: {scanned}")
print(f"Wrote: {out_path} rows: {len(rows)}")
