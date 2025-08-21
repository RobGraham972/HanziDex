import csv, re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
UNI = ROOT / "data" / "10_unihan"
OUT = ROOT / "data" / "processed"
OUT.mkdir(parents=True, exist_ok=True)

# Input files (from your progress listing)
f_irg   = UNI / "extracted" / "Unihan_IRGSources.txt"
f_read  = UNI / "extracted" / "Unihan_Readings.txt"
f_vars  = UNI / "extracted" / "Unihan_Variants.txt"

# Fallback if 'extracted' not present (you copied the .txt files too)
if not f_irg.exists():  f_irg  = UNI / "Unihan_IRGSources.txt"
if not f_read.exists(): f_read = UNI / "Unihan_Readings.txt"
if not f_vars.exists(): f_vars = UNI / "Unihan_Variants.txt"

hex_re = re.compile(r"^U\+([0-9A-F]{4,6})$")
def cp_to_char(cp_hex):
    try:
        return chr(int(cp_hex, 16))
    except:
        return None

# --- Parse IRGSources for kRSUnicode (radical.residual) and kTotalStrokes ---
radical_no = {}
stroke_count = {}

with f_irg.open("r", encoding="utf-8") as f:
    for line in f:
        if not line or line.startswith("#"): continue
        parts = line.strip().split("\t")
        if len(parts) < 3: continue
        cp, field, value = parts[0], parts[1], parts[2]
        m = hex_re.match(cp)
        if not m: continue
        ch = cp_to_char(m.group(1))
        if not ch: continue
        if field == "kRSUnicode":
            # value like "1.4" or multiple separated by ' ' -> take first
            first = value.split()[0]
            if "." in first:
                rad = first.split(".")[0]
                try: radical_no[ch] = int(rad)
                except: pass
        elif field == "kTotalStrokes":
            try:
                stroke_count[ch] = int(value)
            except:
                pass

# --- Readings: kMandarin, kCantonese, kJapaneseOn, kJapaneseKun, kKorean, kHanyuPinyin (extract pinyin after ':') ---
readings = []  # list of dicts rows
def add_reading(ch, script, pinyin, is_canonical=False, zhuyin=None):
    readings.append({
        "entity_kind": "character",
        "key": ch,
        "script": script,
        "pinyin": pinyin,
        "zhuyin": zhuyin or "",
        "is_canonical": "true" if is_canonical else "false"
    })

with f_read.open("r", encoding="utf-8") as f:
    last_script_seen = {}
    for line in f:
        if not line or line.startswith("#"): continue
        parts = line.strip().split("\t")
        if len(parts) < 3: continue
        cp, field, value = parts[0], parts[1], parts[2]
        m = hex_re.match(cp)
        if not m: continue
        ch = cp_to_char(m.group(1))
        if not ch: continue

        if field == "kMandarin":
            # Space-separated pinyins; first is canonical
            vals = value.split()
            if vals:
                add_reading(ch, "mandarin", vals[0], is_canonical=True)
                for v in vals[1:]:
                    add_reading(ch, "mandarin", v, is_canonical=False)
        elif field == "kCantonese":
            # Jyutping-like entries separated by spaces
            for v in value.split():
                add_reading(ch, "cantonese", v)
        elif field == "kJapaneseOn":
            for v in value.split():
                add_reading(ch, "japanese_on", v)
        elif field == "kJapaneseKun":
            for v in value.split():
                add_reading(ch, "japanese_kun", v)
        elif field == "kKorean":
            for v in value.split():
                add_reading(ch, "korean", v)
        elif field == "kHanyuPinyin":
            # Format like "10019.020:tiàn 10019.030:..." → pull the pinyin after ':'
            items = value.split()
            for it in items:
                if ":" in it:
                    p = it.split(":")[1]
                    add_reading(ch, "mandarin", p)

# --- Variants: simplified/traditional/semantic/z-variant/spoofing ---
variants = []  # rows: hanzi, other_hanzi, relation
def add_variant(a, b, rel):
    variants.append({"hanzi": a, "other_hanzi": b, "relation": rel})

def parse_variant_targets(s):
    # values like "U+4E18" or multiple separated by spaces; sometimes suffixed with "<kMatthews"
    out = []
    for tok in s.split():
        tok = tok.split("<")[0]
        m = hex_re.match(tok)
        if m:
            ch = cp_to_char(m.group(1))
            if ch: out.append(ch)
    return out

with f_vars.open("r", encoding="utf-8") as f:
    for line in f:
        if not line or line.startswith("#"): continue
        parts = line.strip().split("\t")
        if len(parts) < 3: continue
        cp, field, value = parts[0], parts[1], parts[2]
        m = hex_re.match(cp)
        if not m: continue
        a = cp_to_char(m.group(1))
        if not a: continue

        rel_map = {
            "kSimplifiedVariant": "simplified",
            "kTraditionalVariant": "traditional",
            "kSemanticVariant": "semantic",
            "kZVariant": "z-variant",
            "kSpoofingVariant": "spoofing"
        }
        rel = rel_map.get(field)
        if not rel: continue
        for b in parse_variant_targets(value):
            add_variant(a, b, rel)

# --- Write outputs ---
# characters.csv: hanzi,trad,radical_no,stroke_count
chars = sorted(set(list(radical_no.keys()) + list(stroke_count.keys())))
with (OUT / "characters.csv").open("w", newline="", encoding="utf-8") as w:
    cw = csv.writer(w)
    cw.writerow(["hanzi","trad","radical_no","stroke_count","hsk_char_level","hsk_write_lvl","freq_rank"])
    for ch in chars:
        cw.writerow([ch,"", radical_no.get(ch,""), stroke_count.get(ch,""), "", "", ""])

with (OUT / "readings.csv").open("w", newline="", encoding="utf-8") as w:
    cw = csv.DictWriter(w, fieldnames=["entity_kind","key","script","pinyin","zhuyin","is_canonical"])
    cw.writeheader()
    for r in readings:
        cw.writerow(r)

with (OUT / "character_variants.csv").open("w", newline="", encoding="utf-8") as w:
    cw = csv.DictWriter(w, fieldnames=["hanzi","other_hanzi","relation"])
    cw.writeheader()
    for v in variants:
        cw.writerow(v)

print("Wrote:", OUT / "characters.csv", OUT / "readings.csv", OUT / "character_variants.csv")
