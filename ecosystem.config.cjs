// Not needed for local iteration (`npm run dev`) — this is for running
// deck-harness-server unattended on an always-on box (e.g. a NUC), per
// docs/arch/pi-harness.md. `pm2 start ecosystem.config.cjs`.
//
// dotenv (see src/env.ts) loads deck-harness-server/.env from cwd
// automatically, so no env_file directive is needed here.
module.exports = {
  apps: [
    {
      name: 'deck-harness-server',
      cwd: './deck-harness-server',
      script: 'npm',
      args: 'start',
      env: { NODE_ENV: 'production' },
      // Restart if it crashes; don't auto-restart on clean exit.
      autorestart: true,
      watch: false,
      out_file: '../logs/deck-harness-server-out.log',
      error_file: '../logs/deck-harness-server-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
}
