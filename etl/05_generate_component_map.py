import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
DICT_PATH = ROOT / "data" / "30_strokes" / "makemeahanzi" / "dictionary.txt"
OUT_PATH = ROOT / "data" / "processed" / "character_component_map.json"

def parse_decomposition(decomp_str):
    # Simple parser for IDS (Ideographic Description Characters)
    # Returns a list of components if possible
    # This is tricky because IDS is a tree string e.g. ⿰亻尔
    # We only care about the top-level children for now because 'matches' maps to them.
    
    # Common IDS operators: ⿰ (Left-Right), ⿱ (Top-Bottom), ⿲ (L-M-R), ⿳ (T-M-B), ⿴, ⿵, ⿶, ⿷, ⿸, ⿹, ⿺, ⿻
    # If it starts with a binary operator (⿰, ⿱, ⿴, ⿵, ⿶, ⿷, ⿸, ⿹, ⿺, ⿻), it has 2 children.
    # If it starts with a ternary operator (⿲, ⿳), it has 3 children.
    
    if not decomp_str:
        return []
    
    op = decomp_str[0]
    rest = decomp_str[1:]
    
    # We need to split 'rest' into parts. This requires a full parser because parts can be IDS strings themselves.
    # But 'matches' in dictionary.txt corresponds to the *indices* of the children in the decomposition string?
    # Actually, let's look at 'matches' again.
    # "matches": [[0], [0], [1], [1], [1], [1], [1]]
    # This maps stroke index -> child index.
    # Child index 0 corresponds to the first component in the decomposition.
    # Child index 1 corresponds to the second component.
    
    # So we just need to extract the component characters.
    # But extracting them from the string is hard without parsing.
    # e.g. ⿰亻尔 -> ['亻', '尔']
    # e.g. ⿱TopBottom -> ['Top', 'Bottom']
    # e.g. ⿰Complex1Complex2 -> ['Complex1', 'Complex2']
    
    # Fortunately, we don't strictly need the *names* of the components to color them.
    # We just need to know there are N components, and which strokes belong to which.
    # But having the names is nice for debugging.
    
    return []

def process():
    if not DICT_PATH.exists():
        print(f"Error: {DICT_PATH} not found.")
        return

    mapping = {}

    with open(DICT_PATH, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
                char = entry.get('character')
                matches = entry.get('matches')
                radical = entry.get('radical')
                
                if not char or not matches:
                    continue
                
                # matches is a list of lists/nulls.
                # e.g. [[0], [0], [1], [1]]
                # We want to group stroke indices by component index.
                
                components = {} # index -> { strokes: [], isRadical: bool }
                
                # First pass: collect strokes for each component index
                for stroke_idx, match in enumerate(matches):
                    if match is None:
                        # Stroke doesn't map to a component? Or maps to root?
                        # Usually null means it's not assigned or ambiguous.
                        continue
                    
                    # match is a list of indices, e.g. [0] or [1, 0]
                    # We only care about the top-level index (match[0]) for coloring top-level components.
                    if len(match) > 0:
                        comp_idx = match[0]
                        if comp_idx not in components:
                            components[comp_idx] = {'strokes': [], 'isRadical': False}
                        components[comp_idx]['strokes'].append(stroke_idx)
                
                # Determine which component is the radical
                # This is hard because we don't know which component index corresponds to the radical character
                # unless we parse the decomposition string.
                # BUT, we can try to guess.
                # Or we can just store the groups and let the frontend decide colors.
                # The frontend can color group 0, group 1, etc.
                
                # If we want to identify the radical specifically:
                # We can check if the strokes in a group match the 'radStrokes' from HanziWriter data?
                # Or we can just export the groups.
                
                # Let's just export the groups for now.
                # Format: list of lists of stroke indices.
                
                comp_list = []
                for idx in sorted(components.keys()):
                    comp_list.append(components[idx]['strokes'])
                
                mapping[char] = {
                    'radical': radical,
                    'components': comp_list
                }
                
            except json.JSONDecodeError:
                continue

    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(mapping, f, ensure_ascii=False, separators=(',', ':'))
    
    print(f"Generated map for {len(mapping)} characters at {OUT_PATH}")

if __name__ == "__main__":
    process()
