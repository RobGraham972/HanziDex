import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './context/AuthContext.jsx';
import './App.css';
import HanziModal from './components/HanziModal.jsx';
import SearchRecommender from './components/SearchRecommender.jsx';
import CollectorsBook from './components/CollectorsBook.jsx';
import AddWordModal from './components/AddWordModal.jsx';
import { api } from './utils/api.js';
import { hasKind, kindLabel } from './utils/itemKinds.js';

function App() {
  const { user, token, loadingAuth, login, register, logout } = useAuth();

  // Data
  const [discoveredItemsList, setDiscoveredItemsList] = useState([]);
  const [discoverableItems, setDiscoverableItems] = useState([]);

  // UI state
  const [loadingContent, setLoadingContent] = useState(true);
  const [errorContent, setErrorContent] = useState(null);
  const [selectedItemIndex, setSelectedItemIndex] = useState(null);
  const [selectedSection, setSelectedSection] = useState(null); // 'discovered' | 'discoverable' | null
  const [tabDiscoverable, setTabDiscoverable] = useState('characters');
  const [tabDiscovered, setTabDiscovered] = useState('characters');
  const [trainingQueue, setTrainingQueue] = useState({ count: 0, items: [], meta: null });
  const [showTrainer, setShowTrainer] = useState(false);
  const [trainerIdx, setTrainerIdx] = useState(0);
  const [trainerPaused, setTrainerPaused] = useState(false);
  const [trainerRevealed, setTrainerRevealed] = useState(false);
  const [reducedMotion, _setReducedMotion] = useState(() => {
    try { return JSON.parse(localStorage.getItem('reducedMotion') || 'false'); } catch { return false; }
  });
  const [highContrast, _setHighContrast] = useState(() => {
    try { return JSON.parse(localStorage.getItem('highContrast') || 'false'); } catch { return false; }
  });
  const [showPrefs, setShowPrefs] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showBook, setShowBook] = useState(false);
  const [showAddWord, setShowAddWord] = useState(false);
  const [prefsLoading, setPrefsLoading] = useState(false);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsError, setPrefsError] = useState('');
  const [prefs, setPrefs] = useState({
    desired_retention: 0.9,
    daily_new_limit: 10,
    daily_review_limit: 100,
    bury_siblings: true,
    leech_threshold: 8,
    reminders_enabled: false,
    reminder_time: '',
    nudges_enabled: true,
    experiment_id: '',
  });
  const [bookVersion, setBookVersion] = useState(0);

  // Search / Selection
  const [selectedSearchItem, setSelectedSearchItem] = useState(null);
  const [sortKey, setSortKey] = useState('default'); // default|hsk|stroke|value
  // Section-specific filters
  const [hskFilterDiscoverable, setHskFilterDiscoverable] = useState('all');
  const [strokeFilterDiscoverable, setStrokeFilterDiscoverable] = useState('all');
  const [hskFilterDiscovered, setHskFilterDiscovered] = useState('all');
  const [strokeFilterDiscovered, setStrokeFilterDiscovered] = useState('all');

  // Forms: auth
  const [discoveryMessage, setDiscoveryMessage] = useState('');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [isRegisterMode, setIsRegisterMode] = useState(false);

  // ---------- API: load items ----------
  const fetchAllItems = useCallback(async () => {
    if (!token) {
      setLoadingContent(false);
      setErrorContent(null);
      setDiscoveredItemsList([]);
      setDiscoverableItems([]);
      return;
    }

    setLoadingContent(true);
    setErrorContent(null);

    try {
      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      const [discoveredData, discoverableData] = await Promise.all([
        api('/api/discovered-items', { headers }),
        api('/api/discoverable-items', { headers }),
      ]);

      setDiscoveredItemsList(discoveredData);
      setDiscoverableItems(discoverableData);
    } catch (e) {
      setErrorContent('Failed to fetch items: ' + e.message);
      console.error('Failed to fetch items:', e);
    } finally {
      setLoadingContent(false);
    }
  }, [token]);

  useEffect(() => {
    if (user && token && !loadingAuth) {
      fetchAllItems();
      // Load training queue
      (async () => {
        const headers = { Authorization: `Bearer ${token}` };
        try {
          const q = await api('/api/training/queue', { headers });
          setTrainingQueue(q);
        } catch (e) {
          console.warn('Failed to load training queue:', e?.message || e);
        }
      })();
    } else if (!user && !loadingAuth) {
      setLoadingContent(false);
      setErrorContent(null);
      setDiscoveredItemsList([]);
      setDiscoverableItems([]);
    }
  }, [user, token, loadingAuth, fetchAllItems]);

  // Apply UI classes
  useEffect(() => {
    const root = document.documentElement;
    if (reducedMotion) root.classList.add('reduced-motion'); else root.classList.remove('reduced-motion');
    if (highContrast) root.classList.add('hc'); else root.classList.remove('hc');
  }, [reducedMotion, highContrast]);

  useEffect(() => { localStorage.setItem('reducedMotion', JSON.stringify(reducedMotion)); }, [reducedMotion]);
  useEffect(() => { localStorage.setItem('highContrast', JSON.stringify(highContrast)); }, [highContrast]);

  // Keyboard shortcuts for trainer
  useEffect(() => {
    function onKey(e) {
      if (!showTrainer) return;
      const key = e.key.toLowerCase();
      if (key === 'p') { setTrainerPaused(p => !p); e.preventDefault(); return; }
      if (key === 'u') { // undo
        const cur = trainingQueue.items[Math.min(trainerIdx, Math.max(0, trainingQueue.items.length - 1))];
        const prev = trainingQueue.items[Math.max(0, trainerIdx - 1)] || cur;
        if (!prev) return;
        api(`/api/items/${prev.item_id}/skills/${prev.skill_code}/undo`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
          .then(() => api('/api/training/queue', { headers: { Authorization: `Bearer ${token}` } }))
          .then(q => setTrainingQueue(q))
          .catch(() => {});
        e.preventDefault();
        return;
      }
      if (key === 's') { // suspend
        const cur = trainingQueue.items[Math.min(trainerIdx, Math.max(0, trainingQueue.items.length - 1))];
        if (!cur) return;
        api(`/api/items/${cur.item_id}/skills/${cur.skill_code}/suspend`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ suspended: true }) })
          .then(() => api('/api/training/queue', { headers: { Authorization: `Bearer ${token}` } }))
          .then(q => setTrainingQueue(q))
          .catch(() => {});
        e.preventDefault();
        return;
      }
      if (trainerPaused) return;
      const cur = trainingQueue.items[Math.min(trainerIdx, Math.max(0, trainingQueue.items.length - 1))];
      if (!cur) return;
      // Reveal-first flow
      if (!trainerRevealed) {
        if (key === ' ' || key === 'enter') { setTrainerRevealed(true); e.preventDefault(); return; }
        return;
      }
      const doTrain = (rating) => api(`/api/items/${cur.item_id}/skills/${cur.skill_code}/train`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ rating })
      }).then(() => api('/api/training/queue', { headers: { Authorization: `Bearer ${token}` } }))
        .then(q => { setTrainingQueue(q); setTrainerRevealed(false); })
        .catch(() => {});
      if (key === '1') { doTrain('again'); e.preventDefault(); return; }
      if (key === '2') { doTrain('hard'); e.preventDefault(); return; }
      if (key === '3') { doTrain('good'); e.preventDefault(); return; }
      if (key === '4') { doTrain('easy'); e.preventDefault(); return; }
      if (key === ' ') { setTrainerIdx(i => Math.min(trainingQueue.items.length - 1, i + 1)); setTrainerRevealed(false); e.preventDefault(); return; }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showTrainer, trainerPaused, trainerIdx, trainingQueue.items, token, trainerRevealed]);

  // ---------- Actions ----------
  const handleGenerateDaily = async () => {
    setDiscoveryMessage('');
    try {
      const data = await api('/api/generate-daily-discoverables', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      setDiscoveryMessage(data.message || 'Generated daily discoverables!');
      await fetchAllItems();
    } catch (e) {
      setDiscoveryMessage('Error generating daily discoverables: ' + e.message);
      console.error('Daily generation error:', e);
    }
  };

  const handleConvertDiscoverable = async (item_value) => {
    setDiscoveryMessage('');
    try {
      const data = await api('/api/discover', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ item_value }),
      });
      setDiscoveryMessage(data.message || 'Converted to discovered!');
      await fetchAllItems();
      // Refresh training queue so newly discovered skills appear immediately
      try {
        const q = await api('/api/training/queue', { headers: { Authorization: `Bearer ${token}` } });
        setTrainingQueue(q);
      } catch (err) {
        console.warn('Queue refresh failed after convert:', err?.message || err);
      }
    } catch (e) {
      setDiscoveryMessage('Error converting discoverable: ' + e.message);
      console.error('Convert discoverable error:', e);
    }
  };

  // ---------- Tab filtering ----------
  const filterByTab = (items, tab) => {
    switch (tab) {
      case 'all':
        return items;
      case 'words':
        return items.filter((i) => hasKind(i, 'word'));
      case 'characters':
        return items.filter((i) => hasKind(i, 'character'));
      case 'radicals':
        return items.filter((i) => hasKind(i, 'radical'));
      default:
        return items;
    }
  };

  // No tag filtering in MVP; rely on tabs + search/sort

  const applyHskFilter = (items, value) => {
    if (value === 'all') return items;
    const n = parseInt(value.replace('hsk', ''), 10);
    if (!Number.isFinite(n)) return items;
    return items.filter(i => (i.hsk_level ?? null) === n);
  };

  const strokeInRange = (count, key) => {
    const c = Number(count);
    if (!Number.isFinite(c)) return false;
    switch (key) {
      case 's1_5': return c >= 1 && c <= 5;
      case 's6_10': return c >= 6 && c <= 10;
      case 's11_15': return c >= 11 && c <= 15;
      case 's16_20': return c >= 16 && c <= 20;
      case 's21p': return c >= 21;
      default: return true;
    }
  };
  const applyStrokeFilter = useCallback((items, key) => {
    if (key === 'all') return items;
    return items.filter(i => strokeInRange(i.stroke_count, key));
  }, []);

  const sortItems = (items, key) => {
    switch (key) {
      case 'hsk':
        return [...items].sort((a, b) => (a.hsk_level ?? 999) - (b.hsk_level ?? 999) || (a.id - b.id));
      case 'stroke':
        return [...items].sort((a, b) => (a.stroke_count ?? 999) - (b.stroke_count ?? 999) || (a.id - b.id));
      case 'value':
        return [...items].sort((a, b) => String(a.value).localeCompare(String(b.value), 'zh-Hans'));
      default:
        return items;
    }
  };

  const filteredDiscoverable = useMemo(() => {
    let list = filterByTab(discoverableItems, tabDiscoverable);
    list = applyHskFilter(list, hskFilterDiscoverable);
    list = applyStrokeFilter(list, strokeFilterDiscoverable);
    list = sortItems(list, sortKey);
    return list;
  }, [discoverableItems, tabDiscoverable, sortKey, hskFilterDiscoverable, strokeFilterDiscoverable, applyStrokeFilter]);
  const filteredDiscovered = useMemo(() => {
    let list = filterByTab(discoveredItemsList, tabDiscovered);
    list = applyHskFilter(list, hskFilterDiscovered);
    list = applyStrokeFilter(list, strokeFilterDiscovered);
    list = sortItems(list, sortKey);
    return list;
  }, [discoveredItemsList, tabDiscovered, sortKey, hskFilterDiscovered, strokeFilterDiscovered, applyStrokeFilter]);

  // ---------- Auth ----------
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthMessage('');
    let result;
    if (isRegisterMode) {
      result = await register(authUsername, authPassword);
    } else {
      result = await login(authUsername, authPassword);
    }
    setAuthMessage(result.message);
    if (result.success) {
      setAuthUsername('');
      setAuthPassword('');
    }
  };

  // ---------- Auth screens ----------
  if (loadingAuth) {
    return <div className="App">Loading authentication...</div>;
  }

  if (!user) {
    return (
      <div className="App auth-form-container">
        <h1 className="app-title">My HanziDex</h1>

        <h2 style={{ marginBottom: 8 }}>{isRegisterMode ? 'Create account' : 'Welcome back'}</h2>
        <form onSubmit={handleAuthSubmit} className="auth-form">
          <input
            type="text"
            placeholder="Username"
            value={authUsername}
            onChange={(e) => setAuthUsername(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={authPassword}
            onChange={(e) => setAuthPassword(e.target.value)}
            required
          />
          <button type="submit" className="btn btn--accent">
            {isRegisterMode ? 'Register' : 'Login'}
          </button>
        </form>

        {authMessage && (
          <p style={{ color: authMessage.includes('successful') ? 'green' : 'crimson', marginTop: 8 }}>
            {authMessage}
          </p>
        )}

        <button onClick={() => setIsRegisterMode(!isRegisterMode)} className="btn" style={{ marginTop: 10 }}>
          {isRegisterMode ? 'Already have an account? Login' : 'Need an account? Register'}
        </button>
      </div>
    );
  }

  // ---------- Main app ----------
  return (
    <div className="App">
      {/* Header */}
      <h1 className="app-title">My HanziDex</h1>

      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
        <SearchRecommender 
          token={token} 
          onSelect={(item) => {
            setSelectedSearchItem(item);
            setSelectedSection(null);
            setSelectedItemIndex(null);
          }}
          onDiscover={(item) => handleConvertDiscoverable(item.value)}
        />
      </div>

      <div className="actions-bar">
        <button className="btn btn--accent" onClick={handleGenerateDaily}>
          Generate Daily Discoverables
        </button>
        <button className="btn btn--accent" onClick={() => setShowAddWord(true)}>
          Add Custom Word
        </button>
        <button className="btn btn--accent" onClick={() => setShowBook(true)}>
          📖 Collector's Book
        </button>
        <div className="controls-row">
          <select
            aria-label="Sort"
            className="manual-input selectlike"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value)}
          >
            <option value="default">Sort: Default</option>
            <option value="hsk">Sort: HSK</option>
            <option value="stroke">Sort: Stroke count</option>
            <option value="value">Sort: Character</option>
          </select>
        </div>
        <button className="btn" onClick={() => setShowPrefs(true)}>
          Preferences
        </button>
        <button className="btn" onClick={() => setShowStats(true)}>
          Stats
        </button>
        <button className="btn" onClick={() => { setShowTrainer(true); setTrainerIdx(0); }}>
          Start Training ({trainingQueue.count})
        </button>
        <button className="btn" onClick={logout}>Logout</button>
      </div>

      {discoveryMessage && (
        <p style={{ marginTop: 6, color: discoveryMessage.includes('Error') ? 'crimson' : 'seagreen' }}>
          {discoveryMessage}
        </p>
      )}

      {/* Daily Discoverables */}
      <h3 style={{ marginTop: 26, marginBottom: 8 }}>Daily Discoverables</h3>
      {/* Tag filters removed per feedback */}
      
      {/* Discovered grid removed per feedback */}
      
      {showBook && (
        <CollectorsBook 
          token={token} 
          version={bookVersion}
          onClose={() => setShowBook(false)}
          onSelectItem={(item) => {
            setSelectedSearchItem(item);
          }}
        />
      )}

      {/* Detail modal */}
      {selectedSearchItem && (
        <HanziModal
          item={selectedSearchItem}
          onClose={() => setSelectedSearchItem(null)}
          onUpdate={(updatedItem) => {
            setSelectedSearchItem(updatedItem);
            setDiscoveredItemsList(prev => prev.map(i => i.id === updatedItem.id ? updatedItem : i));
            setDiscoverableItems(prev => prev.map(i => i.id === updatedItem.id ? updatedItem : i));
            setBookVersion(v => v + 1);
          }}
          onDelete={(deletedId) => {
            setSelectedSearchItem(null);
            setDiscoveredItemsList(prev => prev.filter(i => i.id !== deletedId));
            setDiscoverableItems(prev => prev.filter(i => i.id !== deletedId));
            setBookVersion(v => v + 1);
          }}
          onCatch={selectedSearchItem.status === 'DISCOVERABLE' ? async () => {
            await handleConvertDiscoverable(selectedSearchItem.value);
            setSelectedSearchItem(null);
            setBookVersion(v => v + 1);
          } : undefined}
          onSelectRelated={async (value) => {
            // Fetch the item details
            try {
              const res = await api(`/api/search-items?q=${encodeURIComponent(value)}`, {
                headers: { Authorization: `Bearer ${token}` }
              });
              // Find exact match
              const match = res.find(i => i.value === value);
              if (match) {
                setSelectedSearchItem(match);
              } else {
                console.warn('Related item not found:', value);
              }
            } catch (e) {
              console.error('Failed to load related item:', e);
            }
          }}
        />
      )}

      {showAddWord && (
        <AddWordModal
          token={token}
          onClose={() => setShowAddWord(false)}
          onAdded={(newItem) => {
            setSelectedSearchItem(newItem);
            // Optionally refresh lists if needed
          }}
        />
      )}

      {showTrainer && (
        <div className="modal-overlay" onClick={() => setShowTrainer(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="app-title" style={{ margin: 0 }}>Training Session</h3>
              <button className="close-btn" onClick={() => setShowTrainer(false)}>✖</button>
            </div>
            {/* Progress bar */}
            {trainingQueue.items.length > 0 && (
              (() => {
                const at = Math.min(trainerIdx, Math.max(0, trainingQueue.items.length - 1));
                const idxHuman = at + 1;
                const total = trainingQueue.items.length;
                const pct = Math.max(0, Math.min(100, Math.round((idxHuman / total) * 100)));
                return (
                  <div style={{ height: 6, borderRadius: 999, background: '#e5e7eb', overflow: 'hidden', boxShadow: 'var(--shadow-soft)', margin: '0 0 8px' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)' }} />
                  </div>
                );
              })()
            )}
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center',
              fontSize: 12, color: '#6b7280', marginBottom: 6
            }}>
              <span>Keys:</span>
              <span><code>Space</code>/<code>Enter</code> reveal/next</span>
              <span><code>1</code>/<code>2</code>/<code>3</code>/<code>4</code> grade</span>
              <span><code>U</code> undo</span>
              <span><code>S</code> suspend</span>
              <span><code>P</code> pause</span>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 8 }}>
              <button className="btn" onClick={() => setTrainerPaused((p) => !p)}>{trainerPaused ? 'Resume' : 'Pause'}</button>
              <button className="btn" onClick={async () => {
                // Undo last
                const prev = trainingQueue.items[Math.max(0, trainerIdx - 1)] || trainingQueue.items[0];
                const cur = trainingQueue.items[Math.min(trainerIdx, trainingQueue.items.length - 1)];
                const target = prev || cur;
                if (!target) return;
                await api(`/api/items/${target.item_id}/skills/${target.skill_code}/undo`, {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${token}` },
                });
                const q = await api('/api/training/queue', { headers: { Authorization: `Bearer ${token}` } });
                setTrainingQueue(q);
              }}>Undo last</button>
            </div>
            {trainerPaused ? (
              <p style={{ textAlign: 'center' }}>Paused</p>
            ) : trainingQueue.items.length === 0 ? (
              <div>
                {trainingQueue?.meta?.new_limit_reached ? (
                  <p>You’ve reached your new cards limit for today. Come back tomorrow for more new skills.</p>
                ) : (
                  <p>No skills due. Great job!</p>
                )}
                {trainingQueue?.meta && (
                  <p style={{ marginTop: 8, color: '#555' }}>
                    Remaining today — New: {trainingQueue.meta.remaining_new}, Reviews: {trainingQueue.meta.remaining_reviews}
                  </p>
                )}
              </div>
            ) : (
              (() => {
                const cur = trainingQueue.items[Math.min(trainerIdx, trainingQueue.items.length - 1)];
                if (!cur) return <p>No card.</p>;
                const idxHuman = Math.min(trainerIdx, trainingQueue.items.length - 1) + 1;
                const total = trainingQueue.items.length;
                async function doTrain(rating) {
                  await api(`/api/items/${cur.item_id}/skills/${cur.skill_code}/train`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ rating })
                  });
                  const q = await api('/api/training/queue', { headers: { Authorization: `Bearer ${token}` } });
                  setTrainingQueue(q);
                  setTrainerIdx((i) => Math.min(i, Math.max(0, q.items.length - 1)));
                  setTrainerRevealed(false);
                }
                return (
                  <div>
                    <div style={{ textAlign: 'center', fontSize: 12, color: '#6b7280' }}>
                      Card {idxHuman} of {total}
                    </div>
                    <div style={{ textAlign: 'center', marginTop: 4 }}>
                      <div style={{ fontSize: 46, lineHeight: '54px' }}>
                        {cur.card_front || cur.value}
                      </div>
                      <p style={{ marginTop: 4 }}>
                        <strong>{cur.skill_label}</strong> — Lv {cur.level} — R {(Math.round((cur.retrievability ?? 0) * 100))}%
                      </p>
                      {!trainerRevealed ? (
                        <button className="btn" onClick={() => setTrainerRevealed(true)}>Show answer</button>
                      ) : (cur.card_back && (
                        <div style={{ marginTop: 8, padding: '8px 12px', background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                          <span style={{ color: '#475569' }}>{cur.card_back}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
                      {trainerRevealed && (
                        <>
                          <button className="btn" onClick={() => doTrain('again')}>Again</button>
                          <button className="btn" onClick={() => doTrain('hard')}>Hard</button>
                          <button className="btn btn--accent" onClick={() => doTrain('good')}>Good</button>
                          <button className="btn" onClick={() => doTrain('easy')}>Easy</button>
                        </>
                      )}
                      <button className="btn" onClick={async () => {
                        // Suspend this skill
                        await api(`/api/items/${cur.item_id}/skills/${cur.skill_code}/suspend`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                          body: JSON.stringify({ suspended: true })
                        });
                        const q = await api('/api/training/queue', { headers: { Authorization: `Bearer ${token}` } });
                        setTrainingQueue(q);
                        setTrainerIdx((i) => Math.min(i, Math.max(0, q.items.length - 1)));
                        setTrainerRevealed(false);
                      }}>Suspend</button>
                    </div>
                    <div className="modal-nav" style={{ marginTop: 16 }}>
                      <button onClick={() => { setTrainerIdx((i) => Math.max(0, i - 1)); setTrainerRevealed(false); }}>← Prev</button>
                      <button onClick={() => { setTrainerIdx((i) => Math.min(trainingQueue.items.length - 1, i + 1)); setTrainerRevealed(false); }}>Next →</button>
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        </div>
      )}

      {showPrefs && (
        <div className="modal-overlay" onClick={() => setShowPrefs(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="app-title" style={{ margin: 0 }}>Preferences</h3>
              <button className="close-btn" onClick={() => setShowPrefs(false)}>✖</button>
            </div>
            <PrefsForm
              token={token}
              prefs={prefs}
              setPrefs={setPrefs}
              loading={prefsLoading}
              saving={prefsSaving}
              error={prefsError}
              onLoad={async () => {
                setPrefsError('');
                setPrefsLoading(true);
                try {
                  const data = await api('/api/user/options', { headers: { Authorization: `Bearer ${token}` } });
                  setPrefs({
                    desired_retention: Number(data.desired_retention ?? 0.9),
                    daily_new_limit: Number(data.daily_new_limit ?? 10),
                    daily_review_limit: Number(data.daily_review_limit ?? 100),
                    bury_siblings: Boolean(data.bury_siblings ?? true),
                    leech_threshold: Number(data.leech_threshold ?? 8),
                  });
                } catch (e) {
                  setPrefsError(e.message || 'Failed to load preferences');
                } finally {
                  setPrefsLoading(false);
                }
              }}
              onSave={async () => {
                setPrefsError('');
                setPrefsSaving(true);
                try {
                  await api('/api/user/options', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify(prefs),
                  });
                  // Refresh training queue to reflect new limits
                  const q = await api('/api/training/queue', { headers: { Authorization: `Bearer ${token}` } });
                  setTrainingQueue(q);
                  setShowPrefs(false);
                } catch (e) {
                  setPrefsError(e.message || 'Failed to save preferences');
                } finally {
                  setPrefsSaving(false);
                }
              }}
            />
          </div>
        </div>
      )}

      {showStats && (
        <div className="modal-overlay" onClick={() => setShowStats(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="app-title" style={{ margin: 0 }}>Stats</h3>
              <button className="close-btn" onClick={() => setShowStats(false)}>✖</button>
            </div>
            <StatsView token={token} />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

function PrefsForm({ token, prefs, setPrefs, loading, saving, error, onLoad, onSave }) {
  useEffect(() => {
    onLoad?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  return (
    <div>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {loading ? (
        <p>Loading…</p>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); onSave?.(); }} style={{ display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Desired retention (0.70–0.99)
              <InfoDot title={
                'Target long‑term recall probability for mature skills. Example: 0.90 ≈ 90% retained. Higher values (e.g., 0.95) increase review frequency; lower values (e.g., 0.85) reduce workload but allow more forgetting.'
              } />
            </span>
            <input type="number" step="0.01" min={0.7} max={0.99}
              value={prefs.desired_retention}
              onChange={(e) => setPrefs({ ...prefs, desired_retention: Number(e.target.value) })}
            />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              New cards per day
              <InfoDot title={
                'Max new skills you start each day. New cards add short‑term reviews. Example: 10 new/day is a moderate pace; start with 5–15 and adjust.'
              } />
            </span>
            <input type="number" min={0} max={200}
              value={prefs.daily_new_limit}
              onChange={(e) => setPrefs({ ...prefs, daily_new_limit: Number(e.target.value) })}
            />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Max reviews per day
              <InfoDot title={
                'Upper limit on total reviews shown in a day. Example: if 130 are due and limit is 100, only 100 appear; the rest defer to later.'
              } />
            </span>
            <input type="number" min={0} max={2000}
              value={prefs.daily_review_limit}
              onChange={(e) => setPrefs({ ...prefs, daily_review_limit: Number(e.target.value) })}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox"
              checked={!!prefs.bury_siblings}
              onChange={(e) => setPrefs({ ...prefs, bury_siblings: e.target.checked })}
            />
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Bury siblings (avoid related items the same day)
              <InfoDot title={
                'Reduces interference by not training closely related items together (e.g., a character and a word containing it). When enabled, siblings appear on different days.'
              } />
            </span>
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Leech threshold
              <InfoDot title={
                'Number of lapses (Again) before a skill is flagged as a leech. Example: 8. Leeches may need mnemonics or extra context.'
              } />
            </span>
            <input type="number" min={1} max={50}
              value={prefs.leech_threshold}
              onChange={(e) => setPrefs({ ...prefs, leech_threshold: Number(e.target.value) })}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox"
              checked={!!prefs.reminders_enabled}
              onChange={(e) => setPrefs({ ...prefs, reminders_enabled: e.target.checked })}
            />
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Enable reminders
              <InfoDot title={'If enabled, you can receive daily reminders at the time below.'} />
            </span>
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span>Reminder time (HH:MM)</span>
            <input type="time" value={prefs.reminder_time || ''}
              onChange={(e) => setPrefs({ ...prefs, reminder_time: e.target.value })}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox"
              checked={!!prefs.nudges_enabled}
              onChange={(e) => setPrefs({ ...prefs, nudges_enabled: e.target.checked })}
            />
            <span>Enable gentle nudges</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox"
              checked={JSON.parse(localStorage.getItem('reducedMotion') || 'false')}
              onChange={(e) => localStorage.setItem('reducedMotion', JSON.stringify(e.target.checked))}
            />
            <span>Reduced motion (UI animations off)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox"
              checked={JSON.parse(localStorage.getItem('highContrast') || 'false')}
              onChange={(e) => localStorage.setItem('highContrast', JSON.stringify(e.target.checked))}
            />
            <span>High contrast (stronger edges)</span>
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span>Experiment ID (optional)</span>
            <input type="text" value={prefs.experiment_id || ''}
              onChange={(e) => setPrefs({ ...prefs, experiment_id: e.target.value })}
              placeholder="e.g., RET-0.85 or HARDx1.1"
            />
          </label>
          <div className="modal-nav" style={{ marginTop: 8 }}>
            <button type="submit" className="btn btn--accent" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            <button
              type="button"
              className="btn"
              onClick={() => setPrefs({
                desired_retention: 0.9,
                daily_new_limit: 10,
                daily_review_limit: 100,
                bury_siblings: true,
                leech_threshold: 8,
                reminders_enabled: false,
                reminder_time: '',
                nudges_enabled: true,
                experiment_id: '',
              })}
            >
              Reset to defaults
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function InfoDot({ title }) {
  return (
    <span
      title={title}
      aria-label="Info"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 16,
        height: 16,
        borderRadius: '50%',
        fontSize: 11,
        lineHeight: '16px',
        background: '#eef2ff',
        color: '#334155',
        border: '1px solid #c7d2fe',
        cursor: 'help',
        userSelect: 'none'
      }}
    >i</span>
  );
}

function StatsView({ token }) {
  const [overview, setOverview] = useState(null);
  const [daily, setDaily] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const [ov, dy] = await Promise.all([
          api('/api/stats/overview', { headers }),
          api('/api/stats/daily?days=30', { headers }),
        ]);
        setOverview(ov);
        setDaily(dy);
      } catch (e) {
        setError(e.message || 'Failed to load stats');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) return <p>Loading…</p>;
  if (error) return <p style={{ color: 'crimson' }}>{error}</p>;
  if (!overview || !daily) return <p>No data yet.</p>;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <section>
        <h4 style={{ margin: '4px 0' }}>Overview (last 30 days)</h4>
        <p>Avg daily load: {overview.avg_daily_load.last_7d}/day (7d), {overview.avg_daily_load.last_30d}/day (30d); Today: {overview.avg_daily_load.today}</p>
        <p>Time on task: {(overview.time_on_task.last_7d_ms/60000|0)} min (7d), {(overview.time_on_task.last_30d_ms/60000|0)} min (30d)</p>
      </section>

      <section>
        <h4 style={{ margin: '4px 0' }}>Retention by skill (30d)</h4>
        <ul style={{ paddingLeft: 18 }}>
          {overview.retention_by_skill.map(r => (
            <li key={r.skill_code}>
              {r.label}: {r.total} reviews, {r.retention != null ? `${Math.round(r.retention*100)}%` : '—'} correct
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h4 style={{ margin: '4px 0' }}>Avg stability by skill</h4>
        <ul style={{ paddingLeft: 18 }}>
          {overview.stability_by_skill.map(s => (
            <li key={s.skill_code}>{s.label}: {s.avg_stability_days ? s.avg_stability_days.toFixed(1) : '—'} days</li>
          ))}
        </ul>
      </section>

      <section>
        <h4 style={{ margin: '4px 0' }}>Leeches (≥ threshold)</h4>
        {overview.leeches.length === 0 ? <p>None 🎉</p> : (
          <ul style={{ paddingLeft: 18 }}>
            {overview.leeches.map(l => (
              <li key={`${l.item_id}-${l.skill_code}`}>{l.value} – {l.label}: {l.lapses} lapses (Lv {l.level})</li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h4 style={{ margin: '4px 0' }}>Due trend (next 7 days)</h4>
        <ul style={{ paddingLeft: 18 }}>
          {overview.due_trend.map(d => (
            <li key={String(d.date)}>{new Date(d.date).toLocaleDateString()}: {d.due_count}</li>
          ))}
        </ul>
      </section>

      <section>
        <h4 style={{ margin: '4px 0' }}>Daily performance (30d)</h4>
        <ul style={{ paddingLeft: 18 }}>
          {daily.series.map(pt => (
            <li key={String(pt.date)}>
              {new Date(pt.date).toLocaleDateString()}: {pt.total} reviews, {pt.retention != null ? `${Math.round(pt.retention*100)}%` : '—'} correct, {Math.round(pt.ms/60000)} min, {pt.new_count} new
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
