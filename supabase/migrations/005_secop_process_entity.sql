-- Add entity_name to secop_processes so the monitor knows which
-- company to switch to when scraping each contract's detail page.
-- This stores the company name from the #companiesSelector dropdown
-- (e.g. "UT SELVA RÍO" or "AMAZONAS DUTTY FREE.COM SAS").

ALTER TABLE secop_processes
  ADD COLUMN IF NOT EXISTS entity_name TEXT;

-- Backfill: for processes discovered from an account that has a single
-- entity_name set, copy it to the processes.
UPDATE secop_processes sp
SET entity_name = sa.entity_name
FROM secop_accounts sa
WHERE sp.account_id = sa.id
  AND sp.entity_name IS NULL
  AND sa.entity_name IS NOT NULL;
