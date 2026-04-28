-- 013_telegram.sql
-- Integración con Telegram (Fase 3): un único grupo recibe todas las
-- notificaciones de jefes. Linking vía código de 6 dígitos.

-- ── telegram_config (singleton, una sola fila) ───────────────

CREATE TABLE telegram_config (
  id              INT  PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  group_chat_id   BIGINT,                       -- negativo en Telegram para grupos
  group_title     TEXT,
  linked_at       TIMESTAMPTZ,
  linked_by       UUID REFERENCES profiles(id),
  last_update_id  BIGINT                        -- offset para getUpdates
);

INSERT INTO telegram_config (id) VALUES (1);

ALTER TABLE telegram_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "telegram_config: jefes leen" ON telegram_config
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'jefe')
  );

-- UPDATE solo via service_role (worker). No policy = denied for anon/authenticated.

-- ── telegram_setup_codes ─────────────────────────────────────

CREATE TABLE telegram_setup_codes (
  code          TEXT PRIMARY KEY,
  created_by    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ,
  used_chat_id  BIGINT
);

CREATE INDEX idx_telegram_setup_codes_active
  ON telegram_setup_codes (expires_at)
  WHERE used_at IS NULL;

ALTER TABLE telegram_setup_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "telegram_setup_codes: jefe ve propios" ON telegram_setup_codes
  FOR SELECT USING (created_by = auth.uid());

CREATE POLICY "telegram_setup_codes: jefe inserta propios" ON telegram_setup_codes
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'jefe')
  );

-- UPDATE/DELETE solo via service_role (worker marca used_at, app borra previos del jefe).

CREATE POLICY "telegram_setup_codes: jefe borra propios" ON telegram_setup_codes
  FOR DELETE USING (created_by = auth.uid());

-- ── notifications: tracking de delivery a Telegram ──────────

ALTER TABLE notifications
  ADD COLUMN telegram_sent_at  TIMESTAMPTZ,
  ADD COLUMN telegram_error    TEXT,
  ADD COLUMN telegram_attempts INT NOT NULL DEFAULT 0;

CREATE INDEX idx_notifications_pending_telegram
  ON notifications (priority, created_at)
  WHERE telegram_sent_at IS NULL AND telegram_attempts < 3;
