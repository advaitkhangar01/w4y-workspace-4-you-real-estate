#!/bin/bash
# scripts/1_export_local_data.sh
# Export active local data using pg_dump (EXCLUDING Tasks & Attendance)
# Usage: ./1_export_local_data.sh "postgresql://user:pass@localhost:5432/W4Y"

LOCAL_DATABASE_URL=$1

if [ -z "$LOCAL_DATABASE_URL" ]; then
  echo "Usage: ./1_export_local_data.sh <LOCAL_DATABASE_URL>"
  exit 1
fi

echo "🚀 Exporting active local data (Excluding Tasks & Attendance)..."

pg_dump \
  --data-only \
  --table=users \
  --table=clients \
  --table=client_contacts \
  --table=client_addresses \
  --table=client_banking \
  --table=vendors \
  --table=projects \
  --table=project_stages \
  --table=project_assignments \
  --table=comments \
  --table=documents \
  --table=project_document_amounts \
  --table=invoices \
  --table=office_expenses \
  --table=expense_audits \
  --table=app_settings \
  --table=holidays \
  --table=employee_leave_summary \
  --table=payroll \
  --table=transactions \
  --table=project_payment_stages \
  "$LOCAL_DATABASE_URL" > local_clean_export.sql

echo "✅ Export complete: local_clean_export.sql"
echo "👉 Next: Upload local_clean_export.sql to VPS and run scripts/2_safe_upsert.sql"
