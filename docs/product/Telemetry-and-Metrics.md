# Telemetry and Metrics (Phase 1)

## Events
- trainer_open: { queue_count }
- trainer_reveal: { item_id, skill_code }
- trainer_grade: { item_id, skill_code, rating, duration_ms }
- trainer_undo: { item_id, skill_code }
- skill_suspend: { item_id, skill_code }
- discover_manual: { value }
- discover_catch: { item_id }
- prefs_update: { desired_retention, daily_new_limit, daily_review_limit, bury_siblings, leech_threshold }

Note: backend already stores reviews; consider lightweight client events (console/analytics) post‑MVP.

## Success Metrics (MVP)
- Activation: time‑to‑first Catch < 2m; first session completion > 70%
- Engagement: D1/D7 > 40% / > 20%; median 30–80 reviews/day; session 5–12m
- Learning: 30‑day retention 88–94%; stability +0.3–0.6 days/week; P50 mastery < 10 days (HSK1)
- Reliability: queue < 400ms; interaction < 60ms; CLS < 0.1; crash‑free > 99%
