import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../utils/api.js';

export default function HanziModal({ item, onClose, onPrev, onNext, onCatch }) {
  const { token } = useAuth();
  const [skills, setSkills] = useState([]);
  const [loadingSkills, setLoadingSkills] = useState(false);
  const [_, setSkillsError] = useState('');
  const [trainingSkill, setTrainingSkill] = useState(null);
  const isDiscovered = !!item && String(item.status || '').toUpperCase() === 'DISCOVERED';

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
        if (!isCancelled) setSkillsError(''); // Hide backend message for non-discovered
      } finally {
        if (!isCancelled) setLoadingSkills(false);
      }
    }
    fetchSkills();
    return () => { isCancelled = true; };
  }, [item, item?.id, token, isDiscovered]);

  const statusColor = useMemo(() => ({
    green: '#2e7d32',
    amber: '#ff8f00',
    red: '#c62828'
  }), []);

  const statusFromR = (r) => {
    if (r == null) return 'amber';
    if (r >= 0.9) return 'green';
    if (r >= 0.6) return 'amber';
    return 'red';
  };

  const canTrain = (status) => status === 'amber' || status === 'red';

  async function handleTrain(skillCode, outcome = 'success') {
    if (!item || !token) return;
    setTrainingSkill(skillCode);
    try {
      await api(`/api/items/${item.id}/skills/${skillCode}/train`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ result: outcome })
      });
      // Refresh skills
      const updated = await api(`/api/items/${item.id}/skills`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSkills(Array.isArray(updated) ? updated : []);
    } catch (e) {
      setSkillsError(e.message || 'Failed to train skill');
    } finally {
      setTrainingSkill(null);
    }
  }

  if (!item) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3 className="app-title" style={{ margin: 0 }}>Hanzi Details</h3>
          <button className="close-btn" onClick={onClose}>✖</button>
        </div>

        <div className="hanzi-big">{item.value}</div>

        {item && item.display_pinyin ? (
          <p className="detail-row"><strong>Pinyin:</strong> {item.display_pinyin}</p>
        ) : null}
        {item.english_definition && (
          <p className="detail-row"><strong>English:</strong> {item.english_definition}</p>
        )}
        {item.hsk_level != null && (
          <p className="detail-row"><strong>HSK:</strong> {item.hsk_level}</p>
        )}
        {!!(item.components && item.components.length) && (
          <p className="detail-row"><strong>Components:</strong> {item.components.join(", ")}</p>
        )}
        {!!(item.radicals_contained && item.radicals_contained.length) && (
          <p className="detail-row"><strong>Radicals:</strong> {item.radicals_contained.join(", ")}</p>
        )}
        {item.stroke_count != null && (
          <p className="detail-row"><strong>Strokes:</strong> {item.stroke_count}</p>
        )}

        {/* Skills Section (only for discovered items) */}
        {isDiscovered && (
          <div style={{ marginTop: 16 }}>
            <h4 style={{ margin: '8px 0' }}>Skill Tree</h4>
            {loadingSkills ? (
              <p>Loading skills…</p>
            ) : skills.length === 0 ? (
              <p>No skills for this item yet.</p>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {skills.map(s => {
                  const r = typeof s.retrievability === 'number' ? s.retrievability : null;
                  const derivedStatus = statusFromR(r);
                  // Keep for potential future styling fallbacks
                  // const colorKey = statusColor[derivedStatus] ? derivedStatus : s.status;
                  return (
                  <div key={s.skill_code} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    border: '1px solid #ddd', borderRadius: 8, padding: '6px 10px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontWeight: 600 }}>{s.label}</span>
                      <span style={{ fontSize: 12, color: '#555' }}>Lv {s.level}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <DepletionBar
                          retrievability={r}
                          thresholds={{ amber: 0.6, green: 0.9 }}
                          statusColor={statusColor}
                          stabilityDays={typeof s.stability === 'number' ? s.stability : null}
                          lastTrainedAt={s.last_trained_at || null}
                          greenUntilAt={s.green_until_at || null}
                          redAt={s.red_at || null}
                        />
                        {r != null && (
                          <span style={{ fontSize: 12, color: '#666' }}>
                            R {(r * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn"
                        disabled={!canTrain(derivedStatus) || trainingSkill === s.skill_code}
                        onClick={() => handleTrain(s.skill_code, 'success')}
                      >
                        {trainingSkill === s.skill_code ? 'Training…' : 'Train'}
                      </button>
                    </div>
                  </div>
                );})}
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
      </div>
    </div>
  );
}

function DepletionBar({ retrievability, thresholds = { amber: 0.6, green: 0.9 }, statusColor, stabilityDays, lastTrainedAt, greenUntilAt, redAt }) {
  const [nowTs, setNowTs] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const clamped = typeof retrievability === 'number' ? Math.max(0, Math.min(1, retrievability)) : null;
  const containerWidth = 160;
  const containerHeight = 10;
  const fillColor = clamped == null
    ? '#9ca3af'
    : (clamped >= thresholds.green ? statusColor.green : (clamped >= thresholds.amber ? statusColor.amber : statusColor.red));

  const markerStyle = (pos) => ({
    position: 'absolute',
    left: `${pos * 100}%`,
    top: 0,
    bottom: 0,
    width: 2,
    background: '#9ca3af',
    transform: 'translateX(-1px)'
  });

  const parts = computeCountdownParts(stabilityDays, lastTrainedAt, thresholds, nowTs, greenUntilAt, redAt);
  const titleSuffix = parts.length ? ' • ' + parts.join(' • ') : '';
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'stretch', gap: 2 }}>
      <div
        role="progressbar"
        aria-valuenow={clamped != null ? Math.round(clamped * 100) : undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Memory strength"
        title={clamped != null ? `Retrievability ${(clamped * 100).toFixed(0)}%${titleSuffix}` : 'No data'}
        style={{
          position: 'relative',
          width: containerWidth,
          height: containerHeight,
          background: '#e5e7eb',
          borderRadius: 999,
          overflow: 'hidden',
          border: '1px solid #d1d5db'
        }}
      >
        <div style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: `${(clamped != null ? clamped : 0) * 100}%`,
          background: fillColor,
        }} />
        {/* Threshold markers: amber and green cutoffs */}
        <div style={markerStyle(thresholds.amber)} />
        <div style={markerStyle(thresholds.green)} />
      </div>
      {parts.length > 0 && (
        <div style={{ width: containerWidth, fontSize: 10, color: '#6b7280', textAlign: 'center' }}>
          {parts.join(' • ')}
        </div>
      )}
    </div>
  );
}

function computeCountdownParts(stabilityDays, lastTrainedAt, thresholds, nowTs, greenUntilAt, redAt) {
  const parts = [];
  const toHMS = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
  };

  let amberInSec = null;
  let redInSec = null;

  if (greenUntilAt) {
    const ts = new Date(greenUntilAt).getTime();
    if (Number.isFinite(ts)) amberInSec = Math.max(0, Math.floor((ts - nowTs) / 1000));
  }
  if (redAt) {
    const ts = new Date(redAt).getTime();
    if (Number.isFinite(ts)) redInSec = Math.max(0, Math.floor((ts - nowTs) / 1000));
  }

  if ((amberInSec == null || redInSec == null) && stabilityDays && lastTrainedAt) {
    const last = new Date(lastTrainedAt).getTime();
    if (Number.isFinite(last)) {
      const secondsToR = (targetR) => {
        if (!(targetR > 0 && targetR < 1)) return null;
        const elapsedDays = -Math.log(targetR) * stabilityDays;
        const targetTs = last + elapsedDays * 86400000;
        const deltaMs = targetTs - nowTs;
        return Math.max(0, Math.floor(deltaMs / 1000));
      };
      if (amberInSec == null) amberInSec = secondsToR(thresholds.amber);
      if (redInSec == null) redInSec = secondsToR(0.01);
    }
  }

  if (amberInSec != null) parts.push(`amber in ${toHMS(amberInSec)}`);
  if (redInSec != null) parts.push(`red in ${toHMS(redInSec)}`);
  return parts;
}
