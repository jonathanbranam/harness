import 'dotenv/config'
import { join } from 'node:path'

function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) {
    console.error(`Error: Missing required environment variable: ${key}`)
    console.error(`See .env.example. Run "npm run hash-password -w deck-harness-server -- '<password>'" to generate HARNESS_PASSWORD_HASH.`)
    process.exit(1)
  }
  return value
}

export const env = {
  HARNESS_PASSWORD_HASH: requireEnv('HARNESS_PASSWORD_HASH'),
  PORT: parseInt(process.env.PORT ?? '4100', 10),
  DECK_WORKSPACE_DIR: process.env.DECK_WORKSPACE_DIR ?? join(import.meta.dirname, '..', 'data', 'workspace'),
  DECK_STATE_FILE: process.env.DECK_STATE_FILE ?? join(import.meta.dirname, '..', 'data', 'decks.json'),
  COOKIE_SECURE: process.env.COOKIE_SECURE === 'true',
  isProd: process.env.NODE_ENV === 'production',
}
