import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../utils/api';

export default function CollectorsBook({ token, onClose, onSelectItem, version }) {
  const [level, setLevel] = useState(1);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('id');

  useEffect(() => {
    if (!token) return;
    let isCancelled = false;

    async function fetchLevel() {
      setLoading(true);
      setError(null);
      try {
        const data = await api(`/api/books/hsk/${level}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!isCancelled) setItems(data);
      } catch (e) {
        if (!isCancelled) setError(e.message);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }

    fetchLevel();
    return () => { isCancelled = true; };
  }, [level, token, version]);

  const processedItems = useMemo(() => {
    let result = [...items];

    // Filter
    if (filterStatus !== 'all') {
      result = result.filter(item => item.status === filterStatus);
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'id') return a.id - b.id;
      if (sortBy === 'pinyin') return (a.pinyin || '').localeCompare(b.pinyin || '');
      if (sortBy === 'strokes') return (a.stroke_count || 0) - (b.stroke_count || 0);
      return 0;
    });

    return result;
  }, [items, filterStatus, sortBy]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content book-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="app-title" style={{ margin: 0 }}>Collector's Book</h3>
          <div className="book-controls">
            <select 
              className="manual-input" 
              value={filterStatus} 
              onChange={e => setFilterStatus(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="DISCOVERED">Discovered</option>
              <option value="DISCOVERABLE">Discoverable</option>
              <option value="LOCKED">Locked</option>
            </select>
            <select 
              className="manual-input" 
              value={sortBy} 
              onChange={e => setSortBy(e.target.value)}
            >
              <option value="id">Sort by ID</option>
              <option value="pinyin">Sort by Pinyin</option>
              <option value="strokes">Sort by Strokes</option>
            </select>
            <button className="close-btn" onClick={onClose}>✖</button>
          </div>
        </div>

        <div className="book-tabs">
          <button 
            className={`tab-btn ${level === 'custom' ? 'tab-btn--active' : ''}`}
            onClick={() => setLevel('custom')}
          >
            Custom
          </button>
          {[1, 2, 3, 4, 5, 6, 7].map(l => (
            <button 
              key={l} 
              className={`tab-btn ${level === l ? 'tab-btn--active' : ''}`}
              onClick={() => setLevel(l)}
            >
              {l === 7 ? 'HSK 7-9' : `HSK ${l}`}
            </button>
          ))}
        </div>

        <div className="book-content">
          {loading ? (
            <div className="loading-spinner">Loading Chapter {level}...</div>
          ) : error ? (
            <div className="error-msg">{error}</div>
          ) : processedItems.length === 0 ? (
            <div className="empty-state">No items found for HSK {level} matching filters.</div>
          ) : (
            <div className="book-grid">
              {processedItems.map(item => {
                const isDiscovered = item.status === 'DISCOVERED';
                const isDiscoverable = item.status === 'DISCOVERABLE';
                const isLocked = item.status === 'LOCKED';

                return (
                  <div 
                    key={item.id} 
                    className={`book-item ${item.status.toLowerCase()} rank-hsk-${item.hsk_level}`}
                    onClick={() => {
                      if (!isLocked) onSelectItem(item);
                    }}
                    title={isDiscovered ? item.english_definition : isDiscoverable ? 'Discoverable!' : 'Locked'}
                  >
                    {isDiscovered ? (
                      <div className="book-hanzi">{item.value}</div>
                    ) : isDiscoverable ? (
                      <div className="book-mystery">?</div>
                    ) : (
                      <div className="book-locked">
                        <span className="book-hanzi-locked">{item.value}</span>
                        <div className="cross-out"></div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
