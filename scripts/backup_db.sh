#!/bin/bash
# scripts/backup_db.sh
# Automated DB Backup for W4Y CRM

# Use current directory as project root
PROJECT_ROOT="$(pwd)"
BACKUP_DIR="$PROJECT_ROOT/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/ds16_prod_$TIMESTAMP.sql"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

echo "📦 Starting database backup..."

# Use DATABASE_URL from .env if available, or pass as arg
if [ -z "$DATABASE_URL" ]; then
  if [ -f "$PROJECT_ROOT/server/.env" ]; then
    export $(grep -v '^#' "$PROJECT_ROOT/server/.env" | xargs)
  elif [ -f "$PROJECT_ROOT/server/.env.production" ]; then
    export $(grep -v '^#' "$PROJECT_ROOT/server/.env.production" | xargs)
  fi
fi

pg_dump "$DATABASE_URL" > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
  echo "✅ Backup saved: $BACKUP_FILE"
  # Keep only last 10 backups to save space
  ls -t $BACKUP_DIR/*.sql | tail -n +11 | xargs rm -f
else
  echo "❌ Backup FAILED!"
  exit 1
fi
