// ╔══════════════════════════════════════════════════════════════╗
// ║  ecosystem.config.js — PM2 生产进程管理                    ║
// ║  集群模式 + 自动重启 + 日志轮转                             ║
// ╚══════════════════════════════════════════════════════════════╝

module.exports = {
  apps: [
    {
      name: "memoryai",
      script: "node_modules/.bin/next",
      args: "start -H 127.0.0.1 -p 3000",
      instances: 2,              // 2 进程（或 "max" 使用所有 CPU）
      exec_mode: "cluster",
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      // 日志
      error_file: "./logs/app-error.log",
      out_file: "./logs/app-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      // 自动重启
      max_restarts: 10,
      min_uptime: "30s",
      restart_delay: 5000,
      // 优雅关闭
      kill_timeout: 10000,
      listen_timeout: 5000,
    },
    // Worker: 离线任务（文明聚类、AI聚合等）
    {
      name: "memoryai-worker",
      script: "./worker/server.py",
      interpreter: "python3",
      instances: 1,
      max_memory_restart: "256M",
      error_file: "./logs/worker-error.log",
      out_file: "./logs/worker-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
