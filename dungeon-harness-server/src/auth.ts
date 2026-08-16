// Single-user cookie-session auth, reusing track-web's opaque-token pattern
// (see docs/arch/track-web-architecture.md) but in-memory rather than SQLite —
// this harness has exactly one user and one process, so there's nothing a
// sessions table would buy beyond surviving a restart, which just means
// re-logging in after `npm run dev` restarts. Simpler beats persistent here.

import { randomBytes, createHash } from 'node:crypto'
import bcrypt from 'bcrypt'
import { createMiddleware } from 'hono/factory'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { Context } from 'hono'
import { env } from './env'
import type { AppEnv } from './types'

export const SESSION_COOKIE = 'harness_sid'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

const sessions = new Map<string, { expiresAt: number }>() // key: sha256(token) hex

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function createSession(): string {
  const token = randomBytes(32).toString('hex')
  sessions.set(hashToken(token), { expiresAt: Date.now() + SESSION_TTL_MS })
  return token
}

export function destroySession(token: string | undefined) {
  if (token) sessions.delete(hashToken(token))
}

function isValid(token: string | undefined): boolean {
  if (!token) return false
  const record = sessions.get(hashToken(token))
  if (!record) return false
  if (record.expiresAt <= Date.now()) {
    sessions.delete(hashToken(token))
    return false
  }
  return true
}

// Bound the map's growth over a long-lived process; timer is unref'd so it
// never keeps the event loop (or `tsx watch` teardown) alive on its own.
setInterval(
  () => {
    const now = Date.now()
    for (const [hash, record] of sessions) {
      if (record.expiresAt <= now) sessions.delete(hash)
    }
  },
  60 * 60 * 1000,
).unref()

export function checkPassword(password: string): Promise<boolean> {
  return bcrypt.compare(password, env.HARNESS_PASSWORD_HASH)
}

export function setSessionCookie(c: Context, token: string) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  })
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
}

/** Also usable directly by the WebSocket upgrade handler (no Hono context there). */
export function isSessionTokenValid(token: string | undefined): boolean {
  return isValid(token)
}

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!isValid(getCookie(c, SESSION_COOKIE))) return c.json({ error: 'Unauthorized' }, 401)
  c.set('authenticated', true)
  await next()
})
