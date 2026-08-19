// Bookmarks: named board states the designer can come back to.
//
// The point of the library is *interesting starting positions*, cheap to make
// and cheap to throw away — not test cases (see
// docs/dungeon-harness/harness-rebuild/designer-ui-session.md, "The inversion").
// So a bookmark is just the whole bench state written to a file: the board, the
// units wherever they stand, and any session tweaks to unit definitions. Saving
// mid-play costs nothing extra, which means "save this, it's about to get
// interesting" is always available.
//
// Files live outside the agent's jailed workspace, so a bookmark cannot be
// rewritten by a `write`/`edit` tool call — only through the bench.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ContentMap, GameState, UnitDef } from '@repo/dungeon-engine'
import type { UnitType } from './bench-store'

export interface Bookmark {
  name: string
  savedAt: string
  map: ContentMap
  state: GameState
  defOverrides: Partial<Record<UnitType, UnitDef>>
}

export interface BookmarkSummary {
  name: string
  savedAt: string
  board: string
  units: number
}

const MAX_NAME = 60

/** A filename that cannot escape the bookmarks directory, derived from the name. */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_NAME)
}

export class BookmarkStore {
  constructor(private readonly dir: string) {}

  private path(slug: string): string {
    return join(this.dir, `${slug}.json`)
  }

  private ensureDir(): void {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true })
  }

  /** Every bookmark, newest first, as summaries cheap enough to send on every state push. */
  list(): BookmarkSummary[] {
    if (!existsSync(this.dir)) return []
    const summaries: BookmarkSummary[] = []
    for (const file of readdirSync(this.dir)) {
      if (!file.endsWith('.json')) continue
      try {
        const bookmark = JSON.parse(readFileSync(join(this.dir, file), 'utf8')) as Bookmark
        summaries.push({
          name: bookmark.name,
          savedAt: bookmark.savedAt,
          board: `${bookmark.map.size.cols}×${bookmark.map.size.rows}`,
          units: bookmark.state.units.length,
        })
      } catch {
        // A corrupt or half-written file shouldn't take the whole list down —
        // skip it and let the others through.
      }
    }
    return summaries.sort((a, b) => b.savedAt.localeCompare(a.savedAt))
  }

  read(name: string): Bookmark | undefined {
    const slug = slugify(name)
    if (!slug) return undefined
    const path = this.path(slug)
    if (!existsSync(path)) return undefined
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as Bookmark
    } catch {
      return undefined
    }
  }

  /** Save under `name`, overwriting a bookmark of the same name. Returns the stored name. */
  write(bookmark: Bookmark): string {
    const slug = slugify(bookmark.name)
    if (!slug) throw new Error('A bookmark needs a name with at least one letter or number')
    this.ensureDir()
    writeFileSync(this.path(slug), JSON.stringify(bookmark, null, 2), 'utf8')
    return bookmark.name
  }

  delete(name: string): boolean {
    const slug = slugify(name)
    if (!slug) return false
    const path = this.path(slug)
    if (!existsSync(path)) return false
    rmSync(path)
    return true
  }
}
