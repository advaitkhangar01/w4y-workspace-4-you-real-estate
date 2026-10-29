#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# W4Y Server Health Check Script
# Usage: bash healthcheck.sh [BASE_URL]
# Default BASE_URL: http://localhost:3002
# ─────────────────────────────────────────────────────────────────────────────

BASE_URL="${1:-http://localhost:3002}"
PASS=0
FAIL=0
WARN=0

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

ok()   { echo -e "  ${GREEN}✔${RESET}  $1"; ((PASS++)); }
fail() { echo -e "  ${RED}✘${RESET}  $1"; ((FAIL++)); }
warn() { echo -e "  ${YELLOW}⚠${RESET}  $1"; ((WARN++)); }
info() { echo -e "  ${CYAN}ℹ${RESET}  $1"; }
section() { echo -e "\n${BOLD}${CYAN}══ $1 ══${RESET}"; }

echo -e "\n${BOLD}W4Y Node Server — Health Check${RESET}"
echo -e "Target: ${CYAN}${BASE_URL}${RESET}  |  $(date '+%Y-%m-%d %H:%M:%S %Z')\n"

# ─────────────────────────────────────────────────────────────────────────────
# 1. NODE PROCESS
# ─────────────────────────────────────────────────────────────────────────────
section "Node.js Process"

NODE_VER=$(node --version 2>/dev/null)
if [ -n "$NODE_VER" ]; then
  ok "Node.js installed: $NODE_VER"
else
  fail "Node.js not found in PATH"
fi

NPM_VER=$(npm --version 2>/dev/null)
if [ -n "$NPM_VER" ]; then
  ok "npm installed: v$NPM_VER"
else
  warn "npm not found"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 2. PM2 PROCESS STATUS
# ─────────────────────────────────────────────────────────────────────────────
section "PM2 Process"

if command -v pm2 &>/dev/null; then
  ok "PM2 found: $(pm2 --version)"
  
  STATUS=$(pm2 jlist 2>/dev/null)
  if [ -z "$STATUS" ]; then
    warn "No PM2 processes found"
  else
    echo "$STATUS" | node -e "
      const list = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      list.forEach(p => {
        const up = p.pm2_env.status === 'online';
        const icon = up ? '✔' : '✘';
        const mem = (p.monit.memory / 1024 / 1024).toFixed(1);
        const restarts = p.pm2_env.restart_time;
        console.log('  ' + icon + '  ' + p.name + ' | status=' + p.pm2_env.status + ' | port=' + (p.pm2_env.PORT || p.pm2_env.env?.PORT || '?') + ' | mem=' + mem + 'MB | restarts=' + restarts);
      });
    " 2>/dev/null || warn "Could not parse PM2 process list"
  fi
else
  warn "PM2 not installed or not in PATH"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 3. PORT LISTENING
# ─────────────────────────────────────────────────────────────────────────────
section "Port Binding"

PORT=$(echo "$BASE_URL" | grep -oP '(?<=:)\d+')
PORT="${PORT:-3002}"

if ss -tlnp 2>/dev/null | grep -q ":$PORT"; then
  PROC=$(ss -tlnp | grep ":$PORT" | grep -oP 'pid=\K[0-9]+' | head -1)
  PNAME=$(ps -p "$PROC" -o comm= 2>/dev/null || echo "unknown")
  ok "Port $PORT is LISTENING (pid=$PROC, $PNAME)"
else
  fail "Port $PORT is NOT listening — server may be down"
fi

# Check nginx
if command -v nginx &>/dev/null; then
  if systemctl is-active --quiet nginx 2>/dev/null; then
    ok "nginx is running"
    PROXY=$(grep -r "proxy_pass" /etc/nginx/sites-enabled/ 2>/dev/null | grep -oP 'localhost:\K\d+' | head -1)
    if [ -n "$PROXY" ]; then
      info "nginx proxy_pass → localhost:$PROXY"
      [ "$PROXY" = "$PORT" ] && ok "nginx port matches server port ($PORT)" || warn "nginx proxies to $PROXY but server is on $PORT"
    fi
  else
    warn "nginx is installed but NOT running"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# 4. HTTP ENDPOINT CHECKS
# ─────────────────────────────────────────────────────────────────────────────
section "API Endpoints"

check_endpoint() {
  local label="$1"
  local method="$2"
  local path="$3"
  local expected_status="$4"
  local body_file="${5:-}"

  local curl_args=(
    -s -o /tmp/ds16_check_body -w "%{http_code}"
    -X "$method"
    -H "Content-Type: application/json"
    --max-time 5
  )

  # Attach body from temp file if provided
  if [ -n "$body_file" ] && [ -f "$body_file" ]; then
    curl_args+=(-d "@$body_file")
  fi

  RESPONSE=$(curl "${curl_args[@]}" "${BASE_URL}${path}" 2>/dev/null)
  BODY=$(cat /tmp/ds16_check_body 2>/dev/null | head -c 200)

  if [ "$RESPONSE" = "$expected_status" ]; then
    ok "$label → HTTP $RESPONSE"
  elif [ "$RESPONSE" = "000" ]; then
    fail "$label → CONNECTION REFUSED (server not reachable)"
  else
    fail "$label → HTTP $RESPONSE (expected $expected_status) | body: $BODY"
  fi
}

# Write test payloads to temp files (avoids shell quoting issues with curl -d)
printf '{"username":"__invalid__","password":"__invalid__"}' > /tmp/ds16_bad_creds.json
printf '{}' > /tmp/ds16_empty.json

# Health check
check_endpoint "GET /api/health"                             "GET"  "/api/health"             "200"

# Auth — wrong credentials should give 401
check_endpoint "POST /api/auth/login (bad creds → 401)"      "POST" "/api/auth/login"         "401" "/tmp/ds16_bad_creds.json"

# Attendance today — no token should give 401
check_endpoint "GET /api/attendance/today (no auth → 401)"   "GET"  "/api/attendance/today"   "401"

# Check-in — no token should give 401
check_endpoint "POST /api/attendance/checkin (no auth → 401)" "POST" "/api/attendance/checkin" "401" "/tmp/ds16_empty.json"

# Check-out — no token should give 401
check_endpoint "POST /api/attendance/checkout (no auth → 401)" "POST" "/api/attendance/checkout" "401" "/tmp/ds16_empty.json"

# Unknown route — should give 404
check_endpoint "GET /api/__nonexistent__ (→ 404)"             "GET"  "/api/__nonexistent__"    "404"

# Frontend SPA — should serve index.html (200)
check_endpoint "GET / (frontend SPA → 200)"                  "GET"  "/"                       "200"

# ─────────────────────────────────────────────────────────────────────────────
# 5. DATABASE CONNECTIVITY
# ─────────────────────────────────────────────────────────────────────────────
section "PostgreSQL Database"

# Try to source DATABASE_URL from .env
ENV_FILE="/var/www/w4y-api-version/server/.env"
if [ -f "$ENV_FILE" ]; then
  DB_URL=$(grep '^DATABASE_URL=' "$ENV_FILE" | cut -d'=' -f2-)
  info "Found .env at $ENV_FILE"
else
  DB_URL="${DATABASE_URL:-}"
fi

if [ -n "$DB_URL" ]; then
  # Extract credentials using sed/awk (avoids grep PCRE lookbehind compat issues)
  # Format: postgresql://user:pass@host:port/dbname
  DB_USER=$(echo "$DB_URL" | sed 's|.*://\([^:]*\):.*|\1|')
  DB_PASS=$(echo "$DB_URL" | sed 's|.*://[^:]*:\([^@]*\)@.*|\1|')
  DB_HOST=$(echo "$DB_URL" | sed 's|.*@\([^:/]*\).*|\1|')
  DB_PORT=$(echo "$DB_URL" | sed 's|.*:\([0-9][0-9]*\)/.*|\1|')
  DB_NAME=$(echo "$DB_URL" | sed 's|.*/\([^?]*\).*|\1|')
  # Default port if extraction failed
  [[ "$DB_PORT" =~ ^[0-9]+$ ]] || DB_PORT="5432"

  if command -v psql &>/dev/null; then
    # Test connection
    PG_RESULT=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
      -c "SELECT 'ok' AS ping;" -t 2>&1)
    if echo "$PG_RESULT" | grep -q "ok"; then
      ok "PostgreSQL connection: OK (db=$DB_NAME host=$DB_HOST)"

      # Check key tables exist
      TABLES=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -t -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;" 2>/dev/null)

      for tbl in users attendance leave_requests tasks projects app_settings; do
        echo "$TABLES" | grep -q "$tbl" && ok "Table '$tbl' exists" || fail "Table '$tbl' MISSING"
      done

      # Check today's attendance state
      TODAY=$(date '+%Y-%m-%d')
      CHECKIN_COUNT=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -t -c "SELECT COUNT(*) FROM attendance WHERE date='$TODAY' AND check_in IS NOT NULL;" 2>/dev/null | tr -d ' ')
      TOTAL_TODAY=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -t -c "SELECT COUNT(*) FROM attendance WHERE date='$TODAY';" 2>/dev/null | tr -d ' ')

      info "Today ($TODAY): $CHECKIN_COUNT checked-in / $TOTAL_TODAY total records"

      # Check PostgreSQL timezone
      PG_TZ=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -t -c "SHOW timezone;" 2>/dev/null | tr -d ' ')
      PG_DATE=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -t -c "SELECT CURRENT_DATE::text;" 2>/dev/null | tr -d ' ')
      IST_DATE=$(date -u -d '+5 hours 30 minutes' '+%Y-%m-%d' 2>/dev/null || date '+%Y-%m-%d')

      info "PG timezone: $PG_TZ | PG CURRENT_DATE: $PG_DATE | IST date: $IST_DATE"
      [ "$PG_DATE" = "$IST_DATE" ] && ok "PG date matches IST date — no timezone mismatch" \
        || warn "PG CURRENT_DATE ($PG_DATE) ≠ IST date ($IST_DATE) — potential timezone mismatch!"

    else
      fail "PostgreSQL connection FAILED: $(echo "$PG_RESULT" | head -1)"
    fi
  else
    warn "psql not in PATH — skipping DB checks"
  fi
else
  warn "DATABASE_URL not found — skipping DB checks"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 6. DISK & MEMORY
# ─────────────────────────────────────────────────────────────────────────────
section "System Resources"

# Disk
DISK=$(df -h / | awk 'NR==2 {print $3 "/" $2 " used (" $5 ")"}')
DISK_PCT=$(df / | awk 'NR==2 {print $5}' | tr -d '%')
info "Disk: $DISK"
[ "$DISK_PCT" -lt 80 ] && ok "Disk usage OK ($DISK_PCT%)" || warn "Disk usage HIGH ($DISK_PCT%) — consider cleanup"

# Memory
MEM=$(free -h | awk '/^Mem:/ {print $3 "/" $2 " used"}')
MEM_PCT=$(free | awk '/^Mem:/ {printf "%.0f", $3/$2*100}')
info "Memory: $MEM"
[ "$MEM_PCT" -lt 85 ] && ok "Memory usage OK ($MEM_PCT%)" || warn "Memory usage HIGH ($MEM_PCT%)"

# Uploads directory
UPLOADS="/var/www/w4y-api-version/server/uploads"
if [ -d "$UPLOADS" ]; then
  SIZE=$(du -sh "$UPLOADS" 2>/dev/null | cut -f1)
  ok "Uploads directory exists ($SIZE)"
else
  warn "Uploads directory not found at $UPLOADS"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 7. SUMMARY
# ─────────────────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}══ Summary ══${RESET}"
echo -e "  ${GREEN}Passed: $PASS${RESET}  |  ${RED}Failed: $FAIL${RESET}  |  ${YELLOW}Warnings: $WARN${RESET}"

if [ "$FAIL" -gt 0 ]; then
  echo -e "\n  ${RED}${BOLD}⚠ Action required — $FAIL check(s) failed.${RESET}"
  exit 1
elif [ "$WARN" -gt 0 ]; then
  echo -e "\n  ${YELLOW}System is running but has $WARN warning(s) to review.${RESET}"
  exit 0
else
  echo -e "\n  ${GREEN}${BOLD}✔ All checks passed — system is healthy.${RESET}"
  exit 0
fi
