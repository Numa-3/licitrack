-- 015: Sistema de alertas de salud + tracking de health del worker.
--
-- Tres tablas nuevas + 1 columna agregada a secop_accounts:
--   • worker_health (singleton): heartbeat + último ciclo, lo escribe el
--     worker cada 30s.
--   • system_alerts: alertas (firing/resolved) que el worker o un cron
--     externo insertan cuando detectan condiciones anormales. El sender
--     de Telegram las consume con la misma lógica que notifications.
--   • secop_login_log: histórico de cada intento de login para detectar
--     patrones (regla 3: > 15 logins/24h indica que SECOP está invalidando
--     sesiones más rápido de lo normal).
--
-- Schema extension: secop_accounts.consecutive_login_failures lleva la
-- cuenta de fallos consecutivos por cuenta para regla 2 (3+ ciclos
-- seguidos fallando = warning). Se resetea al primer success.

-- ── worker_health (singleton, una sola fila id=1) ────────────

CREATE TABLE IF NOT EXISTS worker_health (
  id                            INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_heartbeat_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_cycle_started_at         TIMESTAMPTZ,
  last_cycle_finished_at        TIMESTAMPTZ,
  last_cycle_status             TEXT,                                  -- 'success' | 'error' | 'timeout'
  last_cycle_duration_seconds   INT,
  uptime_started_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO worker_health (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE worker_health ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "worker_health: jefes leen" ON worker_health;
CREATE POLICY "worker_health: jefes leen" ON worker_health
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'jefe')
  );

-- UPDATE solo via service_role (worker). No policy = denied for anon/authenticated.

-- ── system_alerts ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS system_alerts (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alert_type          TEXT NOT NULL,                                  -- 'worker_dead' | 'login_failures' | 'excessive_logins' | 'stale_processes' | 'no_cycles' | 'stuck_notifications'
  severity            TEXT NOT NULL CHECK (severity IN ('warning', 'critical')),
  state               TEXT NOT NULL DEFAULT 'firing' CHECK (state IN ('firing', 'resolved')),
  target_id           TEXT,                                           -- account id, process id, etc. NULL para alertas globales
  message             TEXT NOT NULL,
  context             JSONB,                                          -- detalles para debugging
  detected_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  telegram_sent_at    TIMESTAMPTZ,
  telegram_attempts   INT NOT NULL DEFAULT 0,
  telegram_error      TEXT
);

-- Índice para el sender (alertas pendientes ordenadas por severidad luego antigüedad)
CREATE INDEX IF NOT EXISTS idx_system_alerts_pending
  ON system_alerts (severity DESC, detected_at)
  WHERE telegram_sent_at IS NULL AND telegram_attempts < 3;

-- Índice para chequeo de cooldown y resolución (búsqueda por tipo+target)
CREATE INDEX IF NOT EXISTS idx_system_alerts_cooldown
  ON system_alerts (alert_type, target_id, state, detected_at DESC);

ALTER TABLE system_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "system_alerts: jefes leen" ON system_alerts;
CREATE POLICY "system_alerts: jefes leen" ON system_alerts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'jefe')
  );

-- INSERT/UPDATE solo via service_role (worker o cron de Vercel).

-- ── secop_login_log ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS secop_login_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id      UUID NOT NULL REFERENCES secop_accounts(id) ON DELETE CASCADE,
  attempted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  status          TEXT NOT NULL CHECK (status IN ('success', 'failure')),
  failure_reason  TEXT
);

-- Índice principal: queries de "logins de cuenta X en últimas 24h"
CREATE INDEX IF NOT EXISTS idx_secop_login_log_account_time
  ON secop_login_log (account_id, attempted_at DESC);

ALTER TABLE secop_login_log ENABLE ROW LEVEL SECURITY;

-- Solo service_role accede. No hay policies para anon/authenticated = denied.
-- Los jefes no necesitan ver login_log directamente; las alertas derivadas (regla 3) sí.

-- ── secop_accounts: contador de fallos consecutivos ─────────

ALTER TABLE secop_accounts
  ADD COLUMN IF NOT EXISTS consecutive_login_failures INT NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';
