import csv
import gzip
import pathlib
import re

# Paths
ROOT = pathlib.Path(__file__).resolve().parents[1]
HSK_CSV = ROOT / "_cleanup" / "hsk30.csv"
CEDICT_GZ = ROOT / "_cleanup" / "cedict_1_0_ts_utf-8_mdbg.txt.gz"
OUTPUT_TSV = ROOT / "data" / "00_hsk" / "HSK_all_merged.tsv"

def load_cedict(path):
    """
    Parses CEDICT and returns a dict: { Simplified: [definitions...] }
    CEDICT format: Traditional Simplified [pinyin] /English/English/.../
    """
    cedict = {}
    print(f"Loading CEDICT from {path}...")
    with gzip.open(path, 'rt', encoding='utf-8') as f:
        for line in f:
            if line.startswith('#') or not line.strip():
                continue
            # Match: Trad Simp [pinyin] /def/def/
            # Note: Pinyin can contain spaces.
            # We'll split by first space (Trad), second space (Simp), then find '[' and ']' and '/'
            parts = line.split(' ', 2)
            if len(parts) < 3:
                continue
            trad, simp, rest = parts
            
            # rest looks like: [pinyin] /def1/def2/
            m = re.search(r'\[(.*?)\] /(.*)/', rest)
            if m:
                pinyin = m.group(1)
                defs = m.group(2)
                # Clean definitions
                def_list = defs.split('/')
                english = ", ".join(def_list)
                
                if simp not in cedict:
                    cedict[simp] = []
                cedict[simp].append(english)
    print(f"Loaded {len(cedict)} entries from CEDICT.")
    return cedict

def main():
    # 1. Load CEDICT
    cedict = load_cedict(CEDICT_GZ)

    # 2. Read HSK CSV
    print(f"Reading HSK data from {HSK_CSV}...")
    items = []
    with open(HSK_CSV, 'r', encoding='utf-8') as f:
        # Skip BOM if present
        content = f.read()
        if content.startswith('\ufeff'):
            content = content[1:]
        
        reader = csv.DictReader(content.splitlines())
        for row in reader:
            # ID,Simplified,Traditional,Pinyin,POS,Level,...
            simp = row.get('Simplified', '').strip()
            trad = row.get('Traditional', '').strip()
            pinyin = row.get('Pinyin', '').strip()
            level = row.get('Level', '').strip()
            
            if not simp:
                continue

            # Lookup English
            english = ""
            if simp in cedict:
                # Join multiple definitions if they exist, or just take the first one that matches pinyin?
                # For simplicity, take the first one or join all unique ones.
                # CEDICT might have multiple entries for same char with different pinyin.
                # We are not matching pinyin strictly here, just char.
                english = "; ".join(cedict[simp][:3]) # Limit to 3 entries to avoid huge text
            
            items.append({
                'Traditional': trad,
                'Simplified': simp,
                'Pinyin': pinyin,
                'English': english,
                'Zhuyin': '', # Placeholder
                'Level': level # Keep level for DB seeding later if needed, though TSV format doesn't have it in HSK1_merged.tsv
            })

    print(f"Processed {len(items)} HSK items.")

    # 3. Write to TSV
    # Format: Traditional	Simplified	Pinyin	English	Zhuyin
    # Note: HSK1_merged.tsv didn't have Level column in the header I saw?
    # Let's check HSK1_merged.tsv header again: "Traditional	Simplified	Pinyin	English	Zhuyin"
    # I will stick to that format.
    
    print(f"Writing to {OUTPUT_TSV}...")
    with open(OUTPUT_TSV, 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f, delimiter='\t')
        writer.writerow(['Traditional', 'Simplified', 'Pinyin', 'English', 'Zhuyin', 'Level'])
        for item in items:
            writer.writerow([
                item['Traditional'],
                item['Simplified'],
                item['Pinyin'],
                item['English'],
                item['Zhuyin'],
                item['Level']
            ])
    
    print("Done.")

if __name__ == "__main__":
    main()
