import { randomBytes, createHash } from 'node:crypto'
import bcrypt from 'bcrypt'
import { createMiddleware } from 'hono/factory'
import { getSignedCookie, setSignedCookie, deleteCookie } from 'hono/cookie'
import type { Context } from 'hono'
import { env } from './env'
import type { AppEnv } from './types'

export const SESSION_COOKIE = 'introspect_sid'
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

export async function setSessionCookie(c: Context, token: string) {
  await setSignedCookie(c, SESSION_COOKIE, token, env.SESSION_SECRET, {
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

export function isSessionTokenValid(token: string | undefined): boolean {
  return isValid(token)
}

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = await getSignedCookie(c, env.SESSION_SECRET, SESSION_COOKIE)
  if (!token || !isValid(token)) return c.json({ error: 'Unauthorized' }, 401)
  c.set('authenticated', true)
  c.set('sessionToken', token)
  await next()
})
