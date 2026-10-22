/**
 * PM2 ecosystem for PKH / Life OS production.
 *
 * Usage:
 *   npm install -g pm2
 *   pm2 start ecosystem.config.js
 *   pm2 save
 *   pm2 startup  # generates the Windows Service / systemd unit
 *
 * Env vars you will likely want to override:
 *   DATA_DIR        — absolute path to the live data directory (default: C:\PKH_Data)
 *   BACKUP_DIR      — absolute path to the backup directory
 *   PORT            — listen port (default: 3001)
 *   HOST            — bind address (default: 0.0.0.0)
 *   EXPECTED_ORIGIN — the public URL clients use (e.g. http://100.x.x.x:3001 for Tailscale)
 *   BACKUP_ENCRYPTION_KEY      — active backup encryption key (base64)
 *   BACKUP_ENCRYPTION_KEY_ID   — active key id
 *   BACKUP_ENCRYPTION_KEY_RING — JSON object of retired keys
 */
module.exports = {
  apps: [
    {
      name: 'life-os',
      script: './apps/server/dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        HOST: process.env.HOST || '127.0.0.1',
        PORT: Number(process.env.PORT) || 3001,
        DATA_DIR: process.env.DATA_DIR || 'C:\\PKH_Data',
        EXPECTED_ORIGIN: process.env.EXPECTED_ORIGIN || 'http://127.0.0.1:3001',
        BACKUP_DIR: process.env.BACKUP_DIR || '',
        BACKUP_ENCRYPTION_KEY: process.env.BACKUP_ENCRYPTION_KEY || '',
        BACKUP_ENCRYPTION_KEY_ID: process.env.BACKUP_ENCRYPTION_KEY_ID || '',
        BACKUP_ENCRYPTION_KEY_RING: process.env.BACKUP_ENCRYPTION_KEY_RING || '',
      },
      // Restart policy
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      // Logging
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      // Graceful shutdown
      kill_timeout: 5000,
      listen_timeout: 8000,
    },
  ],
};
