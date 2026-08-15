# track-web Architecture

Canonical reference for how track-web is actually built and deployed today.
This document describes the **implemented** system only — no proposals or
recommendations. For design notes on the pi-coding-agent harness project
(which deliberately does *not* reuse the shared-server model described here),
see [`pi-harness.md`](./pi-harness.md).

## Overview

track-web is a single self-hosted deployment serving several apps under the
`branam.us` domain, backed by **one shared Hono server process and one
shared SQLite database**. Each app is a separate static SPA (its own npm
workspace, own subdomain, own dev port) that talks to the same backend over
`/api/<area>/*`. There is one user account per app; some apps (watch, trips,
play, games, social) support multiple authenticated users referencing shared
data, but the deployment itself is single-tenant (one household).

## Server (Hono + SQLite)

- **Single Node process** (`src/index.ts` entry, `src/app.ts` builds the
  Hono app), run via `@hono/node-server`'s `serve()`. Dev: `tsx watch
  src/index.ts`. Build: `tsc` (CommonJS/ES2022, `strict: true`) → `out/`.
  Prod start: `node out/src/index.js`, managed by **PM2** — one app defined
  in `ecosystem.config.cjs` (`autorestart: true`, logs to `logs/`). All
  routes for every client app run inside this one process.
- **Routing**: one route module per feature area (`routes/entries.ts`,
  `routes/auth.ts`, `routes/trips.ts`, `routes/games.ts`, `routes/watch/*`,
  etc.), each mounted under `/api/<area>/*`, composed in `app.ts`, wired up
  in `index.ts` with all repositories/dependencies constructed there and
  threaded through as explicit parameters.
- **DB access**: `better-sqlite3` against one file (`data.db` by default,
  path from `SQLITE_PATH` env), routed through a repository layer
  (`repositories/interfaces.ts` + `repositories/sqlite/*`) so route handlers
  stay thin and testable.
- **Auth**: cookie session (`sid`, HttpOnly, 30-day max-age) validated
  against a `sessions` allowlist table (only the token's SHA-256 hash is
  stored) plus optional Bearer API tokens for programmatic/agent access.
  `middleware/auth.ts` gates protected routes.
- **Env**: `src/env.ts` — `requireEnv()` fails fast (logs + `process.exit`)
  on missing required vars, loaded via `dotenv/config`. Pattern:
  `SESSION_SECRET`, `DEPLOY_SECRET`, `PORT`, `SQLITE_PATH`,
  feature-specific keys (e.g. `TMDB_API_KEY`).
- **No WebSocket or long-lived in-process session state anywhere** —
  every route is stateless request/response over SQLite. There is no
  precedent in this codebase for a persistent in-memory session map, agent
  runtime, or streaming connection.

## Data model

Everything lives in one SQLite file, `WAL` journal mode, `foreign_keys = ON`.
Schema is built up through an ordered list of hand-written migrations in
`src/db.ts` (see "Migration mechanics" below) — there is no ORM or schema
DSL; every table is plain SQL.

### Core / auth

| Table | Key columns | Notes |
|---|---|---|
| `users` | `id` PK, `email` UNIQUE, `password_hash`, `display_name?`, `session_nonce?` | Single canonical identity table. `session_nonce` is a legacy column, superseded by the `sessions` table (migration `0037`) but left in place. |
| `sessions` | `id` PK, `user_id → users`, `token_hash` UNIQUE, `expires_at`, `user_agent?` | Cookie-session allowlist; stores only the SHA-256 hash of the opaque `sid` cookie value. |
| `api_tokens` | `id` PK, `user_id → users`, `token_hash` UNIQUE, `label`, `expires_at` | Bearer tokens for programmatic/agent access. |
| `invites` | `id` PK, `token` UNIQUE, `email`, `expires_at`, `used_at?`, `created_by → users` | Admin-issued account-activation links. |

### Social

| Table | Key columns | Notes |
|---|---|---|
| `groups` | `id` PK, `name`, `description?`, `created_by_user_id` | |
| `group_members` | PK `(group_id, user_id)` | |
| `user_invite_codes` | `id` PK, `code` UNIQUE, `expires_at`, `used_by_user_id?` | |
| `user_connections` | PK `(user_id_a, user_id_b)`, `CHECK (user_id_a < user_id_b)` | Undirected friendship, stored once with canonical ordering. |
| `user_connection_requests` | `id` PK, `from_user_id`, `to_user_id`, `status CHECK IN (pending, accepted, declined)`, `CHECK (from_user_id != to_user_id)` | |

### Time tracking

| Table | Key columns | Notes |
|---|---|---|
| `time_entries` | `id` PK, `user_id`, `description`, `tags`, `started_at`, `ended_at?`, `app_id DEFAULT 'time'` | Indexed on `(user_id, started_at)`; partial index on `(user_id, ended_at) WHERE ended_at IS NULL` for the single "running entry" lookup. |

### Watch (movies/TV)

| Table | Key columns | Notes |
|---|---|---|
| `tags` | `id` PK, `name` UNIQUE, `category CHECK IN (genre, cuisine)` | Shared vocabulary, pre-seeded with 20 genres. |
| `movies` | `id` PK, `title`, `runtime_minutes?`, `release_year?`, `tmdb_id?`, `added_by_user_id` | |
| `movie_tags` | PK `(movie_id, tag_id)` | |
| `movie_series` / `movie_series_entries` | `movie_series(id, name)`; entries PK `(series_id, movie_id)`, `position` | Ordered franchise groupings. |
| `user_movies` | PK `(user_id, movie_id)`, `state CHECK IN (unseen, watched, would_watch_again)`, `rating CHECK BETWEEN -2 AND 2` | Per-user watchlist state. |
| `tv_series` | `id` PK, `title`, `episode_runtime_minutes?`, `season_count?`, `release_year?`, `tmdb_id?` | |
| `tv_series_tags` | PK `(series_id, tag_id)` | |
| `user_tv_series` | PK `(user_id, series_id)`, `state CHECK IN (unseen, watching, watched, would_watch_again)`, `current_season?`, `current_episode?` | |
| `people` | `id` PK, `name`, `tmdb_person_id` UNIQUE | |
| `movie_cast` / `tv_cast` | `person_id → people`, `title_id`, `role CHECK IN (cast, director)`, `billing_order`, `UNIQUE(title_id, person_id)` | |
| `watch_events` | `id` PK, `title`, `scheduled_date`, `created_by_user_id`, `completed_at?` | Collaborative watch sessions. |
| `watch_event_invites` | PK `(event_id, user_id)`, `attendance CHECK IN (yes, no, maybe)` | |
| `watch_event_candidates` | `id` PK, `item_type CHECK IN (movie, tv)`, `movie_id?`, `series_id?` | Unique partial indexes prevent duplicate movie/tv candidates per event. |
| `watch_event_votes` | PK `(event_id, candidate_id, user_id)`, `vote CHECK BETWEEN -2 AND 2` | |
| `watch_event_selection` | PK `event_id`, `episode_mode CHECK IN (latest, specific)` | |

### Trips

| Table | Key columns | Notes |
|---|---|---|
| `trips` | `id` PK, `user_id`, `name`, `destination?`, `start_date?`, `end_date?`, `info_markdown?`, `research_markdown?`, `is_current` | |
| `trip_members` | `id` PK, `trip_id → trips ON DELETE CASCADE`, `role CHECK IN (owner, member) DEFAULT owner`, `UNIQUE(trip_id, user_id)` | Membership-based authorization; auto-inserted as `owner` on trip creation. |
| `trip_days` | `id` PK, `trip_id ON DELETE CASCADE`, `date`, `title DEFAULT ''`, `body DEFAULT ''`, `weather?`, `UNIQUE(trip_id, date)` | Auto-generated via `INSERT OR IGNORE` for every date in the trip's range; rows are never deleted so authored content survives date-range edits. |
| `packing_items` | `id` PK, `trip_id ON DELETE CASCADE`, `section DEFAULT ''`, `text`, `position`, `user_id? → users ON DELETE CASCADE` | Nullable `user_id` = shared item; non-null = personal item visible only to that user and the trip owner. |
| `packing_state` | `id` PK, `packing_item_id ON DELETE CASCADE`, `user_id`, `checked DEFAULT 0`, `UNIQUE(packing_item_id, user_id)` | Per-user checked state. |
| `putt_rounds` / `putt_scores` | `putt_rounds(id, trip_id ON DELETE CASCADE, name, created_by)`; `putt_scores(id, round_id ON DELETE CASCADE, user_id, hole CHECK 1..18, strokes CHECK >=1, UNIQUE(round_id, user_id, hole))` | Disc-golf/putt-putt scorecard scoped to a trip. |

### Games platform

| Table | Key columns | Notes |
|---|---|---|
| `game_rooms` | `id` PK, `room_code` UNIQUE, `game_slug`, `host_user_id`, `status CHECK IN (waiting, active, finished, canceled)`, `desired_players`, `current_turn_user_id?`, `custom_details?` (opaque JSON) | Generic multiplayer lobby shared across game types. |
| `game_room_players` | `id` PK, `room_id`, `user_id`, `join_order`, `UNIQUE(room_id, user_id)` | |
| `game_scores` | `id` PK, `user_id`, `game_slug`, `mode`, `level`, `score`, `achieved_at` | Indexed `(game_slug, mode, level, score DESC)` for leaderboard queries. |
| `game_dt_variants` / `game_dt_unit_defs` | `game_dt_variants(variant_id TEXT PK, name, is_default)`; `game_dt_unit_defs(variant_id, archetype, def_json, PK(variant_id, archetype))` | Dungeon Tactics unit tuning, one JSON-document row per archetype per named "scenario"/variant. Renamed from `game_scenarios`/`game_unit_defs` in migration `0034`, dropping a redundant `game_slug` column — every `game_dt_*` table is single-game. |
| `game_dt_regions` / `game_dt_maps` / `game_dt_encounters` | Identity/ordering (`region_id`/`map_id`/`encounter_id`, `sort_order`) as real columns; shaped payload as one Zod-validated `def_json` blob per row | Serialized board content — Region → Map → Encounter — for Dungeon Tactics (terrain grid, tile objects, spawn zones, wave manifest). |

### Play app (score tracker)

| Table | Key columns | Notes |
|---|---|---|
| `score_games` | `id` PK, `user_id` (owner/scorekeeper), `name`, `target_rounds?`, `status DEFAULT 'active'`, `completed_at?` | |
| `score_players` | `id` PK, `game_id ON DELETE CASCADE`, `user_id? → users`, `name`, `position` | `user_id` nullable — free-form player names allowed alongside connected users. |
| `score_round_scores` | PK `(game_id, player_id, round_number)`, both FKs `ON DELETE CASCADE` | Any integer value, including negative/zero. |
| `score_game_names` | `id` PK, `name`, `name_key` UNIQUE | Shared remembered-name list feeding the setup picker; seeded with Sushi Go, Tides of Time, Pit, Farkle, Uno. |

### Migration mechanics

- Migrations are plain TypeScript objects `{ id: string, up(db) }` in a single
  ordered array (`MIGRATIONS` in `src/db.ts`), applied in **array order**
  (not sorted by `id` string) every time `getDb()` opens the database.
  Applied ids are recorded in a `schema_migrations(id, applied_at)` table so
  each migration runs exactly once.
- Every migration is written to be safely re-runnable against a
  partially-migrated or already-migrated DB: table creation uses `CREATE
  TABLE IF NOT EXISTS`; column additions are guarded by a `PRAGMA
  table_info` existence check before `ALTER TABLE ... ADD COLUMN`. There is
  no down-migration/rollback mechanism.
- Migration ids carry a numeric prefix as a human mnemonic only — it is
  **not** a strict ordering guarantee. For example `0019_trips` and
  `0019_api_tokens` share a numeric prefix but are distinct ids, and
  `0012_watch_events` is defined later in the array than `0021_trip_members`.
  Actual execution order is strictly the array's definition order.
- Structural changes SQLite can't do in place (e.g. dropping a column that's
  part of a primary key — migration `0034` removing the redundant
  `game_slug` column from the DT tables) are done by creating a new table,
  copying rows across, and dropping the old table, all inside one
  transaction.
- `TABLE_NAMES` (also in `db.ts`) lists every table in parent-before-child
  order, used by the export/import scripts (`db:export`, `db:import`) to
  dump and restore the database respecting foreign-key dependency order.

## Clients (Vite + React)

- Each client is its own npm workspace: `client-<name>/` with
  `package.json`, `vite.config.ts`, `index.html`, `src/`. Stack: **React 19,
  React Router 7, Vite 6, Tailwind 4**, TypeScript build via
  `tsc -b && vite build`.
- **Shared packages** consumed via `"@repo/x": "*"` workspace deps:
  - `packages/auth` — `AuthProvider`/`useAuth`/`AuthGuard`/`LoginPage`/
    `UserChip`, shared by every client for session-cookie auth.
  - `packages/ui` — shared components.
  - `packages/config` — cross-cutting config, notably `dev-ports.json` (one
    fixed local dev port per app, e.g. `talks: 6055`), imported directly into
    each `vite.config.ts`.
- Dev server proxies `/api` to `http://localhost:3000` (the one backend) via
  Vite's `server.proxy`.
- **Phaser externalization pattern**: any client using Phaser (e.g.
  `client-games`, `client-talks`) sets `build.rollupOptions.external:
  ['phaser']` in `vite.config.ts` and adds a CDN import map in `index.html`
  pinned to the exact version in that app's `package.json`. This exists
  specifically to protect the production build box from a large,
  slow-to-tree-shake dependency (see Deploy pipeline below).

## Caddy / TLS

- **Production `Caddyfile`**: one block per subdomain (`time.branam.us`,
  `talks.branam.us`, …), each with
  `handle /api/* { reverse_proxy localhost:3000 }` +
  `handle { root * <app>/dist; try_files {path} /index.html; file_server }`.
  TLS is fully automatic — `branam.us` has a wildcard DNS record, and Caddy
  obtains a Let's Encrypt cert per subdomain on first request with zero
  extra config.
- **Local `Caddyfile.local`**: mirrors the same block-per-app shape but
  proxies to local dev ports on `*-branam-us.duckdns.org:80` instead of
  terminating TLS.
- Formatting rule: tabs not spaces, `caddy fmt --overwrite` after edits;
  explicit `handle` blocks are required so `file_server` doesn't swallow
  non-GET `/api/*` requests (it only accepts GET/HEAD).

## Deploy pipeline

- `server-deploy.sh` (thin entry point): discards any `package-lock.json`
  churn left by a previous `npm install`, `git pull --ff-only`, execs
  `scripts/build-deploy.sh`.
- `scripts/build-deploy.sh`: writes `version.json` (git sha / commit time /
  build time) → `npm install --include=dev` → sequentially runs
  `build:<each-client>` for all ten client workspaces → `build:server`
  (`tsc`) → `pm2 restart ecosystem.config.cjs --update-env` → `pm2 save` →
  `caddy reload`.
- Triggered by push to `main` (via the GitHub webhook / admin deploy
  trigger). Push to `dev` is backup-only — no rebuild or deploy.
- **Resource ceiling**: production runs on a t4g.micro (2 vCPU burstable, 1
  GB RAM), executing this entire sequential build plus hosting the single
  always-on PM2 process. A build step that is unexpectedly large or
  CPU/memory-intensive can starve the rest of the pipeline and destabilize
  the whole instance — this happened once when Phaser was bundled instead of
  externalized (2026-07-03), which is why the externalization pattern above
  is a hard rule for any client using Phaser.

## Local dev

- `dev-local.sh`: tmux script (must run inside a tmux session) — splits
  panes for every client (`npm run dev -w client-X`), one pane for
  `caddy run --config Caddyfile.local`, and the original pane runs the
  backend (`npm run dev`). Each client dev server binds its fixed port from
  `packages/config/dev-ports.json`.
- Node: v24.x via nvm; no `.nvmrc` is committed, so the version is whatever
  is active in the shell.

## Testing

- **Vitest** is configured at the root (`vitest.config.mts`),
  `environment: 'node'`. `include` explicitly enumerates
  `src/**/*.test.ts` plus test globs in `client-watch`, `client-games`,
  `client-trips`, `client-play`, `client-talks`, and `packages/config` — a
  new workspace has to be added to this list manually to have its tests
  picked up. Run via `npm test` (`vitest run`) at the root. The test
  environment injects `SESSION_SECRET: 'test-secret'`.
- Tests are colocated (`foo.ts` next to `foo.test.ts`), not kept in a
  separate `__tests__` tree.
