## 1. client-deck: theme foundation

- [x] 1.1 Add `@custom-variant dark (&:where(.dark, .dark *));` to `client-deck/src/index.css` so `dark:` classes are class-driven, not media-query-driven.
- [x] 1.2 Add an inline theme-resolution `<script>` to `client-deck/index.html`'s `<head>` that reads `localStorage["deck-harness-theme"]`, falls back to `matchMedia('(prefers-color-scheme: dark)')`, and toggles the `.dark` class on `document.documentElement` before React mounts.
- [x] 1.3 Create `client-deck/src/hooks/useTheme.ts` exposing `{ theme, setTheme, toggleTheme }`, reading/writing the `deck-harness-theme` `localStorage` key (guarded with try/catch) and syncing the `.dark` class on `document.documentElement`.

## 2. client-deck: chrome conversion and toggle control

- [x] 2.1 Convert `client-deck/src/pages/DeckPage.tsx` chrome (header, preview-mode wrapper) to theme-aware classes (light base + `dark:` variant matching current look).
- [x] 2.2 Convert `client-deck/src/pages/LoginPage.tsx` to theme-aware classes.
- [x] 2.3 Convert `client-deck/src/components/ChatPanel.tsx` to theme-aware classes.
- [x] 2.4 Convert `client-deck/src/components/DeckSwitcher.tsx` to theme-aware classes.
- [x] 2.5 Convert `client-deck/src/components/SlideSwitcher.tsx` to theme-aware classes.
- [x] 2.6 Convert `client-deck/src/components/ApprovalDialog.tsx` and `client-deck/src/components/AuthGuard.tsx` to theme-aware classes.
- [x] 2.7 Convert only the chrome (toolbar/panel) portions of `client-deck/src/components/DeckCanvas.tsx` to theme-aware classes, leaving the rendered slide surface itself untouched.
- [x] 2.8 Add a theme-toggle button to `DeckPage.tsx`'s header, wired to `useTheme`'s `toggleTheme`.
- [x] 2.9 Verify `client-deck/src/components/PresentationView.tsx` and the slide-rendering surface remain unstyled by theme (no `dark:` classes added there).

## 3. client-introspect: theme foundation

- [x] 3.1 Add `@custom-variant dark (&:where(.dark, .dark *));` to `client-introspect/src/index.css`.
- [x] 3.2 Add the equivalent inline theme-resolution `<script>` to `client-introspect/index.html`'s `<head>`, using the `introspect-harness-theme` `localStorage` key.
- [x] 3.3 Create `client-introspect/src/hooks/useTheme.ts`, mirroring client-deck's hook but scoped to the `introspect-harness-theme` key.

## 4. client-introspect: chrome conversion and toggle control

- [x] 4.1 Convert `client-introspect/src/pages/IntrospectPage.tsx` chrome to theme-aware classes.
- [x] 4.2 Convert `client-introspect/src/pages/LoginPage.tsx` to theme-aware classes.
- [x] 4.3 Convert `client-introspect/src/components/ChatPanel.tsx` to theme-aware classes.
- [x] 4.4 Convert `client-introspect/src/components/ApparatusView.tsx` and `client-introspect/src/components/MarkdownMessage.tsx` to theme-aware classes.
- [x] 4.5 Add a theme-toggle button to `IntrospectPage.tsx`'s header, wired to `useTheme`'s `toggleTheme`.

## 5. Verification

- [x] 5.1 Run `npm run typecheck` and `npm test` from the repo root.
- [x] 5.2 Using `playwright-cli` against the running dev servers, verify client-deck: toggle switches theme live, reload preserves the choice, and a fresh `localStorage` (OS dark/light) picks the right default.
- [x] 5.3 Using `playwright-cli` against the running dev servers, verify client-introspect with the same checks, and confirm its theme choice is independent of client-deck's.
- [x] 5.4 Visually sweep both clients for any remaining hardcoded `bg-gray-9`/`bg-gray-950`/`text-white`/`border-gray-` chrome classes missed by the conversion tasks above.
