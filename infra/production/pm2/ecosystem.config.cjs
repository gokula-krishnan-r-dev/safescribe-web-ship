module.exports = {
  apps: [
    {
      name: 'safescribe-api',
      cwd: '/opt/safescribe/apps/api',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '400M',
      // NestJS ConfigModule also loads /opt/safescribe/.env (symlink to api.env)
      env: {
        NODE_ENV: 'production',
      },
      error_file: '/var/log/safescribe/api-error.log',
      out_file: '/var/log/safescribe/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      kill_timeout: 10_000,
      listen_timeout: 15_000,
      max_restarts: 10,
      min_uptime: '10s',
    },
  ],
};
