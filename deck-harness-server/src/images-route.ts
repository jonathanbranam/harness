// Image upload/serving endpoint for the `image` object type — see design.md's
// "Image storage: server-local URL, not an embedded data URI". Uploaded bytes
// live under DECK_IMAGES_DIR (gitignored, alongside data/workspace/ but
// deliberately *not* inside the agent's sandboxed workspace — this is
// user-supplied binary content, not something bash/write/edit should read or
// write, so it stays outside permission-gate.ts's jail entirely). This is a
// plain HTTP route hit by the browser, not a pi tool, so it's never reachable
// through that jail regardless.

import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { Hono } from 'hono'
import { requireAuth } from './auth'
import { env } from './env'
import type { AppEnv } from './types'

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
}

function extensionFor(filename: string): string {
  const ext = extname(filename).toLowerCase()
  return ext in MIME_BY_EXT ? ext : '.png'
}

export const imagesRoutes = new Hono<AppEnv>()

imagesRoutes.post('/', requireAuth, async (c) => {
  const body = await c.req.parseBody().catch(() => null)
  const file = body?.file
  if (!(file instanceof File)) return c.json({ error: 'Missing "file" upload' }, 400)

  mkdirSync(env.DECK_IMAGES_DIR, { recursive: true })
  const id = `${randomUUID()}${extensionFor(file.name)}`
  const bytes = new Uint8Array(await file.arrayBuffer())
  writeFileSync(join(env.DECK_IMAGES_DIR, id), bytes)

  return c.json({ id, url: `/api/images/${id}` })
})

imagesRoutes.get('/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  // The id embeds its own extension (see POST above) and is never expected
  // to contain a path separator — reject anything that looks like traversal
  // before it ever touches the filesystem.
  if (id.includes('/') || id.includes('..')) return c.notFound()
  const filePath = join(env.DECK_IMAGES_DIR, id)
  if (!existsSync(filePath)) return c.notFound()
  const contentType = MIME_BY_EXT[extname(id).toLowerCase()] ?? 'application/octet-stream'
  return new Response(new Uint8Array(readFileSync(filePath)), { headers: { 'Content-Type': contentType } })
})
