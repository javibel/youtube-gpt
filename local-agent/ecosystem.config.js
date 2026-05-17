module.exports = {
  apps: [
    {
      name: 'ytubviral-agent',
      script: 'index.js',
      watch: false,
      autorestart: true,
      max_restarts: 50,
      min_uptime: 3000,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      merge_logs: true,
    },
    {
      name: 'ytubviral-dashboard',
      script: 'dashboard-server.js',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: 3000,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'logs/dashboard-error.log',
      out_file: 'logs/dashboard-out.log',
      merge_logs: true,
    },
  ],
};
