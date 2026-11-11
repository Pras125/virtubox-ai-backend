// PM2 config — keeps the copilot running 24/7, restarts on crash, survives reboots (after `pm2 startup` + `pm2 save`).
module.exports = {
  apps: [
    {
      name: 'virtubox-sales-copilot',
      script: 'server.js',
      cwd: __dirname,
      instances: 1, // keep 1: chat history is stored in local JSON files
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 50,
      restart_delay: 3000,
      max_memory_restart: '600M',
      watch: false,
      time: true,
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      env: { NODE_ENV: 'production' },
    },
  ],
};
