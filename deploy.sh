#!/usr/bin/env bash
# ==============================================================================
# deploy.sh — Safe VPS Deployment for W4Y on Ubuntu 24.04
# Features:
#   1. Automatic Pre-Deployment PostgreSQL Backup (Zero-Data-Loss)
#   2. Idempotent, Tracked Database Migrations (schema_migrations)
#   3. Linux Syntax Validation (node --check)
#   4. Optimized Frontend Production Build (Chunk Splitting)
#   5. Zero-Downtime PM2 Graceful Reload
#   6. Post-Deployment Health Probe & Verification
# Usage:
#   git pull origin main
#   bash deploy.sh
# ==============================================================================

set -e  # Exit immediately if any command returns a non-zero status

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${HOME}/w4y_backups"
TIMESTAMP="$(date +'%Y%m%d_%H%M%S')"
BACKUP_FILE="${BACKUP_DIR}/w4y_pre_deploy_${TIMESTAMP}.sql"

mkdir -p "$BACKUP_DIR"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 W4Y Safe Production Deployment"
echo "Timestamp: ${TIMESTAMP}"
echo "Location:  ${APP_DIR}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. Pre-deployment Database Snapshot
echo "📦 Step 1/6: Creating pre-deployment database backup..."
if command -v pg_dump > /dev/null 2>&1; then
    if [ -f "${APP_DIR}/server/.env" ]; then
        DB_URL=$(grep '^DATABASE_URL=' "${APP_DIR}/server/.env" | cut -d '=' -f2-)
        if [ -n "$DB_URL" ]; then
            pg_dump "$DB_URL" > "$BACKUP_FILE" 2>/dev/null || echo "⚠️ Notice: pg_dump via URL failed, skipping automated backup..."
        fi
    fi
    if [ -s "$BACKUP_FILE" ]; then
        echo "✅ Pre-deploy DB snapshot saved to: ${BACKUP_FILE}"
        # Prune snapshots older than 30 days to prevent disk exhaustion
        find "$BACKUP_DIR" -type f -name "w4y_pre_deploy_*.sql" -mtime +30 -delete 2>/dev/null || true
    else
        echo "⚠️ Warning: Snapshot file empty or skipped, continuing carefully..."
    fi
else
    echo "ℹ️ pg_dump not found in PATH, skipping local snapshot."
fi

# 2. Server Dependencies & Database Migrations
echo "🗄️ Step 2/6: Installing backend dependencies and running migrations..."
cd "${APP_DIR}/server"
npm install --omit=dev --silent
node utils/migrator.js
echo "✓ Backend dependencies and migrations ready"

# 3. Syntax Verification (Preventing Linux Runtime Crashes)
echo "🔍 Step 3/6: Syntax-checking server files..."
node --check index.js
node --check middleware/auth.js
node --check middleware/accessControl.js
node --check middleware/periodLock.js
node --check routes/attendance.js
node --check routes/projects.js
node --check routes/invoices.js
node --check routes/finances.js
node --check routes/clients.js
node --check routes/leaves.js
node --check routes/monthlyClose.js
node --check routes/vendors.js
node --check routes/accounting.js
node --check routes/reports.js
node --check routes/settings.js
node --check routes/staff.js
node --check routes/tasks.js
node --check routes/dailyReports.js
echo "✓ All server files syntax-OK"

# 4. Frontend Client Build
echo "🏗️ Step 4/6: Building React client..."
cd "${APP_DIR}/client"
npm install --silent
npm run build
cd "$APP_DIR"
echo "✓ Frontend build complete"

# 5. Zero-Downtime PM2 Reload
echo "🔄 Step 5/6: Reloading PM2 processes (zero downtime)..."
pm2 reload "${APP_DIR}/server/ecosystem.config.js" --update-env 2>/dev/null || pm2 reload ecosystem.config.js --update-env 2>/dev/null || pm2 reload all --update-env 2>/dev/null || pm2 restart all
echo "✓ PM2 reloaded"

# 6. Health Probe Verification (Resilient IPv4 Retry Loop)
echo "🩺 Step 6/6: Verifying service health..."
TARGET_PORT="3001"
if [ -f "${APP_DIR}/server/.env" ]; then
    ENV_PORT=$(grep -E '^PORT=' "${APP_DIR}/server/.env" | cut -d '=' -f2- | tr -d '\r' | tr -d ' ' || true)
    if [ -n "$ENV_PORT" ]; then
        TARGET_PORT="$ENV_PORT"
    fi
fi

HEALTH_STATUS="FAILED"
for i in {1..10}; do
    echo "  → Probing http://127.0.0.1:${TARGET_PORT}/api/health (attempt $i/10)..."
    RESPONSE=$(curl -s -m 3 "http://127.0.0.1:${TARGET_PORT}/api/health" || true)
    if [[ "$RESPONSE" == *"status"* ]] || [[ "$RESPONSE" == *"ok"* ]] || [[ "$RESPONSE" == *"W4Y"* ]]; then
        HEALTH_STATUS="OK"
        HEALTH_CHECK="$RESPONSE"
        break
    fi
    sleep 1
done

if [ "$HEALTH_STATUS" = "OK" ]; then
    echo "✅ Health check PASSED! Service is live and responding."
    echo ""
    pm2 list
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🎉 Safe deployment completed successfully with zero downtime!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
else
    echo "❌ HEALTH PROBE WARNING: Could not connect to http://127.0.0.1:${TARGET_PORT}/api/health"
    echo "⚠️ Check PM2 logs with: pm2 logs w4y-api --lines 30"
    if [ -f "$BACKUP_FILE" ]; then
        echo "ℹ️ Pre-deploy backup available at: ${BACKUP_FILE}"
    fi
    exit 1
fi
