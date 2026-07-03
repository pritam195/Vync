#!/usr/bin/env bash
# =============================================================================
#  Meetify Deploy Update Script
#  Run this on your VPS to pull the latest code and redeploy with zero downtime.
#  Usage: bash scripts/deploy.sh
# =============================================================================
set -euo pipefail

APP_DIR="/opt/meetify"
cd "$APP_DIR"

echo ""
echo "🚀 Meetify — Deploying update at $(date)"
echo "────────────────────────────────────────"

# Pull latest code
echo "▶ Pulling latest code from Git..."
git fetch origin main
git reset --hard origin/main

# Pull updated images if using pre-built (GitHub Container Registry)
echo "▶ Pulling latest Docker images..."
docker compose pull 2>/dev/null || true

# Rebuild images if source changed (only rebuilds what changed)
echo "▶ Building any changed images..."
docker compose build --parallel

# Rolling restart: bring up new containers, then remove old ones
echo "▶ Restarting services..."
docker compose up -d --remove-orphans

# Wait for health check
echo "▶ Waiting for API health check..."
MAX_WAIT=60
COUNT=0
until curl -sf http://localhost:5000/api/health > /dev/null 2>&1; do
  COUNT=$((COUNT + 1))
  if [ "$COUNT" -ge "$MAX_WAIT" ]; then
    echo "❌ Health check timed out after ${MAX_WAIT}s — check logs:"
    docker compose logs --tail=50 server
    exit 1
  fi
  echo "   Waiting... (${COUNT}s)"
  sleep 1
done

# Prune old images to save disk space
echo "▶ Pruning old Docker images..."
docker image prune -f

echo ""
echo "✅ Deployment complete at $(date)"
echo "────────────────────────────────────────"
echo "   Containers:"
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
echo ""
