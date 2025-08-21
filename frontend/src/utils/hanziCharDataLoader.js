// src/utils/hanziCharDataLoader.js
export async function loadCharData(hanzi) {
  // Try a filename with the character itself (needs encoding for radicals/supplement chars)
  const charUrl = `/data/30_strokes/hanzi_writer_data/data/${encodeURIComponent(hanzi)}.json`;
  // Fallback to hex filename (4e00.json style)
  const hex = hanzi.codePointAt(0).toString(16);
  const hexUrl = `/data/30_strokes/hanzi_writer_data/data/${hex}.json`;

  const fetchJson = async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  };

  try {
    return await fetchJson(charUrl);
  } catch {
    return await fetchJson(hexUrl);
  }
}
