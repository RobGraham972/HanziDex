import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../utils/api.js';
import { loadComponentMap } from '../utils/componentMapLoader.js';
import StrokeViewer from './StrokeViewer.jsx';

export default function HanziModal({ item, onClose, onPrev, onNext, onCatch, onSelectRelated, onUpdate, onDelete }) {
  const { token } = useAuth();
  const [skills, setSkills] = useState([]);
  const [loadingSkills, setLoadingSkills] = useState(false);
  const [_, setSkillsError] = useState('');
  const [trainingSkill, setTrainingSkill] = useState(null);
  const [reviewingSkill, setReviewingSkill] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const isDiscovered = !!item && (String(item.status || '').toUpperCase() === 'DISCOVERED' || item.is_discovered === true);
  const [tab, setTab] = useState('overview'); // overview|strokes|components|examples|stats

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editWord, setEditWord] = useState('');
  const [editDefinition, setEditDefinition] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Examples state
  const [examples, setExamples] = useState([]);
  const [loadingExamples, setLoadingExamples] = useState(false);
  const [generatingExample, setGeneratingExample] = useState(false);
  const [exampleError, setExampleError] = useState('');
  const [includeWords, setIncludeWords] = useState('');
  const [animatingIndex, setAnimatingIndex] = useState(0);
  const [componentMap, setComponentMap] = useState(null);

  useEffect(() => {
    setTab('overview');
    setReviewingSkill(null);
    setExamples([]);
    setIncludeWords('');
    setAnimatingIndex(0);
  }, [item?.id]);

  useEffect(() => {
    let isCancelled = false;
    async function fetchSkills() {
      if (!item || !item.id || !token || !isDiscovered) { setSkills([]); setLoadingSkills(false); setSkillsError(''); return; }
      setLoadingSkills(true);
      setSkillsError('');
      try {
        const data = await api(`/api/items/${item.id}/skills`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!isCancelled) setSkills(Array.isArray(data) ? data : []);
      } catch {
        if (!isCancelled) setSkillsError('');
      } finally {
        if (!isCancelled) setLoadingSkills(false);
      }
    }
    fetchSkills();
    return () => { isCancelled = true; };
  }, [item, item?.id, token, isDiscovered]);

  // Fetch examples when tab is active
  useEffect(() => {
    if (tab !== 'examples' || !item || !token) return;
    let isCancelled = false;
    async function fetchExamples() {
      setLoadingExamples(true);
      setExampleError('');
      try {
        const data = await api(`/api/items/${item.id}/examples`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!isCancelled) setExamples(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!isCancelled) setExampleError(e.message || 'Failed to load examples');
      } finally {
        if (!isCancelled) setLoadingExamples(false);
      }
    }
    fetchExamples();
    return () => { isCancelled = true; };
  }, [tab, item, token]);

  useEffect(() => {
    if (tab === 'strokes' && !componentMap) {
      loadComponentMap().then(setComponentMap);
    }
  }, [tab, componentMap]);

  const statusFromR = (r) => {
    if (r == null) return 'amber';
    if (r >= 0.9) return 'green';
    if (r >= 0.6) return 'amber';
    return 'red';
  };

  const canTrain = (status) => status === 'amber' || status === 'red';

  function startReview(skill) {
    setReviewingSkill(skill);
    setRevealed(false);
  }

  async function submitReview(rating) {
    if (!item || !token || !reviewingSkill) return;
    setTrainingSkill(reviewingSkill.skill_code);
    try {
      await api(`/api/items/${item.id}/skills/${reviewingSkill.skill_code}/train`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rating })
      });
      const updated = await api(`/api/items/${item.id}/skills`, { headers: { Authorization: `Bearer ${token}` } });
      setSkills(Array.isArray(updated) ? updated : []);
      setReviewingSkill(null);
    } catch (e) {
      setSkillsError(e.message || 'Failed to train skill');
    } finally {
      setTrainingSkill(null);
    }
  }

  async function handleConvertDiscoverable(wordValue) {
    if (!token) return;
    try {
      await api('/api/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ item_value: wordValue })
      });
      // Refresh examples to update status
      const updatedExamples = await api(`/api/items/${item.id}/examples`, {
          headers: { Authorization: `Bearer ${token}` }
      });
      setExamples(Array.isArray(updatedExamples) ? updatedExamples : []);
    } catch (e) {
      console.error(e);
      alert(e.message || 'Failed to discover word');
    }
  }

  async function handleGenerateExample() {
    if (!item || !token) return;
    setGeneratingExample(true);
    setExampleError('');
    try {
      const includeList = includeWords.split(/[,，、\s]+/).map(s => s.trim()).filter(Boolean);
      const newExample = await api(`/api/items/${item.id}/examples/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ include_words: includeList })
      });
      setExamples(prev => [newExample, ...prev]);
      setIncludeWords('');
    } catch (e) {
      setExampleError(e.message || 'Failed to generate example');
    } finally {
      setGeneratingExample(false);
    }
  }

  useEffect(() => {
    if (isEditing && item) {
      setEditWord(item.value);
      setEditDefinition(item.english_definition || '');
    }
  }, [isEditing, item]);

  async function handleSave() {
    if (!editWord.trim()) return;
    setSaving(true);
    setSaveError('');
    try {
      const updatedItem = await api(`/api/items/${item.id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({
          word: editWord,
          english_definition: editDefinition
        })
      });
      setIsEditing(false);
      if (onUpdate) onUpdate(updatedItem);
    } catch (err) {
      setSaveError(err.message || 'Failed to update');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Are you sure you want to delete "${item.value}"? This cannot be undone.`)) return;
    
    setSaving(true);
    try {
      await api(`/api/items/${item.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (onDelete) onDelete(item.id);
      onClose();
    } catch (err) {
      setSaveError(err.message || 'Failed to delete');
      setSaving(false);
    }
  }

  if (!item) return null;

  const isCharacter = Array.isArray(item.kinds) && item.kinds.includes('character');
  const hasComponents = Array.isArray(item.components) && item.components.length > 0;
  // User tags removed per feedback

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3 className="app-title" style={{ margin: 0 }}>Hanzi Details</h3>
          <button className="close-btn" onClick={onClose}>✖</button>
        </div>

        {reviewingSkill ? (
          <div style={{ textAlign: 'center', padding: '20px 0', flex: 1 }}>
            {['recognition', 'writing', 'meaning', 'word_recognition', 'word_meaning', 'radical_recognition'].includes(reviewingSkill.skill_code) ? (
              <>
                <h4 style={{ marginBottom: 16 }}>Reviewing: {reviewingSkill.label}</h4>
                <div style={{ fontSize: 46, lineHeight: '54px', marginBottom: 16 }}>
                  {reviewingSkill.card_front}
                </div>
                
                {!revealed ? (
                   <button className="btn btn--accent" onClick={() => setRevealed(true)}>Show Answer</button>
                ) : (
                   <div>
                     <div style={{ marginBottom: 20, padding: '8px 12px', background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                        <span style={{ color: '#475569' }}>{reviewingSkill.card_back}</span>
                     </div>
                     <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                        <button className="btn" onClick={() => submitReview('again')}>Again</button>
                        <button className="btn" onClick={() => submitReview('hard')}>Hard</button>
                        <button className="btn btn--accent" onClick={() => submitReview('good')}>Good</button>
                        <button className="btn" onClick={() => submitReview('easy')}>Easy</button>
                     </div>
                   </div>
                )}
              </>
            ) : (
              <div style={{ padding: '40px 20px' }}>
                <h4 style={{ marginBottom: 16 }}>{reviewingSkill.label}</h4>
                <div style={{ fontSize: 24, color: '#6b7280', marginBottom: 30 }}>
                  Card coming soon
                </div>
              </div>
            )}
            <div style={{ marginTop: 20 }}>
              <button className="btn" onClick={() => setReviewingSkill(null)}>Cancel</button>
            </div>
          </div>
        ) : (
          <>
        {/* Tabs (sticky) */}
        <div className="tabs detail-tabs" role="tablist" aria-label="Detail sections">
          <button className={`tab-btn ${tab === 'overview' ? 'tab-btn--active' : ''}`} role="tab" aria-selected={tab === 'overview'} onClick={() => setTab('overview')}>Overview</button>
          <button className={`tab-btn ${tab === 'strokes' ? 'tab-btn--active' : ''}`} role="tab" aria-selected={tab === 'strokes'} onClick={() => setTab('strokes')}>Strokes</button>
          <button className={`tab-btn ${tab === 'components' ? 'tab-btn--active' : ''}`} role="tab" aria-selected={tab === 'components'} onClick={() => setTab('components')}>Components</button>
          <button className={`tab-btn ${tab === 'examples' ? 'tab-btn--active' : ''}`} role="tab" aria-selected={tab === 'examples'} onClick={() => setTab('examples')}>Examples</button>
          {isDiscovered && (
            <button className={`tab-btn ${tab === 'stats' ? 'tab-btn--active' : ''}`} role="tab" aria-selected={tab === 'stats'} onClick={() => setTab('stats')}>Stats</button>
          )}
        </div>

        {/* Content */}
        {tab === 'overview' && (
          <div>
            {isEditing ? (
                <div style={{ marginBottom: 20, padding: 16, background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                    <div style={{ marginBottom: 12 }}>
                        <label style={{display:'block', fontSize:12, color:'#6b7280', marginBottom: 4}}>Word</label>
                        <input 
                            className="manual-input" 
                            value={editWord} 
                            onChange={e => setEditWord(e.target.value)} 
                            style={{width:'100%', fontSize: 24, padding: 8}}
                        />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                        <label style={{display:'block', fontSize:12, color:'#6b7280', marginBottom: 4}}>Definition</label>
                        <input 
                            className="manual-input" 
                            value={editDefinition} 
                            onChange={e => setEditDefinition(e.target.value)} 
                            style={{width:'100%', padding: 8}}
                        />
                    </div>
                    {saveError && <p style={{color:'crimson', fontSize: 14, marginBottom: 12}}>{saveError}</p>}
                    <div style={{display:'flex', gap:10, justifyContent: 'space-between'}}>
                        <button className="btn" style={{color: 'crimson', borderColor: 'crimson'}} disabled={saving} onClick={handleDelete}>Delete</button>
                        <div style={{display:'flex', gap:10}}>
                            <button className="btn" disabled={saving} onClick={() => setIsEditing(false)}>Cancel</button>
                            <button className="btn btn--accent" disabled={saving} onClick={handleSave}>
                                {saving ? 'Saving...' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    <div className="hanzi-big" style={{ position: 'relative' }}>
                        {item.value}
                        {item.type === 'word' && item.hsk_level === 0 && (
                            <button 
                                className="btn" 
                                style={{ position: 'absolute', right: 0, top: 0, padding: '4px 8px', fontSize: 12, opacity: 0.7 }}
                                onClick={() => setIsEditing(true)}
                                title="Edit Word"
                            >
                                ✎ Edit
                            </button>
                        )}
                    </div>
                    {(item.display_pinyin || item.pinyin) && (
                      <p className="detail-row"><strong>Pinyin:</strong> {item.display_pinyin || item.pinyin}</p>
                    )}
                    {item.english_definition && (
                      <p className="detail-row"><strong>English:</strong> {item.english_definition}</p>
                    )}
                    {item.hsk_level != null && (
                      <p className="detail-row"><strong>HSK:</strong> {item.hsk_level}</p>
                    )}
                    {!!(item.radicals_contained && item.radicals_contained.length) && (
                      <p className="detail-row"><strong>Radicals:</strong> {item.radicals_contained.join(", ")}</p>
                    )}
                    {item.stroke_count != null && (
                      <p className="detail-row"><strong>Strokes:</strong> {item.stroke_count}</p>
                    )}
                </>
            )}
            {/* Tags UI removed */}
          </div>
        )}

        {tab === 'strokes' && (
          <div style={{ textAlign: 'center' }}>
            {isCharacter ? (
              <StrokeViewer 
                char={item.value} 
                width={220} 
                height={220} 
                componentData={componentMap ? componentMap[item.value] : null}
              />
            ) : (
              <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 10 }}>
                {Array.from(item.value).map((char, idx) => (
                  <StrokeViewer 
                    key={`${item.id}-${idx}`}
                    char={char}
                    width={120}
                    height={120}
                    animate={idx === animatingIndex}
                    componentData={componentMap ? componentMap[char] : null}
                    onComplete={() => {
                      if (idx === Array.from(item.value).length - 1) {
                        setTimeout(() => setAnimatingIndex(0), 1500);
                      } else {
                        setAnimatingIndex(idx + 1);
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'components' && (
          <div>
            {hasComponents ? (
              <div className="detail-row">
                <strong>Components:</strong>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  {item.components.map((comp, i) => (
                    <button 
                      key={i} 
                      className="btn" 
                      style={{ minWidth: 40, padding: '4px 8px' }}
                      onClick={() => onSelectRelated && onSelectRelated(comp)}
                    >
                      {comp}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p style={{ color: '#6b7280' }}>No components listed.</p>
            )}

            {!!(item.radicals_contained && item.radicals_contained.length) && (
               <div className="detail-row" style={{ marginTop: 16 }}>
                <strong>Radicals:</strong>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  {item.radicals_contained.map((rad, i) => (
                    <button 
                      key={i} 
                      className="btn" 
                      style={{ minWidth: 40, padding: '4px 8px' }}
                      onClick={() => onSelectRelated && onSelectRelated(rad)}
                    >
                      {rad}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'examples' && (
          <div>
            <div style={{ marginBottom: 16, padding: 12, background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
              <h4 style={{ margin: '0 0 8px' }}>Generate New Example</h4>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input 
                  type="text" 
                  placeholder="Optional: include words (comma separated)" 
                  value={includeWords}
                  onChange={(e) => setIncludeWords(e.target.value)}
                  style={{ flex: 1, padding: '6px 10px', borderRadius: 4, border: '1px solid #d1d5db' }}
                />
                <button 
                  className="btn btn--accent" 
                  onClick={handleGenerateExample}
                  disabled={generatingExample}
                >
                  {generatingExample ? 'Generating...' : 'Generate'}
                </button>
              </div>
              <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>
                AI will try to use only words you know. If needed, it may introduce one new word.
              </p>
              {exampleError && <p style={{ color: 'crimson', fontSize: 13, marginTop: 6 }}>{exampleError}</p>}
            </div>

            {loadingExamples ? (
              <p>Loading examples...</p>
            ) : examples.length === 0 ? (
              <p style={{ color: '#6b7280' }}>No examples generated yet.</p>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {examples.map(ex => (
                  <div key={ex.id} className="example-card">
                    <div style={{ fontSize: 18, marginBottom: 4 }}>{ex.sentence}</div>
                    <div className="example-pinyin">{ex.pinyin}</div>
                    <div className="example-english">{ex.english}</div>
                    {ex.new_word_id && (
                      <div className="example-new-word">
                        <span>New word used: <strong>{ex.new_word_value}</strong></span>
                        {ex.new_word_status === 'DISCOVERED' ? (
                          <span style={{ color: 'var(--accent-5)' }}>Discovered!</span>
                        ) : (
                          <button 
                            className="btn" 
                            style={{ padding: '2px 8px', fontSize: 12 }}
                            onClick={async () => {
                              await handleConvertDiscoverable(ex.new_word_value); 
                            }}
                          >
                            It's now discoverable!
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'stats' && isDiscovered && (
          <div className="skill-tree-wrapper">
            <h4 style={{ margin: '8px 0', textAlign: 'center' }}>Skill Tree</h4>
            {loadingSkills ? (
              <p style={{ textAlign: 'center' }}>Loading skills…</p>
            ) : skills.length === 0 ? (
              <p style={{ textAlign: 'center' }}>No skills for this item yet.</p>
            ) : (
              <div className="skill-tree-container">
                {/* Center Node */}
                <div className="skill-center-node">
                  {item.value}
                </div>
                
                {/* Skill Nodes */}
                {skills.map((s, i) => {
                  const r = typeof s.retrievability === 'number' ? s.retrievability : null;
                  const status = statusFromR(r);
                  const isTrainable = canTrain(status);
                  
                  // Calculate position in a circle
                  // We have N skills. 
                  const total = skills.length;
                  const angle = (i / total) * 2 * Math.PI - Math.PI / 2; // Start at top (-90deg)
                  const radius = 210; // Increased radius for better spacing
                  const x = Math.cos(angle) * radius;
                  const y = Math.sin(angle) * radius;

                  return (
                    <div 
                      key={s.skill_code} 
                      className={`skill-node status--${status} ${isTrainable ? 'trainable' : ''}`}
                      style={{
                        '--x': `${x}px`,
                        '--y': `${y}px`,
                        '--r-percent': `${(r || 0) * 100}%`,
                        '--status-color': status === 'green' ? '#4ade80' : status === 'amber' ? '#fbbf24' : '#f87171'
                      }}
                      onClick={() => isTrainable && startReview(s)}
                      title={`${s.label} - Level ${s.level}`}
                    >
                      <div className="skill-label">{s.label}</div>
                      {isTrainable && <div className="skill-badge">Train</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="modal-nav">
          <button onClick={onPrev}>← Prev</button>
          {typeof onCatch === 'function' && (
            <button onClick={async () => { await onCatch(); }}>Catch it</button>
          )}
          <button onClick={onNext}>Next →</button>
        </div>
        </>
        )}
      </div>
    </div>
  );
}

function CooldownBar({ retrievability, thresholds = { amber: 0.6, green: 0.9 } }) {
  const clamped = typeof retrievability === 'number' ? Math.max(0, Math.min(1, retrievability)) : null;
  const width = 140;
  const height = 8;
  const fillColor = clamped == null
    ? '#9ca3af'
    : (clamped >= thresholds.green ? '#2e7d32' : (clamped >= thresholds.amber ? '#ff8f00' : '#c62828'));
  return (
    <div style={{ position: 'relative', width, height, background: '#e5e7eb', borderRadius: 999, overflow: 'hidden', border: '1px solid #d1d5db' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(clamped ?? 0) * 100}%`, background: fillColor }} />
      <div style={{ position: 'absolute', left: `${thresholds.amber * 100}%`, top: 0, bottom: 0, width: 2, background: '#9ca3af', transform: 'translateX(-1px)' }} />
      <div style={{ position: 'absolute', left: `${thresholds.green * 100}%`, top: 0, bottom: 0, width: 2, background: '#9ca3af', transform: 'translateX(-1px)' }} />
    </div>
  );
}
