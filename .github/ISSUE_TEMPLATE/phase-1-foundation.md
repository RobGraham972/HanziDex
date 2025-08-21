---
name: "Phase 1 — Product & UX Alignment (Foundation)"
about: "Track MVP scope, IA, personas, metrics, and tasks to complete Phase 1."
title: "Phase 1: Product & UX Alignment (Foundation)"
labels: ["enhancement", "design", "product"]
assignees: []
---

## Objective
Deliver a Pokédex‑inspired HanziDex MVP with a crisp, card‑first UI, basic SRS training loop, and progress insights.

## Acceptance Criteria
- [ ] Dex renders smoothly and is keyboard accessible
- [ ] Search/filter/sort work across large lists
- [ ] Detail modal shows overview, strokes, components, examples, stats
- [ ] Training loop (reveal → grade) with undo/suspend and daily limits
- [ ] Preferences impact queue generation
- [ ] Progress dashboard shows key metrics
- [ ] A11y: focus, reduced motion, contrast pass

---

## 1) Alignment & IA
- [ ] Finalize MVP scope and explicit non‑goals
- [ ] Personas: Beginner, Intermediate, Power user
- [ ] Success metrics (activation, engagement, learning, reliability)
- [ ] IA & core flows: Dex → Detail → Train → Progress
- [ ] Decide theme baseline (Catppuccin pastels) and motion guidelines

## 2) Dex Grid (Search / Filter / Sort)
- [ ] Card grid (responsive, skeleton loading)
- [ ] Search by Hanzi/word/meaning/pinyin
- [ ] Filters: kind (character/word/radical), HSK, stroke count range, tags
- [ ] Sort: HSK, frequency, last seen, due status
- [ ] Keyboard focus, a11y roles/labels

## 3) Character Detail (Modal)
- [ ] Overview: value, pinyin (with tones), meanings, HSK, tags
- [ ] Strokes: animated stroke order (local data)
- [ ] Components: list and "contained in" with quick nav
- [ ] Examples: 1–3 items (stub or DB)
- [ ] Stats: skill levels, next due, retrievability bar, recent grades
- [ ] "Catch it" button to convert discoverable → discovered

## 4) Tags / Collections
- [ ] System tags: HSK level, kind, radicals
- [ ] User tags: create/assign to items (MVP: inline assign)
- [ ] Filter by multiple tags in Dex

## 5) Training (Basic SRS Loop)
- [ ] Queue prioritization: red → amber; tiebreak by retrievability
- [ ] Reveal‑first flow; grade {again, hard, good, easy}
- [ ] Undo last, suspend skill (hotkeys: U, S)
- [ ] Daily limits: new vs reviews; summary at end
- [ ] Keyboard shortcuts (1..4 grades, space/enter reveal/next)

## 6) Preferences
- [ ] Desired retention (0.70–0.99)
- [ ] Daily new and review limits
- [ ] Bury siblings
- [ ] Leech threshold

## 7) Progress Dashboard
- [ ] Overview: avg daily load, time on task
- [ ] Retention by skill (30d)
- [ ] Avg stability by skill (days)
- [ ] Due trend (next 7 days)
- [ ] Leeches list (≥ threshold)
- [ ] Daily performance series (30d)

## 8) Accessibility & Performance
- [ ] Focus management and visible outlines for buttons/cards/dialogs
- [ ] Prefers‑reduced‑motion support
- [ ] Contrast checks for light/dark
- [ ] Virtualize large lists if needed
- [ ] Performance budgets: LCP < 2.5s, CLS < 0.1, interaction < 60ms

## 9) Analytics & Telemetry
- [ ] Capture: trainer start, reveal, grade, duration
- [ ] Track: reviews/day, retention per skill, streak

## 10) Backend & Data Enablement (Cross‑check)
- [ ] Items: discovered/discoverable endpoints wired
- [ ] Skills and training endpoints wired (train, undo, suspend)
- [ ] Training queue honors prefs and daily limits
- [ ] Stats endpoints (overview, daily) available and used
- [ ] Import/export (optional for MVP)

## 11) QA & Design QA
- [ ] Smoke tests across desktop/mobile
- [ ] E2E: Dex → Detail → Train → Progress
- [ ] Design QA: spacing, states, motion, a11y

---

## Notes
- Theme and UI structure inspired by:
  - lazyjinchuriki/pokedex — clean structure and card layout
  - jpromanonet/pokedex — simple, adaptable layout
  - eliasef/pokedex — intuitive cards and animations
  - Medium: Designing a Pokémon application — framing and spacing

References:
- https://github.com/lazyjinchuriki/pokedex?utm_source=chatgpt.com
- https://github.com/jpromanonet/pokedex?utm_source=chatgpt.com
- https://github.com/eliasef/pokedex?utm_source=chatgpt.com
- https://medium.com/%40Skaoi/designing-a-pok%C3%A9mon-application-wireframes-ui-and-prototype-9cc6ec4de477?utm_source=chatgpt.com


