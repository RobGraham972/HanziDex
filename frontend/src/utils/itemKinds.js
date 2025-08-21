export function hasKind(item, kind) {
    return Array.isArray(item.kinds) && item.kinds.includes(kind);
  }
  
  export function kindLabel(item) {
    if (!Array.isArray(item.kinds)) return "";
    return item.kinds.join(", "); // e.g. "character, word"
  }
  