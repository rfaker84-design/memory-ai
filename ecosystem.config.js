// PM2 Process Manager configuration for MemoryAI
// Usage: pm2 start ecosystem.config.js

module.exports = {
  apps: [
    {
      name: "memoryai",
      script: "node_modules/.bin/next",
      args: "start -p 3000",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
      // Logging
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      merge_logs: true,
      // Restart strategy
      max_restarts: 10,
      restart_delay: 5000,
      // Health check
      wait_ready: true,
      listen_timeout: 30000,
      kill_timeout: 10000,
    },
  ],
};