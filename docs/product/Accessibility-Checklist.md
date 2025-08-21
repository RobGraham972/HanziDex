# Accessibility Checklist (Phase 1)

## Keyboard & Focus
- [ ] All interactive controls reachable via keyboard in logical order
- [ ] Visible focus indicators (3px outline) on cards, buttons, tabs, modal controls
- [ ] Modal traps focus and returns it on close; ESC closes modal
- [ ] Trainer supports hotkeys and does not block focus navigation

## Structure & Semantics
- [ ] Meaningful headings and landmarks
- [ ] Buttons/links use correct elements; no div‑buttons
- [ ] Tabs have `role="tablist"`, `role="tab"`, `aria-selected`
- [ ] Lists and counts use proper list semantics

## Names, Labels, and Hints
- [ ] Search input has accessible name
- [ ] Action buttons include `aria-label` where text is not explicit (e.g., icon buttons)
- [ ] Form inputs have labels; errors communicated clearly

## Color & Contrast
- [ ] Text and UI components pass WCAG AA in light/dark themes
- [ ] Status chips legible with sufficient contrast

## Motion & Feedback
- [ ] Respects reduced motion (no essential info conveyed by motion only)
- [ ] Transitions are short and non‑blocking

## Dynamic Content
- [ ] Updates do not cause layout shift (CLS < 0.1)
- [ ] Trainer card update does not steal focus; announce changes if needed

## Strokes & Visualizations
- [ ] Stroke viewer is optional; not the only path to information

## Internationalization Readiness
- [ ] Tone marks and CJK render correctly; fonts provide fallback stacks
