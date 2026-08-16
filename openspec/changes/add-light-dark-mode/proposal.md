## Why

Both harness UIs (`client-deck`, `client-introspect`) are hardcoded to a single dark palette (`bg-gray-900`/`bg-gray-950`/`text-white` throughout), with no light theme and no way to switch. Users who want a light UI — e.g. for daytime/bright-room use or to match OS-level light-mode expectations — have no option today.

## What Changes

- Add a manual light/dark theme toggle to `client-deck`'s UI chrome (chat panel, deck switcher, page shell). The deck canvas's **rendered slide content** is unaffected — slide styling is presentation content, not app UI, and stays exactly as authored regardless of theme. `PresentationView.tsx`'s chrome-free slideshow view is likewise excluded, since it displays only the deck itself.
- Add the same manual light/dark theme toggle to `client-introspect`'s UI chrome (chat panel, session/apparatus views, page shell).
- Persist the selected theme in the browser's `localStorage`, independently per client app, so the choice survives reloads.
- Default to the OS-level `prefers-color-scheme` when no stored preference exists yet.
- Introduce a light palette for each client's chrome components (backgrounds, text, borders, panels, controls) and convert their currently-hardcoded dark Tailwind classes into `dark:`-variant classes, so both themes render legibly.

## Capabilities

### New Capabilities
- `deck-theme-toggle`: theme selection UI, `localStorage` persistence, OS-preference default, and dark-mode chrome styling for `client-deck`'s surrounding UI (excludes rendered deck/slide content and the presentation view).
- `introspect/theme-toggle`: theme selection UI, `localStorage` persistence, OS-preference default, and dark-mode chrome styling for `client-introspect`'s UI.

### Modified Capabilities
- None. No existing capability's requirements change; this is a purely additive UI capability in each client.

## Impact

- `client-deck/src`: `index.css` (Tailwind dark-variant setup), a new theme hook/context, `DeckPage.tsx`, `DeckSwitcher.tsx`, and chrome portions of `DeckCanvas.tsx` (not the rendered slide surface itself).
- `client-introspect/src`: `index.css` (Tailwind dark-variant setup), a new theme hook/context, and its page/layout/chat components.
- No server-side changes (`deck-harness-server`, `introspect-harness-server` are unaffected).
- No new dependencies expected — Tailwind v4 supports the `dark:` variant natively; each client implements its own toggle/hook rather than sharing code through a `packages/` tier, consistent with this repo's "no shared tier yet" stance.
