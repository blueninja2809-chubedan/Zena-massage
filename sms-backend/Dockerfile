# Tuỳ chọn (PaaS): Railway / Render / Fly — không bắt buộc nếu bạn chạy sms-backend trên VPS + firewall TCP 3000.
# VietGuys whitelist = IP máy thực sự gọi API (PaaS ≠ IP VPS).
FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV HOST=0.0.0.0
# Railway/Render/Fly gán PORT; server.js đã đọc process.env.PORT
EXPOSE 3000

CMD ["node", "server.js"]
