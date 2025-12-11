import React, { useState, useEffect, useRef } from 'react';
import { api } from '../utils/api';
import './SearchRecommender.css';

export default function SearchRecommender({ token, onSelect, onDiscover }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.trim().length > 0) {
        setLoading(true);
        try {
          const data = await api(`/api/search-items?q=${encodeURIComponent(query)}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setResults(data);
          setIsOpen(true);
        } catch (err) {
          console.error("Search failed", err);
        } finally {
          setLoading(false);
        }
      } else {
        setResults([]);
        setIsOpen(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, token]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [wrapperRef]);

  const handleDiscover = async (e, item) => {
    e.stopPropagation(); // Prevent selecting the row
    if (onDiscover) {
      await onDiscover(item);
      // Update local state to show it's discovered? 
      // Ideally we re-fetch or update the item in the list.
      // For now, let's assume the parent handles the data refresh and we might close the dropdown or update the item status if we could.
      // A simple way is to just mark it as discovered in our local results list:
      setResults(prev => prev.map(r => r.id === item.id ? { ...r, is_discovered: true } : r));
    }
  };

  return (
    <div className="search-recommender" ref={wrapperRef}>
      <div className="search-input-wrapper">
        <input
          type="text"
          placeholder="Search English or Chinese..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (results.length > 0) setIsOpen(true); }}
          className="search-input"
        />
        {loading && <div className="search-spinner"></div>}
      </div>
      
      {isOpen && results.length > 0 && (
        <ul className="search-dropdown">
          {results.map((item) => (
            <li key={item.id} className="search-item" onClick={() => { onSelect(item); setIsOpen(false); setQuery(''); }}>
              <div className="search-item-content">
                <div className="search-item-title">
                  <span className="hanzi">{item.value}</span>
                  <span className="pinyin">[{item.pinyin}]</span>
                  {item.hsk_level && <span className="hsk-tag">HSK {item.hsk_level}</span>}
                </div>
                <div className="search-item-subtitle">{item.english_definition}</div>
              </div>
              <div className="search-item-action">
                {item.is_discovered ? (
                  <span className="status-badge discovered">Discovered</span>
                ) : (
                  <button 
                    className="discover-btn"
                    onClick={(e) => handleDiscover(e, item)}
                  >
                    Discover
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
