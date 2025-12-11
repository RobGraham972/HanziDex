// src/components/StrokeViewer.jsx
import { useEffect, useRef, useState } from 'react';
import HanziWriter from 'hanzi-writer';
import { loadCharData } from '../utils/hanziCharDataLoader';

const COMPONENT_COLORS = [
  '#d9534f', // Red
  '#5cb85c', // Green
  '#f0ad4e', // Orange
  '#9b59b6', // Purple
  '#e67e22', // Carrot
  '#2ecc71', // Emerald
  '#34495e', // Dark Blue/Grey
];

export default function StrokeViewer({ char, width = 160, height = 160, animate = true, onComplete, componentData }) {
  const ref = useRef(null);
  const [writer, setWriter] = useState(null);
  const onCompleteRef = useRef(onComplete);

  // Keep onCompleteRef up to date
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // 1. Create Writer
  useEffect(() => {
    if (!char || !ref.current) return;
    
    ref.current.innerHTML = ''; 

    const options = {
      width,
      height,
      padding: 10,
      showOutline: true,
      showCharacter: false,
      charDataLoader: loadCharData,
      radicalColor: '#337ab7', // Default radical color
    };

    if (componentData && componentData.components) {
      // If we have component data, disable the default radical color so we can control everything
      options.radicalColor = null; 
      
      options.strokeColor = (strokeData) => {
        const idx = strokeData.strokeNum;
        let compIndex = -1;
        componentData.components.forEach((strokes, i) => {
          if (strokes.includes(idx)) compIndex = i;
        });
        
        if (compIndex !== -1) {
          return COMPONENT_COLORS[compIndex % COMPONENT_COLORS.length];
        }
        // Fallback for strokes not in any component (shouldn't happen if map is complete)
        return '#555';
      };
    }

    const newWriter = HanziWriter.create(ref.current, char, options);
    setWriter(newWriter);
  }, [char, width, height, componentData]);

  // 2. Handle Animation Trigger
  useEffect(() => {
      if (!writer) return;
      
      if (animate) {
          writer.hideCharacter();
          writer.animateCharacter({ 
            onComplete: () => onCompleteRef.current?.() 
          });
      }
  }, [animate, writer]); // Re-run if animate changes OR if writer is recreated

  return <div ref={ref} style={{ width, height, marginTop: 10 }} />;
}
