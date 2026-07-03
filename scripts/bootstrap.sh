#!/usr/bin/env bash
# =============================================================================
#  Vync VPS Bootstrap Script
#  Run once on a fresh Ubuntu 22.04 VPS as root.
#  Usage:  bash bootstrap.sh <your-domain> <your-email>
#  Example: bash bootstrap.sh vync.yourdomain.com admin@yourdomain.com
# =============================================================================
set -euo pipefail

DOMAIN="${1:?Usage: bash bootstrap.sh <domain> <email>}"
EMAIL="${2:?Usage: bash bootstrap.sh <domain> <email>}"
APP_DIR="/opt/vync"
APP_USER="vync"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║       Vync VPS Bootstrap — $(date +%F)        ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ── 1. System updates ──────────────────────────────────────────────────────────
echo "▶ Updating system packages..."
apt-get update -qq && apt-get upgrade -y -qq

# ── 2. Install Docker ──────────────────────────────────────────────────────────
echo "▶ Installing Docker..."
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
else
  echo "   Docker already installed — skipping."
fi

# ── 3. Install Docker Compose plugin ──────────────────────────────────────────
echo "▶ Installing Docker Compose plugin..."
apt-get install -y -qq docker-compose-plugin

# ── 4. Install Nginx + Certbot ────────────────────────────────────────────────
echo "▶ Installing Nginx and Certbot..."
apt-get install -y -qq nginx certbot python3-certbot-nginx ufw

# ── 5. Create app user and directory ──────────────────────────────────────────
echo "▶ Creating app user and directory..."
if ! id "$APP_USER" &>/dev/null; then
  useradd -r -s /bin/false "$APP_USER"
fi
mkdir -p "$APP_DIR"
usermod -aG docker "$APP_USER" 2>/dev/null || true

# ── 6. Clone repository ───────────────────────────────────────────────────────
echo "▶ Please enter your Git repository URL (e.g. https://github.com/user/vync.git):"
read -r REPO_URL
if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO_URL" "$APP_DIR"
else
  echo "   Repository already cloned — skipping."
fi
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

# ── 7. Configure UFW firewall ─────────────────────────────────────────────────
echo "▶ Configuring firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    comment "SSH"
ufw allow 80/tcp    comment "HTTP"
ufw allow 443/tcp   comment "HTTPS"
ufw allow 3478/tcp  comment "TURN TCP"
ufw allow 3478/udp  comment "TURN UDP"
ufw allow 49152:49200/udp comment "TURN relay ports"
ufw --force enable
echo "   Firewall configured."

# ── 8. Write Nginx reverse proxy config ───────────────────────────────────────
echo "▶ Writing Nginx config for $DOMAIN..."
cat > /etc/nginx/sites-available/vync <<NGINX
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN;

    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options            SAMEORIGIN                            always;
    add_header X-Content-Type-Options     nosniff                               always;
    add_header Referrer-Policy            strict-origin-when-cross-origin       always;

    client_max_body_size 100M;

    # React app + API proxy (all traffic → Docker client on 5173)
    location / {
        proxy_pass         http://127.0.0.1:5173;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
    }

    # WebSocket upgrade for Socket.IO real-time signalling
    location /socket.io/ {
        proxy_pass         http://127.0.0.1:5173/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    \$http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host       \$host;
        proxy_set_header   X-Real-IP  \$remote_addr;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/vync /etc/nginx/sites-enabled/vync
rm -f /etc/nginx/sites-enabled/default
nginx -t

# ── 9. Obtain TLS certificate ─────────────────────────────────────────────────
echo "▶ Obtaining Let's Encrypt certificate for $DOMAIN..."
echo "   (Make sure DNS A record for $DOMAIN already points to this server!)"
certbot --nginx -d "$DOMAIN" --email "$EMAIL" --agree-tos --non-interactive --redirect
systemctl reload nginx

# ── 10. Create .env file ──────────────────────────────────────────────────────
echo ""
echo "▶ Creating .env file at $APP_DIR/.env"
echo "   (Edit this file with your real values before starting services)"
if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.docker.example" "$APP_DIR/.env"
  # Pre-fill the domain and generate a JWT secret
  JWT_SECRET=$(openssl rand -hex 64)
  VPS_IP=$(curl -s ifconfig.me)
  sed -i "s|VITE_SOCKET_URL=.*|VITE_SOCKET_URL=https://$DOMAIN|" "$APP_DIR/.env"
  sed -i "s|VITE_TURN_URL=.*|VITE_TURN_URL=turn:$DOMAIN:3478|" "$APP_DIR/.env"
  sed -i "s|CLIENT_URL=.*|CLIENT_URL=https://$DOMAIN|" "$APP_DIR/.env"
  sed -i "s|TURN_REALM=.*|TURN_REALM=$DOMAIN|" "$APP_DIR/.env"
  sed -i "s|TURN_EXTERNAL_IP=.*|TURN_EXTERNAL_IP=$VPS_IP|" "$APP_DIR/.env"
  sed -i "s|JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  echo "   ✅ .env created with auto-filled domain and JWT secret."
  echo ""
  echo "   ⚠️  Edit the following values manually before starting:"
  echo "   nano $APP_DIR/.env"
  echo "   Required: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET, TURN_PASSWORD"
else
  echo "   .env already exists — skipping."
fi

# ── 11. Set up systemd service for auto-restart ───────────────────────────────
echo "▶ Creating systemd service for Vync..."
cat > /etc/systemd/system/vync.service <<SERVICE
[Unit]
Description=Vync Docker Compose App
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable vync
echo "   Vync systemd service registered (will auto-start on reboot)."

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  ✅  Bootstrap complete!                         ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "  Next steps:"
echo "  1. Edit secrets:   nano $APP_DIR/.env"
echo "  2. Start services: cd $APP_DIR && docker compose up --build -d"
echo "  3. Check health:   curl https://$DOMAIN/api/health"
echo ""
