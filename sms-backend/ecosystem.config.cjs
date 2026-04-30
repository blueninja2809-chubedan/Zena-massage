/**
 * VPS: OTP backend luôn bật + tự restart — dùng pm2 cục bộ (không cần npm -g).
 *
 *   cd sms-backend && npm install
 *   npm run pm2:start
 *   npm run pm2:save
 *   npm run pm2:startup   # chạy lệnh sudo mà PM2 in ra (gắn vào systemd)
 */
module.exports = {
  apps: [
    {
      name: 'zena-sms-backend',
      cwd: __dirname,
      script: 'server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: 3000,
      },
    },
  ],
};
