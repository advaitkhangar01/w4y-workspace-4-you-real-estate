-- Migration 016: Update late penalty rule days to 0.15 (3 lates = 0.15 day deduction)
INSERT INTO app_settings (key, value, description)
VALUES ('late_penalty_rule_days', '0.15', 'Number of days deducted per penalty trigger (every 3 lates = 0.15 day)')
ON CONFLICT (key) DO UPDATE SET value = '0.15';
