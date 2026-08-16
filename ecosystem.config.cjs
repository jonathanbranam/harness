// Not needed for local iteration (`npm run dev:deck-server` /
// `npm run dev:introspect-server`) — this is for running
// harness servers unattended on an always-on box (e.g. a NUC), per
// docs/arch/pi-harness.md. `pm2 start ecosystem.config.cjs`.
//
// dotenv (see each src/env.ts) loads .env from cwd automatically, so no
// env_file directive is needed here.
module.exports = {
  apps: [
    {
      name: 'deck-harness-server',
      cwd: './deck-harness-server',
      script: 'npm',
      args: 'start',
      env: { NODE_ENV: 'production' },
      autorestart: true,
      watch: false,
      out_file: '../logs/deck-harness-server-out.log',
      error_file: '../logs/deck-harness-server-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'introspect-harness-server',
      cwd: './introspect-harness-server',
      script: 'npm',
      args: 'start',
      env: { NODE_ENV: 'production' },
      autorestart: true,
      watch: false,
      out_file: '../logs/introspect-harness-server-out.log',
      error_file: '../logs/introspect-harness-server-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'dungeon-harness-server',
      cwd: './dungeon-harness-server',
      script: 'npm',
      args: 'start',
      env: { NODE_ENV: 'production' },
      autorestart: true,
      watch: false,
      out_file: '../logs/dungeon-harness-server-out.log',
      error_file: '../logs/dungeon-harness-server-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
}
