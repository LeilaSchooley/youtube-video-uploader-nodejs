const path = require('path');

module.exports = {
  apps: [
    {
      name: "nextjs",
      script: path.join(__dirname, "node_modules/next/dist/bin/next"),
      args: "start",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      error_file: path.join(__dirname, "logs/nextjs-error.log"),
      out_file: path.join(__dirname, "logs/nextjs-out.log"),
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
    },
  ],
};

