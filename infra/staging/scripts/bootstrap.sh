#!/usr/bin/env bash
# Bootstrap SafeScribe staging VM (Ubuntu 24.04 LTS).
# Run as root on a fresh e2-small instance.
set -euo pipefail

APP_USER="${APP_USER:-safescribe}"
APP_ROOT="${APP_ROOT:-/opt/safescribe}"
INFRA_SRC="${INFRA_SRC:-/opt/safescribe/infra/staging}"
SECRETS_FILE="${SECRETS_FILE:-/tmp/staging-secrets.env}"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root (sudo)" >&2
  exit 1
fi

if [[ ! -f "$SECRETS_FILE" ]]; then
  echo "Missing secrets file: $SECRETS_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$SECRETS_FILE"
set +a

: "${POSTGRES_PASSWORD:?}"
: "${REDIS_PASSWORD:?}"
: "${JWT_ACCESS_SECRET:?}"
: "${JWT_REFRESH_SECRET:?}"
: "${OPENAI_API_KEY:?}"
if [[ "${RESEND_ENABLED:-true}" != "false" ]]; then
  : "${RESEND_API_KEY:?RESEND_API_KEY is required for transactional email}"
fi

export DEBIAN_FRONTEND=noninteractive

echo "==> System update + packages"
apt-get update -y
apt-get upgrade -y
apt-get install -y \
  ca-certificates curl gnupg lsb-release software-properties-common \
  ufw fail2ban unattended-upgrades apt-listchanges \
  nginx certbot python3-certbot-nginx \
  git build-essential python3.12 python3.12-venv python3-pip \
  jq htop iotop logrotate

echo "==> Swap (2 GB) for e2-small headroom"
if [[ ! -f /swapfile ]]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl vm.swappiness=10
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-safescribe.conf
fi

echo "==> Docker Engine"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable --now docker
fi

echo "==> Node.js 20 + pnpm + PM2"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
npm install -g pnpm@9 pm2

echo "==> App user + directories"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash "$APP_USER"
usermod -aG docker "$APP_USER" || true
mkdir -p \
  "$APP_ROOT" \
  /etc/safescribe \
  /var/log/safescribe \
  /var/backups/safescribe \
  /var/www/certbot \
  /opt/safescribe/releases \
  /opt/safescribe/apps/api/uploads
chown -R "$APP_USER:$APP_USER" "$APP_ROOT" /var/log/safescribe /var/backups/safescribe
chmod 750 /etc/safescribe

echo "==> Unattended security upgrades"
dpkg-reconfigure -f noninteractive unattended-upgrades
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF

echo "==> UFW firewall (SSH/HTTP/HTTPS only)"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo "==> Fail2Ban"
cat > /etc/fail2ban/jail.d/safescribe.conf <<'EOF'
[sshd]
enabled = true
port = ssh
maxretry = 5
bantime = 1h
findtime = 10m

[nginx-http-auth]
enabled = true

[nginx-limit-req]
enabled = true
filter = nginx-limit-req
logpath = /var/log/nginx/*error.log
maxretry = 20
findtime = 2m
bantime = 30m
EOF
systemctl enable --now fail2ban

echo "==> Nginx rate-limit zones"
cat > /etc/nginx/conf.d/safescribe-limits.conf <<'EOF'
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=30r/s;
limit_req_zone $binary_remote_addr zone=ai_limit:10m rate=10r/s;
server_tokens off;
EOF

echo "==> Write environment files"
DB_URL="postgresql://safescribe:${POSTGRES_PASSWORD}@127.0.0.1:5432/safescribe?schema=public"
REDIS_URL="redis://:${REDIS_PASSWORD}@127.0.0.1:6379/0"
AI_REDIS_URL="redis://:${REDIS_PASSWORD}@127.0.0.1:6379/1"

cat > /etc/safescribe/api.env <<EOF
NODE_ENV=production
DATABASE_URL=${DB_URL}
REDIS_URL=${REDIS_URL}
JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
SUPER_ADMIN_EMAIL=${SUPER_ADMIN_EMAIL:-admin@safescribe.ca}
SUPER_ADMIN_PASSWORD=${SUPER_ADMIN_PASSWORD}
API_PORT=3001
API_URL=https://api-staging.safescribe.ca
NEXT_PUBLIC_API_URL=https://api-staging.safescribe.ca
WEB_URL=https://staging.safescribe.ca
AI_ENGINE_URL=http://127.0.0.1:8000
AI_ENGINE_TIMEOUT_MS=420000
AI_ENGINE_INTERNAL_SECRET=${INTERNAL_SECRET:-change-me-internal-secret-32chars}
INTERNAL_SECRET=${INTERNAL_SECRET:-change-me-internal-secret-32chars}
OPENAI_API_KEY=${OPENAI_API_KEY}
OPENAI_MODEL=${OPENAI_MODEL:-gpt-5.6-terra}
OPENAI_FAST_MODEL=${OPENAI_FAST_MODEL:-gpt-5.6-terra}
UPLOAD_DIR=/opt/safescribe/apps/api/uploads
UPLOAD_MAX_SIZE_MB=20
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION_MINUTES=15
SMTP_HOST=${SMTP_HOST:-localhost}
SMTP_PORT=${SMTP_PORT:-1025}
SMTP_FROM=${SMTP_FROM:-noreply@safescribe.ca}
CONTACT_TO_EMAIL=${CONTACT_TO_EMAIL:-support@pharmasafe.ca}
RESEND_ENABLED=${RESEND_ENABLED:-true}
RESEND_API_KEY=$(printf '%q' "${RESEND_API_KEY:-}")
RESEND_FROM_EMAIL=$(printf '%q' "${RESEND_FROM_EMAIL:-Rxnow <noreply@phix.now>}")
RESEND_WEBHOOK_SECRET=$(printf '%q' "${RESEND_WEBHOOK_SECRET:-}")
EMAIL_APP_URL=$(printf '%q' "${EMAIL_APP_URL:-https://staging.safescribe.ca}")
EOF

cat > /etc/safescribe/ai.env <<EOF
DEBUG=false
HOST=127.0.0.1
PORT=8000
WORKERS=1
OPENAI_API_KEY=${OPENAI_API_KEY}
OPENAI_MODEL=${OPENAI_MODEL:-gpt-5.6-terra}
OPENAI_FAST_MODEL=${OPENAI_FAST_MODEL:-gpt-5.6-terra}
REDIS_URL=${AI_REDIS_URL}
INTERNAL_SECRET=${INTERNAL_SECRET:-change-me-internal-secret-32chars}
CORS_ORIGINS=https://staging.safescribe.ca,https://api-staging.safescribe.ca,http://127.0.0.1:3001
OCR_ENABLED=true
OCR_LANGUAGE=eng
NESTJS_CALLBACK_URL=https://api-staging.safescribe.ca/api/v1/ai-engine/callback
EOF

cat > /etc/safescribe/docker.env <<EOF
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
REDIS_PASSWORD=${REDIS_PASSWORD}
EOF

chmod 750 /etc/safescribe
chown root:"$APP_USER" /etc/safescribe
chmod 640 /etc/safescribe/*.env
chown root:"$APP_USER" /etc/safescribe/*.env

# Symlink for NestJS ConfigModule which loads ../../.env from apps/api
ln -sfn /etc/safescribe/api.env /opt/safescribe/.env
# AI engine loads apps/ai-engine/.env
mkdir -p /opt/safescribe/apps/ai-engine
ln -sfn /etc/safescribe/ai.env /opt/safescribe/apps/ai-engine/.env

echo "==> Start Postgres + Redis"
if [[ -d "$INFRA_SRC/docker" ]]; then
  cp -a "$INFRA_SRC/docker/." /opt/safescribe/docker/
  chown -R "$APP_USER:$APP_USER" /opt/safescribe/docker
  cd /opt/safescribe/docker
  docker compose --env-file /etc/safescribe/docker.env up -d
else
  echo "WARN: $INFRA_SRC/docker missing — skip compose for now"
fi

echo "==> Install systemd + PM2 unit files"
if [[ -f "$INFRA_SRC/systemd/safescribe-ai.service" ]]; then
  cp "$INFRA_SRC/systemd/safescribe-ai.service" /etc/systemd/system/
  systemctl daemon-reload
fi
if [[ -f "$INFRA_SRC/pm2/ecosystem.config.cjs" ]]; then
  mkdir -p /opt/safescribe/infra/staging/pm2
  if [[ "$(realpath "$INFRA_SRC/pm2/ecosystem.config.cjs")" != "$(realpath /opt/safescribe/infra/staging/pm2/ecosystem.config.cjs 2>/dev/null || true)" ]]; then
    cp "$INFRA_SRC/pm2/ecosystem.config.cjs" /opt/safescribe/infra/staging/pm2/
  fi
fi

# PM2 loads env from /etc/safescribe/api.env via wrapper
cat > /usr/local/bin/safescribe-api-start <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
set -a
source /etc/safescribe/api.env
set +a
cd /opt/safescribe
exec /usr/bin/pm2 start /opt/safescribe/infra/staging/pm2/ecosystem.config.cjs --update-env
EOF
chmod +x /usr/local/bin/safescribe-api-start

echo "==> Nginx HTTP-only sites (certbot will upgrade to HTTPS)"
# Temporary HTTP reverse-proxy until certs exist
cat > /etc/nginx/sites-available/api-staging.safescribe.ca <<'EOF'
upstream safescribe_api {
    server 127.0.0.1:3001;
    keepalive 16;
}
server {
    listen 80;
    listen [::]:80;
    server_name api-staging.safescribe.ca;
    client_max_body_size 25m;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location = /api/v1/health {
        proxy_pass http://safescribe_api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location / {
        limit_req zone=api_limit burst=60 nodelay;
        proxy_pass http://safescribe_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
EOF

cat > /etc/nginx/sites-available/ai-staging.safescribe.ca <<'EOF'
upstream safescribe_ai {
    server 127.0.0.1:8000;
    keepalive 8;
}

# Cloudflare Full/Strict terminates client TLS and connects to origin :443.
# AI must have its own HTTPS vhost (same Let's Encrypt cert as API is fine).
server {
    listen 80;
    listen [::]:80;
    server_name ai-staging.safescribe.ca;
    client_max_body_size 30m;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ai-staging.safescribe.ca;

    ssl_certificate     /etc/letsencrypt/live/api-staging.safescribe.ca/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api-staging.safescribe.ca/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    client_max_body_size 30m;
    access_log /var/log/nginx/ai-staging.access.log;
    error_log  /var/log/nginx/ai-staging.error.log;

    location = /health {
        proxy_pass http://safescribe_ai;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
    }
    location = /health/ready {
        proxy_pass http://safescribe_ai;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
    }
    location / {
        limit_req zone=ai_limit burst=20 nodelay;
        limit_req_status 429;
        proxy_pass http://safescribe_ai;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_connect_timeout 10s;
        proxy_send_timeout 600s;
        proxy_read_timeout 600s;
    }
}
EOF

ln -sfn /etc/nginx/sites-available/api-staging.safescribe.ca /etc/nginx/sites-enabled/
ln -sfn /etc/nginx/sites-available/ai-staging.safescribe.ca /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable --now nginx
systemctl reload nginx

echo "==> Logrotate"
cat > /etc/logrotate.d/safescribe <<'EOF'
/var/log/safescribe/*.log {
  daily
  rotate 14
  compress
  delaycompress
  missingok
  notifempty
  copytruncate
  su safescribe safescribe
}
EOF

echo "==> Daily backup cron"
cp "$INFRA_SRC/scripts/backup.sh" /usr/local/bin/safescribe-backup 2>/dev/null || true
chmod +x /usr/local/bin/safescribe-backup 2>/dev/null || true
cat > /etc/cron.d/safescribe-backup <<'EOF'
0 3 * * * root /usr/local/bin/safescribe-backup >> /var/log/safescribe/backup.log 2>&1
EOF

# Wipe secrets from /tmp
shred -u "$SECRETS_FILE" 2>/dev/null || rm -f "$SECRETS_FILE"

echo ""
echo "Bootstrap complete."
echo "Next:"
echo "  1. Point DNS A records for api-staging / ai-staging to this VM"
echo "  2. Deploy app code (CI or ./scripts/deploy-all.sh)"
echo "  3. Run: certbot --nginx -d api-staging.safescribe.ca -d ai-staging.safescribe.ca"
echo "  4. Health: curl http://127.0.0.1:3001/api/v1/health && curl http://127.0.0.1:8000/health"
