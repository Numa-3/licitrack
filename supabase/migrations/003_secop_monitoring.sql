-- ============================================================
-- SECOP II Integration — Fase 2: Monitoreo de procesos
-- ============================================================

-- secop_accounts: cuentas autenticadas de SECOP (multicuenta)
CREATE TABLE secop_accounts (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                TEXT NOT NULL,
  username            TEXT NOT NULL,
  password_encrypted  TEXT NOT NULL,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  cookies_json        JSONB,
  cookies_expire_at   TIMESTAMPTZ,
  last_login_at       TIMESTAMPTZ,
  last_sync_at        TIMESTAMPTZ,
  process_count       INTEGER DEFAULT 0,
  created_by          UUID NOT NULL REFERENCES profiles(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER secop_accounts_updated_at
  BEFORE UPDATE ON secop_accounts
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ── Nuevas columnas en secop_processes ─────────────────────

ALTER TABLE secop_processes
  ADD COLUMN source TEXT NOT NULL DEFAULT 'radar'
    CHECK (source IN ('radar', 'account', 'manual')),
  ADD COLUMN account_id UUID REFERENCES secop_accounts(id),
  ADD COLUMN secop_ntc_id TEXT,
  ADD COLUMN monitoring_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN last_monitored_at TIMESTAMPTZ,
  ADD COLUMN next_deadline TIMESTAMPTZ,
  ADD COLUMN next_deadline_label TEXT;

-- Procesos ya seguidos desde Fase 1 → activar monitoreo
UPDATE secop_processes SET monitoring_enabled = true WHERE radar_state = 'followed';

CREATE INDEX idx_secop_processes_monitoring ON secop_processes(monitoring_enabled) WHERE monitoring_enabled = true;
CREATE INDEX idx_secop_processes_account ON secop_processes(account_id);
CREATE INDEX idx_secop_processes_source ON secop_processes(source);

-- ── Log de monitoreo (scraping) ────────────────────────────

CREATE TABLE secop_monitor_log (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id        UUID REFERENCES secop_accounts(id),
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at       TIMESTAMPTZ,
  status            TEXT NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'success', 'error')),
  processes_checked INTEGER DEFAULT 0,
  changes_found     INTEGER DEFAULT 0,
  error_message     TEXT
);

-- ── RLS ─────────────────────────────────────────────────────

ALTER TABLE secop_accounts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE secop_monitor_log ENABLE ROW LEVEL SECURITY;

-- secop_accounts: solo jefe (contiene credenciales encriptadas)
CREATE POLICY "secop_accounts: leer (jefe)" ON secop_accounts
  FOR SELECT USING (get_my_role() = 'jefe');

CREATE POLICY "secop_accounts: insertar (jefe)" ON secop_accounts
  FOR INSERT WITH CHECK (get_my_role() = 'jefe');

CREATE POLICY "secop_accounts: actualizar (jefe)" ON secop_accounts
  FOR UPDATE USING (get_my_role() = 'jefe');

CREATE POLICY "secop_accounts: eliminar (jefe)" ON secop_accounts
  FOR DELETE USING (get_my_role() = 'jefe');

-- secop_monitor_log: jefe solo lectura
CREATE POLICY "secop_monitor_log: leer (jefe)" ON secop_monitor_log
  FOR SELECT USING (get_my_role() = 'jefe');
