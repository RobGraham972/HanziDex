# HanziDex — Pokédex-style MVP PRD (Phase 1: Foundation)

## 1. Overview
Transform HanziDex into a Pokédex-inspired collection and training app for Chinese characters and words, featuring a card-first grid, detail modal, and a basic SRS training loop with progress insights.

## 2. Goals
- Deliver a clean Dex grid with fast search/filter/sort and accessible navigation.
- Provide a focused Character Detail with overview, strokes, components, examples, and training stats.
- Enable a reveal -> grade training loop with daily limits, undo, and suspend.
- Show a compact progress dashboard that reinforces habit formation.

## 3. Non-Goals (MVP)
- Handwriting canvas drills, achievements, deck sharing, deep i18n, advanced insights/heatmaps.

## 4. Personas
- Beginner "Maya": gentle pacing, clear "what's next," examples. Success: 5-10 new/day, 85-90% retention, 5-10 min/day for 2+ weeks.
- Intermediate "Leo": strong filters, bury siblings, suspend leeches, insights. Success: 90-95% retention, <20% days missed, stability growth.
- Power user "Xiao": speed, keyboard-first trainer, import/export, offline. Success: 150-300 reviews/day within limits, minimal friction.

## 5. IA & Core Flows
- Dex Grid -> Character Detail (tabs: Overview, Strokes, Components, Examples, Stats) -> Training Session -> Progress Dashboard.

```mermaid
graph TD
  A[Landing (Authenticated)] --> B[Dex Grid (Search / Filter / Sort)]
  B -->|Click Card| C[Character Detail Modal]
  C --> C1[Overview]
  C --> C2[Strokes]
  C --> C3[Components]
  C --> C4[Examples]
  C --> C5[Stats]
  C -->|Catch / Discover| D[Discover Action]
  B -->|Open Trainer| E[Training Session]
  C -->|Train Skill| E
  E -->|Grade Again/Hard/Good/Easy| F[SRS Update + Queue Refresh]
  F --> B
  A -->|Open Stats| G[Progress Dashboard]
```

## 6. MVP Scope
- Dex grid
  - Search by Hanzi/word/meaning/pinyin
  - Filters: kind (character/word/radical), HSK, stroke count range, tags
  - Sort: HSK, frequency, last seen, due status
  - Responsive grid, keyboard focus, skeleton loading
- Character detail
  - Overview: value, pinyin w/ tones, meanings, HSK, tags
  - Strokes: animated stroke order (local data)
  - Components: list and "contained in" with quick nav
  - Examples: 1-3 stubbed/DB examples
  - Stats: skill levels, next due, retrievability bar, recent grades
  - "Catch it" to convert discoverable -> discovered
- Tags/collections
  - System tags: HSK level, kind, radicals
  - User tags: create/assign; filter by multiple tags
- Training
  - Reveal-first flow; grade {again, hard, good, easy}; undo; suspend; daily limits
  - Queue prioritization: red -> amber, then by retrievability
  - Keyboard shortcuts: 1..4 grade, space/enter reveal/next, U undo, S suspend
- Preferences
  - Desired retention, daily new/review limits, bury siblings, leech threshold
- Progress dashboard
  - Daily load and time on task; retention by skill (30d); avg stability (days); due trend (7d); leeches; daily performance (30d)
- A11y & Responsiveness
  - Focus management, visible outlines, prefers-reduced-motion, contrast-safe theme

## 7. Success Metrics
- Activation: time-to-first Catch < 2 minutes; first session completion > 70%
- Engagement: D1/D7 retention > 40% / > 20%; median 30-80 reviews/day; 5-12 min session
- Learning: 88-94% 30-day retention; +0.3-0.6 stability days/week; P50 time-to-mastery (Lv>=4 or stability>=7d) < 10 days for HSK1
- Reliability/UX: queue fetch < 400 ms; interaction < 60 ms; CLS < 0.1; crash-free > 99%

## 8. Acceptance Criteria (MVP)
- Dex grid is responsive with keyboard navigation and working search/filter/sort
- Detail modal displays all sections; stroke animations load locally
- Training loop with undo/suspend and daily limits; preferences alter queue
- Dashboard renders overview, retention by skill, stability, due trend, leeches, daily performance
- Accessibility: focus, reduced motion, contrast checks pass
- Performance budgets met: LCP < 2.5s, CLS < 0.1, interaction < 60 ms

## 9. Dependencies
- Backend endpoints: items (discoverable/discovered), skills, training (train/undo/suspend), queue, options, stats
- Local stroke data served under `/data` path (already wired)

## 10. Risks & Mitigations
- Large lists -> list virtualization; image/icon sprites; skeletons; hover prefetch
- Scheduling mismatch -> fall back to rating-based if FSRS not available
- A11y regressions -> checklist and manual QA on dialogs/tabs focus

## 11. References
- lazyjinchuriki/pokedex — clean structure/card layout: https://github.com/lazyjinchuriki/pokedex?utm_source=chatgpt.com
- jpromanonet/pokedex — simple adaptable layout: https://github.com/jpromanonet/pokedex?utm_source=chatgpt.com
- eliasef/pokedex — card/animation ideas: https://github.com/eliasef/pokedex?utm_source=chatgpt.com
- Designing a Pokémon application (Medium): https://medium.com/%40Skaoi/designing-a-pok%C3%A9mon-application-wireframes-ui-and-prototype-9cc6ec4de477?utm_source=chatgpt.com
