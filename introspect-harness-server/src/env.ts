import 'dotenv/config'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) {
    console.error(`Error: Missing required environment variable: ${key}`)
    console.error(`Run "npm run hash-password -w introspect-harness-server -- '<password>'" to generate HARNESS_PASSWORD_HASH.`)
    process.exit(1)
  }
  return value
}

export const env = {
  HARNESS_PASSWORD_HASH: requireEnv('HARNESS_PASSWORD_HASH'),
  SESSION_SECRET: requireEnv('SESSION_SECRET'),
  PORT: parseInt(process.env.PORT ?? '4200', 10),
  INTROSPECT_WORKSPACE_DIR: process.env.INTROSPECT_WORKSPACE_DIR ?? join(homedir(), '.local', 'share', 'introspect-harness', 'workspace'),
  INTROSPECT_TMP_DIR: process.env.INTROSPECT_TMP_DIR ?? join(tmpdir(), 'introspect-harness', 'tmp'),
  RECORDINGS_DIR: process.env.RECORDINGS_DIR ?? join(import.meta.dirname, '..', 'data', 'recordings'),
  COOKIE_SECURE: process.env.COOKIE_SECURE === 'true',
  isProd: process.env.NODE_ENV === 'production',
}
