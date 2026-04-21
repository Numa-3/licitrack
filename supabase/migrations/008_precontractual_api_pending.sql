-- 008: Scraper-first fallback for precontractual processes
--
-- When the user adds a precontractual process that isn't yet indexed by the
-- public SECOP II dataset (p6dx-8zbt has a 7-day-ish refresh lag), we still
-- want to accept it and bootstrap-scrape it with captcha. This column marks
-- those processes so the worker knows they need scraper-first treatment.
--
-- Lifecycle:
--   1. User pegs link → API route extrae NTC → intenta API pública
--      - HIT  → inserta con datos completos, api_pending=false (flow normal)
--      - MISS → inserta con datos mínimos, api_pending=true
--   2. Worker polling loop (every 30s) detecta api_pending=true sin snapshot →
--      scrape con captcha, guarda snapshot con lo básico + cronograma
--   3. En ciclos subsecuentes, monitor reintenta la API. Cuando aparezca:
--      - enriquece el proceso con datos del dataset
--      - limpia api_pending=false

ALTER TABLE secop_processes
  ADD COLUMN IF NOT EXISTS api_pending boolean NOT NULL DEFAULT false;

-- Partial index: solo cubre las filas pendientes (storage mínimo, scans rápidos)
CREATE INDEX IF NOT EXISTS idx_secop_processes_api_pending
  ON secop_processes (api_pending)
  WHERE api_pending = true;

COMMENT ON COLUMN secop_processes.api_pending IS
  'Precontractual process added manually before it was indexed in public SECOP II dataset. Worker bootstraps via captcha scraper and keeps retrying API enrichment.';
