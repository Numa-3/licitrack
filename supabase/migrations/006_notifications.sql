-- 006_notifications.sql
-- Tabla de notificaciones in-app + trigger que auto-crea notificaciones
-- cuando el worker detecta cambios en secop_process_changes.

-- ── Tabla ───────────────────────────────────────────────────

CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  process_id  UUID REFERENCES secop_processes(id) ON DELETE CASCADE,
  change_id   UUID REFERENCES secop_process_changes(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  priority    TEXT NOT NULL DEFAULT 'medium'
              CHECK (priority IN ('low', 'medium', 'high')),
  read        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read) WHERE read = false;
CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);

-- ── RLS ─────────────────────────────────────────────────────

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications: leer propias" ON notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "notifications: actualizar propias" ON notifications
  FOR UPDATE USING (user_id = auth.uid());

-- ── Trigger: auto-crear notificaciones desde cambios ────────

CREATE OR REPLACE FUNCTION create_notifications_from_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notifications (user_id, process_id, change_id, title, body, priority)
  SELECT
    p.id,
    NEW.process_id,
    NEW.id,
    CASE NEW.change_type
      WHEN 'state_changed'         THEN 'Cambio de estado'
      WHEN 'value_changed'         THEN 'Cambio de valor'
      WHEN 'end_date_changed'      THEN 'Fecha fin modificada'
      WHEN 'deadline_approaching'  THEN 'Deadline proximo'
      WHEN 'version_changed'       THEN 'Version actualizada'
      WHEN 'new_document'          THEN 'Nuevo documento'
      WHEN 'new_payment'           THEN 'Nuevo pago'
      WHEN 'payment_state_changed' THEN 'Pago actualizado'
      WHEN 'new_modification'      THEN 'Nueva modificacion'
      WHEN 'new_incumplimiento'    THEN 'Nuevo incumplimiento'
      ELSE 'Cambio detectado'
    END,
    NEW.summary,
    NEW.priority
  FROM profiles p
  WHERE p.role = 'jefe';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_create_notifications
  AFTER INSERT ON secop_process_changes
  FOR EACH ROW
  EXECUTE FUNCTION create_notifications_from_change();
