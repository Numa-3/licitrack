-- 010: Permitir source_types precontractuales en secop_process_snapshots
--
-- La migration 002 creó el CHECK constraint `source_type IN ('dataset','page_scrape')`.
-- Esto bloqueaba los inserts del scraper precontractual que usa
-- 'api_precontractual' (snapshot desde API pública SECOP II) y
-- 'scraper_bootstrap' (snapshot desde scraper con captcha cuando la API
-- aún no tiene el proceso).
--
-- Resultado del bug: el worker decía "first snapshot saved" en logs pero el
-- insert fallaba silenciosamente porque monitor.ts no chequeaba el error.
-- La UI mostraba "Sin datos de cronograma" aunque el scraper extraía 14
-- eventos correctamente.

ALTER TABLE secop_process_snapshots
  DROP CONSTRAINT IF EXISTS secop_process_snapshots_source_type_check;

ALTER TABLE secop_process_snapshots
  ADD CONSTRAINT secop_process_snapshots_source_type_check
  CHECK (source_type IN (
    'dataset',
    'page_scrape',
    'api_precontractual',
    'scraper_bootstrap'
  ));

NOTIFY pgrst, 'reload schema';
