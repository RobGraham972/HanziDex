// src/components/StrokeViewer.jsx
import { useEffect, useRef } from 'react';
import HanziWriter from 'hanzi-writer';
import { loadCharData } from '../utils/hanziCharDataLoader';

export default function StrokeViewer({ char, width = 160, height = 160 }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!char || !ref.current) return;
    const writer = HanziWriter.create(ref.current, char, {
      width,
      height,
      padding: 10,
      showOutline: true,
      showCharacter: false,
      charDataLoader: loadCharData, // Use our local files
    });
    writer.animateCharacter();
    return () => writer && writer.hideCharacter();
  }, [char, width, height]);

  return <div ref={ref} style={{ width, height, marginTop: 10 }} />;
}
