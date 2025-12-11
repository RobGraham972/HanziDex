import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
MAP_PATH = ROOT / "frontend" / "public" / "data" / "character_component_map.json"

with open(MAP_PATH, 'r', encoding='utf-8') as f:
    data = json.load(f)
    if "你" in data:
        print(f"Found 你: {data['你']}")
    else:
        print("你 not found")
