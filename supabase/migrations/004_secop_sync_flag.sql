-- Add sync_requested_at flag to secop_accounts
-- The worker checks this column to prioritize accounts that need immediate discovery.
-- The UI sets it via POST /api/secop/accounts/[id]/sync.
-- The worker clears it after completing discovery.

ALTER TABLE secop_accounts
  ADD COLUMN IF NOT EXISTS sync_requested_at TIMESTAMPTZ;
