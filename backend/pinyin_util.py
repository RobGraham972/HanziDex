import sys
import json
from pypinyin import pinyin, Style

def generate_pinyin(text):
    # Use TONE style for pinyin with tone marks (e.g., zhōng)
    # pinyin returns a list of lists, e.g. [['zhōng'], ['xīn']]
    # We handle heteronyms by just taking the first one (default behavior of pypinyin without heteronym=True)
    result = pinyin(text, style=Style.TONE)
    
    # Flatten and join with spaces
    # Handle cases where result might be empty or have different structure? 
    # pypinyin usually returns [[str], [str]] for each char.
    
    flat_list = []
    for item in result:
        if item:
            flat_list.append(item[0])
        else:
            flat_list.append('')
            
    return ' '.join(flat_list)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        # Join all arguments in case of spaces, though usually passed as one quoted string
        text = " ".join(sys.argv[1:])
        try:
            py = generate_pinyin(text)
            # Output as JSON to be safe and easily parsed
            print(json.dumps({"pinyin": py}))
        except Exception as e:
            print(json.dumps({"error": str(e)}))
    else:
        print(json.dumps({"error": "No text provided"}))
