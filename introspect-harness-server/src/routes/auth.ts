import { Hono } from 'hono'
import { getSignedCookie } from 'hono/cookie'
import type { AppEnv } from '../types'
import { SESSION_COOKIE, checkPassword, clearSessionCookie, createSession, destroySession, requireAuth, setSessionCookie } from '../auth'
import { env } from '../env'
import { disposeSession } from '../session-store'

export const authRoutes = new Hono<AppEnv>()

authRoutes.post('/login', async (c) => {
  const body = await c.req.json().catch(() => null)
  const password = body?.password
  if (typeof password !== 'string') return c.json({ error: 'Missing password' }, 400)

  if (!(await checkPassword(password))) return c.json({ error: 'Invalid password' }, 401)

  await setSessionCookie(c, createSession())
  return c.json({ ok: true })
})

authRoutes.post('/logout', async (c) => {
  const raw = await getSignedCookie(c, env.SESSION_SECRET, SESSION_COOKIE)
  const token = typeof raw === 'string' ? raw : undefined
  destroySession(token)
  if (token) disposeSession(token)
  clearSessionCookie(c)
  return c.json({ ok: true })
})

authRoutes.get('/me', requireAuth, async (c) => c.json({ authenticated: true }))
