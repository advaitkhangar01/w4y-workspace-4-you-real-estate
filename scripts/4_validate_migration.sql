-- scripts/4_validate_migration.sql
-- Post-migration health queries

echo "Checking for remaining duplicates..."
SELECT company_name, COUNT(*) FROM clients GROUP BY company_name HAVING COUNT(*) > 1;
SELECT name, COUNT(*) FROM vendors GROUP BY name HAVING COUNT(*) > 1;
SELECT name, client_name, COUNT(*) FROM projects GROUP BY name, client_name HAVING COUNT(*) > 1;

echo "Checking for orphan projects..."
SELECT p.id, p.name, p.client_name 
FROM projects p 
LEFT JOIN clients c ON c.id = p.client_id 
WHERE p.client_id IS NOT NULL AND c.id IS NULL;

echo "Checking for clients without contacts..."
SELECT c.id, c.name FROM clients c 
LEFT JOIN client_contacts cc ON cc.client_id = c.id 
WHERE cc.id IS NULL;
