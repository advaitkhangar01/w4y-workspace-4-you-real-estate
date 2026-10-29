-- scripts/3_dedup_cleanup.sql
-- Remove duplicates AFTER migration (safe, keeps lowest id)

-- 1. Clients by company_name
DELETE FROM clients a
USING clients b
WHERE a.id > b.id
AND TRIM(LOWER(a.company_name)) = TRIM(LOWER(b.company_name));

-- 2. Vendors by name
DELETE FROM vendors a
USING vendors b
WHERE a.id > b.id
AND TRIM(LOWER(a.name)) = TRIM(LOWER(b.name));

-- 3. Projects by name + client_name
DELETE FROM projects a
USING projects b
WHERE a.id > b.id
AND TRIM(LOWER(a.name)) = TRIM(LOWER(b.name))
AND TRIM(LOWER(a.client_name)) = TRIM(LOWER(b.client_name));

-- 4. Invoices by invoice_no
DELETE FROM invoices a
USING invoices b
WHERE a.id > b.id
AND TRIM(LOWER(a.invoice_no)) = TRIM(LOWER(b.invoice_no));

-- 5. Transactions by reference_id (if exists)
DELETE FROM transactions a
USING transactions b
WHERE a.id > b.id
AND a.reference_id IS NOT NULL
AND a.reference_id = b.reference_id;
