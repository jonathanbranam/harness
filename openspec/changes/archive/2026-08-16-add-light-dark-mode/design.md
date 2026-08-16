## Context

Both clients (`client-deck`, `client-introspect`) are Vite/React apps using Tailwind v4 (`@tailwindcss/vite`, no `tailwind.config.*` — config lives in CSS via `@import "tailwindcss"` in each `index.css`). Their chrome components currently hardcode a single dark palette directly as Tailwind classes (`bg-gray-900`, `bg-gray-950`, `text-white`, `border-gray-800`, etc.) with no light variant anywhere. There is no shared `packages/` tier yet (see CLAUDE.md), so this design keeps each client independent rather than extracting a shared theme package. See proposal.md - Why / What Changes for motivation and scope; see specs/deck-theme-toggle and specs/introspect/theme-toggle for behavior requirements.

## Goals / Non-Goals

**Goals:**
- A working light palette for each client's chrome, toggled at runtime, with no flash of the wrong theme on load.
- One small, duplicated-by-design theme hook per client (matches this repo's existing per-harness duplication pattern for auth/session code).
- Minimal, mechanical conversion of existing hardcoded dark classes to theme-aware classes.

**Non-Goals:**
- No shared `packages/` theming module — two call sites doesn't meet this repo's "real duplication" bar for extraction (see CLAUDE.md's "No `packages/` tier yet").
- No per-component custom color tokens/CSS variables system; plain Tailwind `dark:` variant classes are sufficient at this UI's size.
- No change to deck/slide rendering colors (explicitly excluded by both specs).

## Decisions

**Tailwind `dark:` variant strategy: class-based via `@custom-variant`, not the media-query default.**
Tailwind v4's `dark:` variant defaults to `@media (prefers-color-scheme: dark)`, which can't be manually overridden by a user toggle. Each client's `index.css` will instead declare:
```css
@custom-variant dark (&:where(.dark, .dark *));
```
so `dark:` classes activate based on a `.dark` class on `<html>`, which the theme hook controls directly. This is the standard Tailwind v4 pattern for manual/persisted dark mode toggles.
Alternative considered: leave `dark:` on the media-query default and only let users follow OS setting (no manual override). Rejected — the proposal and specs explicitly require a manual toggle, not just OS-following.

**Resolve and apply theme before first paint, via an inline script in `index.html`.**
Setting the `.dark` class from a `useEffect` in `main.tsx`/`App.tsx` would render the wrong theme for one frame (flash of unstyled/wrong theme). Instead, a small synchronous inline `<script>` in each client's `index.html` `<head>` reads `localStorage`, falls back to `matchMedia('(prefers-color-scheme: dark)')`, and sets `document.documentElement.classList.toggle('dark', ...)` before React mounts.
Alternative considered: doing this in `main.tsx` before `createRoot(...).render(...)`. Rejected — React still needs a browser paint after mount for the class to matter visually in the worst case is the same, but an inline head script runs strictly earlier (before CSSOM/first paint), which is the conventional fix for this exact flash.

**One `useTheme` hook per client, not shared.**
Each client gets its own `src/hooks/useTheme.ts` exposing `{ theme: 'light' | 'dark', setTheme, toggleTheme }`. It reads the same `localStorage` key the inline script used, writes back on change, and toggles the `.dark` class on `document.documentElement`. Keys are distinct per app (`client-deck` uses `deck-harness-theme`, `client-introspect` uses `introspect-harness-theme`) per the spec's "independent per app" requirement.
Alternative considered: React Context provider wrapping the whole app. Rejected as unnecessary — a single hook called once near the top of each page (`DeckPage`, `IntrospectPage`) and passed down as a prop/used locally by a toggle button is enough at this app's component depth; no deeply nested consumers need the value.

**Chrome class conversion is additive, not a repaint.**
For each hardcoded dark class in chrome components, add a light equivalent as the base (unprefixed) class and move the existing value behind `dark:`. E.g. `bg-gray-900 text-white` becomes `bg-white text-gray-900 dark:bg-gray-900 dark:text-white`. This preserves the current (dark) look exactly when `dark:` is active, so the existing UI is visually unchanged for users who select/default to dark, while adding a real light alternative.

**Presentation view and deck canvas render surface are excluded from conversion.**
`PresentationView.tsx` and the slide-rendering portion of `DeckCanvas.tsx` (the actual slide surface, e.g. its `bg-white` slide background) are left untouched — only their surrounding chrome (toolbars, panels) gets theme classes, per specs/deck-theme-toggle's "Deck content unaffected by theme" requirement.

## Risks / Trade-offs

- [Manual, per-component class edits across many files risk missed spots (a stray hardcoded dark class left un-themed) → Mitigation] Sweep each client's `src/components` and `src/pages` for `bg-gray-9`, `bg-gray-950`, `text-white`, `border-gray-` literals as a checklist during implementation; visually verify both themes with `playwright-cli` per CLAUDE.md's UI-verification guidance.
- [Inline `<script>` in `index.html` is easy to forget to keep in sync between the two clients since it's duplicated → Mitigation] Keep the script minimal (~5 lines) and identical in shape across both `index.html` files so a diff between them stays obvious.
- [`localStorage` unavailable (e.g. private browsing edge cases) → Mitigation] Wrap reads/writes in try/catch and fall back to in-memory/OS-preference behavior for that session; not persisting is an acceptable degradation, not a crash.

## Migration Plan

Purely additive UI change; no data migration. Ships as a normal client rebuild (`npm run build:client-deck` / `npm run build:client-introspect`) — no server changes, no rollback concerns beyond reverting the commit.
