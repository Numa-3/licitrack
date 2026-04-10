-- ============================================================
-- SECOP II Integration — Fase 1: Radar de oportunidades
-- ============================================================

-- secop_processes: procesos descubiertos desde SECOP II
CREATE TABLE secop_processes (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  secop_process_id     TEXT NOT NULL UNIQUE,
  referencia_proceso   TEXT,
  entidad              TEXT NOT NULL,
  nit_entidad          TEXT,
  objeto               TEXT NOT NULL,
  descripcion          TEXT,
  modalidad            TEXT,
  tipo_contrato        TEXT,
  fase                 TEXT,
  estado               TEXT,
  estado_resumen       TEXT,
  valor_estimado       NUMERIC,
  valor_adjudicacion   NUMERIC,
  fecha_publicacion    TIMESTAMPTZ,
  fecha_ultima_pub     TIMESTAMPTZ,
  url_publica          TEXT,
  departamento         TEXT,
  municipio            TEXT,
  duracion             TEXT,
  unidad_duracion      TEXT,
  dataset_hash         TEXT NOT NULL,
  radar_state          TEXT NOT NULL DEFAULT 'new'
                       CHECK (radar_state IN ('new', 'reviewing', 'followed', 'dismissed')),
  first_seen_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_secop_processes_radar_state ON secop_processes(radar_state);
CREATE INDEX idx_secop_processes_first_seen ON secop_processes(first_seen_at DESC);
CREATE INDEX idx_secop_processes_entidad ON secop_processes(entidad);
CREATE INDEX idx_secop_processes_departamento ON secop_processes(departamento);

CREATE TRIGGER secop_processes_updated_at
  BEFORE UPDATE ON secop_processes
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- secop_watch_rules: reglas configurables para el radar
CREATE TABLE secop_watch_rules (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL,
  enabled    BOOLEAN NOT NULL DEFAULT true,
  rule_json  JSONB NOT NULL DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER secop_watch_rules_updated_at
  BEFORE UPDATE ON secop_watch_rules
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- secop_poll_log: observabilidad del polling
CREATE TABLE secop_poll_log (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at       TIMESTAMPTZ,
  status            TEXT NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'success', 'error')),
  records_fetched   INTEGER DEFAULT 0,
  new_processes     INTEGER DEFAULT 0,
  updated_processes INTEGER DEFAULT 0,
  error_message     TEXT
);

-- ── Tablas preparadas para Fase 2 (monitoreo fino) ──────────

-- secop_process_snapshots: snapshots del estado de un proceso
CREATE TABLE secop_process_snapshots (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  process_id    UUID NOT NULL REFERENCES secop_processes(id) ON DELETE CASCADE,
  captured_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  snapshot_json JSONB NOT NULL,
  source_type   TEXT NOT NULL DEFAULT 'dataset'
                CHECK (source_type IN ('dataset', 'page_scrape')),
  hash          TEXT NOT NULL
);

CREATE INDEX idx_secop_snapshots_process ON secop_process_snapshots(process_id, captured_at DESC);

-- secop_process_changes: cambios detectados entre snapshots
CREATE TABLE secop_process_changes (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  process_id   UUID NOT NULL REFERENCES secop_processes(id) ON DELETE CASCADE,
  detected_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  change_type  TEXT NOT NULL,
  priority     TEXT NOT NULL DEFAULT 'medium'
               CHECK (priority IN ('low', 'medium', 'high')),
  before_json  JSONB,
  after_json   JSONB,
  summary      TEXT NOT NULL
);

CREATE INDEX idx_secop_changes_process ON secop_process_changes(process_id, detected_at DESC);

-- ── RLS ─────────────────────────────────────────────────────

ALTER TABLE secop_processes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE secop_watch_rules        ENABLE ROW LEVEL SECURITY;
ALTER TABLE secop_poll_log           ENABLE ROW LEVEL SECURITY;
ALTER TABLE secop_process_snapshots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE secop_process_changes    ENABLE ROW LEVEL SECURITY;

-- secop_processes: todos leen, solo jefe modifica radar_state
CREATE POLICY "secop_processes: leer" ON secop_processes
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "secop_processes: actualizar (jefe)" ON secop_processes
  FOR UPDATE USING (get_my_role() = 'jefe');

-- secop_watch_rules: todos leen, jefe CRUD
CREATE POLICY "secop_watch_rules: leer" ON secop_watch_rules
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "secop_watch_rules: insertar (jefe)" ON secop_watch_rules
  FOR INSERT WITH CHECK (get_my_role() = 'jefe');

CREATE POLICY "secop_watch_rules: actualizar (jefe)" ON secop_watch_rules
  FOR UPDATE USING (get_my_role() = 'jefe');

CREATE POLICY "secop_watch_rules: eliminar (jefe)" ON secop_watch_rules
  FOR DELETE USING (get_my_role() = 'jefe');

-- secop_poll_log: solo jefe lee (observabilidad)
CREATE POLICY "secop_poll_log: leer (jefe)" ON secop_poll_log
  FOR SELECT USING (get_my_role() = 'jefe');

-- snapshots y changes: todos leen
CREATE POLICY "secop_process_snapshots: leer" ON secop_process_snapshots
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "secop_process_changes: leer" ON secop_process_changes
  FOR SELECT USING (auth.uid() IS NOT NULL);
