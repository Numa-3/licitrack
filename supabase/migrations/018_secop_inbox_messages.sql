-- 018: Scraper de bandeja de mensajes SECOP
--
-- SECOP mantiene una bandeja global por cuenta en
-- https://www.secop.gov.co/CO1Marketplace/Messages/MessageManagement/Index
-- con mensajes de todos los procesos (Observaciones, Notificaciones,
-- Informes de evaluación/selección, General). Esta tabla guarda lo que
-- el worker scrapea de esa bandeja cada ciclo.
--
-- Mapeo: el campo `Ref:` de cada mensaje es la `referencia_proceso`. Si
-- matchea un proceso monitoreado, también disparamos un cambio en
-- `secop_process_changes` para que el pipeline existente (trigger →
-- notificaciones → Telegram → campanita unread) funcione gratis.
--
-- Si no matchea → mensaje "huérfano" (process_id NULL), aparece en un
-- banner de "Mensajes sin asignar" en /secop/seguimiento.

CREATE TABLE IF NOT EXISTS secop_inbox_messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id      UUID NOT NULL REFERENCES secop_accounts(id) ON DELETE CASCADE,
  process_id      UUID NULL REFERENCES secop_processes(id) ON DELETE SET NULL,
  -- Identidad SECOP
  message_uid     TEXT NULL,                  -- CO1.MSG.X cuando esté disponible
  ref_proceso     TEXT NULL,                  -- "Ref:" del listado, ej CCENEG-097-01-...
  -- Contenido (de la fila del listado, sin abrir el detalle)
  tipo            TEXT NOT NULL,              -- 'Notificación' | 'Observaciones' | 'Informe de evaluación' | 'Informe de selección' | 'General'
  asunto          TEXT NOT NULL,
  sender          TEXT NULL,                  -- "SENA REGIONAL AMAZONAS", "AMAZONAS DUTTY FREE.COM SAS", etc.
  fecha           TIMESTAMPTZ NOT NULL,
  estado          TEXT NOT NULL,              -- 'Nuevo' | 'Leídas' | 'Enviado'
  has_attachments BOOLEAN NOT NULL DEFAULT FALSE,
  -- Metadata
  detalle_url     TEXT NULL,
  scraped_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  notified_at     TIMESTAMPTZ NULL,
  -- Dedup: clave estable basada en campos visibles del listado
  CONSTRAINT secop_inbox_messages_dedup UNIQUE (account_id, ref_proceso, asunto, fecha, tipo)
);

CREATE INDEX IF NOT EXISTS idx_inbox_messages_account_fecha
  ON secop_inbox_messages(account_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_process
  ON secop_inbox_messages(process_id)
  WHERE process_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inbox_messages_ref_proceso
  ON secop_inbox_messages(ref_proceso)
  WHERE ref_proceso IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inbox_messages_orphans
  ON secop_inbox_messages(fecha DESC)
  WHERE process_id IS NULL;

ALTER TABLE secop_inbox_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inbox_messages: leer" ON secop_inbox_messages;
CREATE POLICY "inbox_messages: leer" ON secop_inbox_messages
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Tracking del último sync por cuenta
ALTER TABLE secop_accounts
  ADD COLUMN IF NOT EXISTS last_inbox_sync_at TIMESTAMPTZ NULL;

-- Extender el título amigable del trigger para incluir nuevos change_types
-- generados por el scraper de bandeja.
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
      WHEN 'inbox_message'         THEN 'Nuevo mensaje en bandeja SECOP'
      WHEN 'inbox_adenda'          THEN 'Adenda publicada'
      WHEN 'inbox_informe'         THEN 'Informe publicado'
      ELSE 'Cambio detectado'
    END,
    NEW.summary,
    NEW.priority
  FROM profiles p
  WHERE p.role = 'jefe';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';
