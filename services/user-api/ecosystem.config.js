module.exports = {
  apps: [{
    name: 'napstr-user-api',
    script: 'server.js',
    exec_mode: 'fork',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '300M',
    env: {
      NODE_ENV: 'production',
      PORT: 8081,
      KEYDB_PORT: 6379,
      NODE_APP_INSTANCE: 0,
      wait_ready: true,
      kill_timeout: 3000
    },
    error_file: '/home/napstr/.pm2/logs/napstr-user-api-error.log',
    out_file: '/home/napstr/.pm2/logs/napstr-user-api-out.log',
    pid_file: '/home/napstr/.pm2/pids/napstr-user-api-0.pid',
    node_args: [],
    interpreter: 'node',
    cwd: '/home/napstr/services/user-api'
  }]
};
