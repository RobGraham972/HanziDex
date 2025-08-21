# Design Tokens and Motion (Phase 1)

## Colors (CSS Variables)
- Base: `--bg`, `--surface`, `--text`, `--muted`
- Accents: `--accent`, `--accent-2`, `--accent-3`, `--accent-4`, `--accent-5`
- Status: `--locked`, `--discoverable`, `--discovered`
- Radii: `--radius-xl`, `--radius-lg`, `--radius-md`
- Shadows: `--shadow-soft`, `--shadow-hover`

Alignment: already defined in `frontend/src/App.css`.

## Components
- Card: radius `--radius-xl`, shadows, hover lift, decorative gradients.
- Buttons: rounded (999px), primary accent variant.
- Chips: status colors; inset + drop shadow.
- Modal: `--radius-xl`, shadow hover, centered overlay.

## Motion
- Hover: 80–140ms ease for transform/box-shadow.
- Reveal/grade: minimal motion; respect `.reduced-motion` class.
- Focus: 3px `--accent-2` outline with offset.

## Accessibility
- Contrast > WCAG AA; ensure dark/light CSS variables pass.
- Keyboard focus for `.hanzi-card`, `.btn`, modal controls.
- Reduced motion: `.reduced-motion * { transition: none; animation: none; }`.
