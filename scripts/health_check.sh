#!/bin/bash
# scripts/health_check.sh
# Check API health status

BASE="http://localhost:3001"
echo "=== W4Y API Health Check ==="

check_endpoint() {
  local url=$1
  local name=$2
  if curl -sf "$url" > /dev/null; then
    echo "✅ $name OK"
  else
    echo "❌ $name FAILED"
  fi
}

check_endpoint "$BASE/health" "/health"
check_endpoint "$BASE/api/projects" "/api/projects"
check_endpoint "$BASE/api/clients" "/api/clients"
check_endpoint "$BASE/api/vendors" "/api/vendors"
check_endpoint "$BASE/api/tasks" "/api/tasks"

echo "=== Done ==="
