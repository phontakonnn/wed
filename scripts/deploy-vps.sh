#!/usr/bin/env bash
# ==============================================================================
# PKH / Life OS — Production VPS Deployment Script
# Supports: Ubuntu 22.04 / 24.04 LTS, Debian 12
# Installs Docker, builds containers, sets up Caddy automatic HTTPS
# ==============================================================================
set -euo pipefail

DOMAIN="${1:-}"
ADMIN_PIN="${2:-123456}"

if [ -z "$DOMAIN" ]; then
  echo "Usage: ./scripts/deploy-vps.sh <domain.example.com> [admin_pin]"
  echo "Example: ./scripts/deploy-vps.sh brain.myhome.me 987654"
  exit 1
fi

echo "=========================================================="
echo "🚀 Starting PKH / Life OS Deployment for domain: $DOMAIN"
echo "=========================================================="

# 1. Update OS and install prerequisites
echo "📦 Updating packages and installing prerequisites..."
sudo apt-get update && sudo apt-get install -y --no-install-recommends \
  curl \
  ca-certificates \
  gnupg \
  ufw \
  git

# 2. Install Docker & Docker Compose if not present
if ! command -v docker &> /dev/null; then
  echo "🐳 Installing Docker Engine..."
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt-get update
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

# 3. Configure Firewall (UFW)
echo "🛡️ Configuring Firewall rules (SSH: 22, HTTP: 80, HTTPS: 443)..."
sudo ufw allow 22/tcp || true
sudo ufw allow 80/tcp || true
sudo ufw allow 443/tcp || true
sudo ufw --force enable || true

# 4. Generate Production .env
echo "⚙️ Configuring production .env..."
cat <<EOF > .env
NODE_ENV=production
PORT=3001
HOST=0.0.0.0
DATA_DIR=/data
APP_ORIGIN=https://${DOMAIN}
EXPECTED_ORIGIN=https://${DOMAIN}
ADMIN_GATE_PIN=${ADMIN_PIN}
EOF

# 5. Build and launch Docker Compose
echo "🔨 Building Docker images and starting services..."
docker compose down || true
docker compose build --no-cache
docker compose up -d

# 6. Install and configure Caddy Reverse Proxy for Automatic HTTPS
if ! command -v caddy &> /dev/null; then
  echo "🔒 Installing Caddy for automated Let's Encrypt HTTPS..."
  sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
  sudo apt-get update
  sudo apt-get install -y caddy
fi

echo "📝 Setting up Caddyfile for ${DOMAIN}..."
cat <<EOF | sudo tee /etc/caddy/Caddyfile
${DOMAIN} {
    encode gzip zstd
    reverse_proxy 127.0.0.1:3001 {
        header_up X-Forwarded-Proto https
        header_up Host {host}
    }
}
EOF

sudo systemctl restart caddy

echo "=========================================================="
echo "✅ Deployment Complete!"
echo "🌐 Your Life OS is live at: https://${DOMAIN}"
echo "🔑 Admin PIN set to: ${ADMIN_PIN}"
echo "=========================================================="
