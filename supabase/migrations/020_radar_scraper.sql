-- 020_radar_scraper.sql
-- Radar de descubrimiento near-real-time vía scraping del buscador público de
-- SECOP II (corre en el worker). Independiente del radar de datos abiertos
-- (dataset p6dx-8zbt), que quedó parqueado — la API abierta va ~1 día atrasada
-- y el buscador público refleja la plataforma en tiempo real.
--
-- Dos tablas:
--   secop_radar_config → qué regiones vigilar + filtros (editable por el jefe)
--   secop_radar_seen   → dedup de procesos ya vistos/alertados

-- ── secop_radar_config: una fila por región a vigilar ────────
CREATE TABLE IF NOT EXISTS secop_radar_config (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  region            TEXT NOT NULL UNIQUE,           -- campo "Región" del buscador, ej "Amazonas"
  estado            TEXT NOT NULL DEFAULT '50',     -- selRequestStatus: 50=Publicado
  exclude_keywords  TEXT[] NOT NULL DEFAULT '{}',   -- descarta si referencia/descripción/entidad contiene
  include_keywords  TEXT[] NOT NULL DEFAULT '{}',   -- si no vacío, solo pasa si contiene alguna
  min_value         NUMERIC,                        -- cuantía mínima COP (opcional)
  max_value         NUMERIC,                        -- cuantía máxima COP (opcional)
  enabled           BOOLEAN NOT NULL DEFAULT true,
  seeded_at         TIMESTAMPTZ,                    -- null = primer run pendiente (digest inicial)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER secop_radar_config_updated_at
  BEFORE UPDATE ON secop_radar_config
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Seed: Amazonas, excluyendo los "CONTRATO DE PRESTACION DE SERVICIOS"
-- (vinculación de personal por régimen especial — no son licitaciones).
INSERT INTO secop_radar_config (region, exclude_keywords)
VALUES ('Amazonas', ARRAY['CONTRATO DE PRESTACION DE SERVICIOS'])
ON CONFLICT (region) DO NOTHING;

ALTER TABLE secop_radar_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "secop_radar_config: autenticados leen" ON secop_radar_config
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "secop_radar_config: jefe administra" ON secop_radar_config
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'jefe')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'jefe')
  );

-- ── secop_radar_seen: dedup de procesos vistos/alertados ─────
CREATE TABLE IF NOT EXISTS secop_radar_seen (
  notice_uid        TEXT PRIMARY KEY,               -- CO1.NTC.xxxxx
  region            TEXT,
  referencia        TEXT,
  entidad           TEXT,
  objeto            TEXT,
  fase              TEXT,
  cuantia           NUMERIC,
  fecha_publicacion TEXT,                            -- crudo "13/06/2026 5:32 PM"
  fecha_cierre      TEXT,
  estado            TEXT,
  url               TEXT,
  first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  alerted_at        TIMESTAMPTZ                      -- null = visto pero no alertado (o envío falló → reintenta)
);

CREATE INDEX IF NOT EXISTS idx_radar_seen_region
  ON secop_radar_seen (region, first_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_radar_seen_unalerted
  ON secop_radar_seen (first_seen_at)
  WHERE alerted_at IS NULL;

ALTER TABLE secop_radar_seen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "secop_radar_seen: autenticados leen" ON secop_radar_seen
  FOR SELECT USING (auth.uid() IS NOT NULL);
-- Escritura solo service_role (worker). Sin policy = denegado para anon/authenticated.

NOTIFY pgrst, 'reload schema';
