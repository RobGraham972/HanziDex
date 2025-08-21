# Contributing to HanziDex

Thanks for helping improve HanziDex! This guide covers workflow, coding style, a11y, and performance expectations for Phase 1.

## Development Setup
- Frontend: `cd frontend && npm i && npm run dev`
- Backend: set up `.env` for Postgres + JWT and run `node backend/server.js`
- Data assets (strokes) are served via `/data` proxy in Vite.

## Branches & Commits
- Branch naming: `feat/…`, `fix/…`, `docs/…`, `chore/…`
- Commit style: short imperative summary + details if needed. Reference issue numbers when applicable.

## Issues & PRs
- Use the Phase 1 template for tracking: “Phase 1 — Product & UX Alignment (Foundation)”.
- Small, focused PRs; include screenshots/GIFs for UI changes.
- Link to acceptance criteria and check them off.

## Code Style
- JS/JSX: follow repo ESLint rules; prefer readable, descriptive names.
- Control flow: early returns; handle edge cases first; avoid deep nesting.
- Comments: explain “why” for complex logic; avoid trivial comments.

## UI/UX & A11y
- Keyboard: all actionable elements must be reachable with Tab/Shift+Tab; focus states visible.
- Dialogs: focus trap inside modal; restore focus on close.
- Labels: inputs and controls must have accessible names; use `aria-label` where needed.
- Motion: honor reduced motion; keep micro‑interactions subtle (<=140ms).
- Contrast: light/dark must pass WCAG AA; verify token choices.

## Performance
- Interaction latency < 60ms; avoid unnecessary re-renders; memoize when needed.
- Lists: virtualize if rendering becomes heavy.
- Network: cache, batch, prefetch on hover for details.

## Testing & QA
- Manual e2e: Dex → Detail → Train → Progress on desktop + mobile widths.
- Verify a11y checklist (see docs/product/Accessibility-Checklist.md).
- Smoke test offline behavior (if added) and error states.

## Telemetry (MVP)
- The backend stores review events. Optional client events can be added post‑MVP.

Happy hacking!
