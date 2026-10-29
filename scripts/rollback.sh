#!/bin/bash
# scripts/rollback.sh
# Rollback W4Y CRM to previous version

echo "⚠️ ROLLING BACK..."

cd /var/www/W4Y

# 1. Revert Git to previous commit
echo "==> Reverting Git..."
git reset --hard HEAD@{1}

# 2. Re-install production deps
echo "==> Re-installing deps..."
cd server && npm ci --omit=dev
cd ../client && npm ci && npm run build

# 3. Reload PM2 (Zero-downtime)
echo "==> Reloading PM2..."
cd ..
if pm2 list | grep -q "w4y-api"; then
  pm2 reload w4y-api
else
  pm2 reload w4y-api
fi

echo "✅ Rollback complete. Check status with: pm2 status"
