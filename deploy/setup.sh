#!/usr/bin/env bash
# One-shot installer for the VirtuBox Sales Copilot on an Ubuntu/Debian server.
#   sudo bash deploy/setup.sh                 → installs Node 20 + PM2, deps, builds knowledge, starts 24/7
#   sudo bash deploy/setup.sh copilot.virtubox.io  → also configures Nginx + free HTTPS for that domain
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DOMAIN="${1:-}"
RUN_USER="${SUDO_USER:-$(whoami)}"
cd "$APP_DIR"

echo "==> App folder: $APP_DIR (runs as $RUN_USER)"

# 1. Node.js 20
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 18 ]; then
  echo "==> Installing Node.js 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo "    node $(node -v)"

# 2. PM2
command -v pm2 >/dev/null || npm install -g pm2

# 3. Dependencies
sudo -u "$RUN_USER" npm ci --omit=dev 2>/dev/null || sudo -u "$RUN_USER" npm install --omit=dev
mkdir -p logs data/chats knowledge && chown -R "$RUN_USER" logs data knowledge

# 4. .env
if [ ! -f .env ]; then
  cp .env.example .env
  SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  sed -i "s/^SESSION_SECRET=.*/SESSION_SECRET=$SECRET/" .env
  chown "$RUN_USER" .env; chmod 600 .env
  echo
  echo "!!  Created .env — edit it now: GROQ_API_KEYS, TEAM_USERS, GOOGLE_API_KEY"
  echo "!!  then re-run:  sudo bash deploy/setup.sh $DOMAIN"
  exit 0
fi

# 5. Build the knowledge index (docs + website + Drive + knowledge/)
echo "==> Building knowledge index (a few minutes the first time)"
sudo -u "$RUN_USER" npm run ingest || echo "    ingest had errors — the server will still start; check logs"

# 6. Start under PM2 and enable on boot
sudo -u "$RUN_USER" pm2 startOrReload ecosystem.config.js
sudo -u "$RUN_USER" pm2 save
env PATH="$PATH" pm2 startup systemd -u "$RUN_USER" --hp "$(eval echo ~"$RUN_USER")" >/dev/null
echo "==> Running: $(sudo -u "$RUN_USER" pm2 jlist | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const a=JSON.parse(d).find(x=>x.name==='virtubox-sales-copilot');console.log(a?a.pm2_env.status:'not found')})")"

# 7. Optional: Nginx + HTTPS
if [ -n "$DOMAIN" ]; then
  apt-get install -y nginx certbot python3-certbot-nginx
  PORT=$(grep -E '^PORT=' .env | cut -d= -f2); PORT=${PORT:-3000}
  sed -e "s/__DOMAIN__/$DOMAIN/g" -e "s/__PORT__/$PORT/g" deploy/nginx.conf > /etc/nginx/sites-available/virtubox-sales-copilot
  ln -sf /etc/nginx/sites-available/virtubox-sales-copilot /etc/nginx/sites-enabled/
  nginx -t && systemctl reload nginx
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "admin@$DOMAIN" --redirect || echo "    certbot failed — check DNS for $DOMAIN points to this server"
  echo "==> Live at https://$DOMAIN"
else
  echo "==> Live at http://<server-ip>:$(grep -E '^PORT=' .env | cut -d= -f2)"
fi
