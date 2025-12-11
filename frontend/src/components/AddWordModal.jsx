import React, { useState } from 'react';
import { api } from '../utils/api';

export default function AddWordModal({ token, onClose, onAdded }) {
  const [word, setWord] = useState('');
  const [englishDefinition, setEnglishDefinition] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!word.trim() || !englishDefinition.trim()) return;
    setLoading(true);
    setError('');
    try {
      const newItem = await api('/api/items/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ word, english_definition: englishDefinition })
      });
      onAdded(newItem);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to add word');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <div className="modal-header">
          <h3 className="app-title" style={{ margin: 0 }}>Add Custom Word</h3>
          <button className="close-btn" onClick={onClose}>✖</button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 16, marginTop: 16 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>Word (Hanzi)</label>
            <input 
              type="text" 
              value={word} 
              onChange={e => setWord(e.target.value)}
              placeholder="e.g. 电脑"
              className="manual-input"
              autoFocus
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>English Definition</label>
            <input 
              type="text" 
              value={englishDefinition} 
              onChange={e => setEnglishDefinition(e.target.value)}
              placeholder="e.g. Computer"
              className="manual-input"
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
            <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
              We'll automatically generate Pinyin.
            </p>
          </div>
          {error && <p style={{ color: 'crimson', fontSize: 14 }}>{error}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn--accent" disabled={loading}>
              {loading ? 'Adding...' : 'Add Word'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
