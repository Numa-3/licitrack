-- 007_secop_precontractual.sql
-- Tracker de procesos PRECONTRACTUALES vía API pública SECOP II.
--
-- Un "proceso" es la etapa previa a la adjudicación: apertura, observaciones,
-- presentación de ofertas, adjudicación/desierto. Se identifica con el
-- noticeUID (CO1.NTC.xxxxxxx) que viene en la URL pública.
--
-- Agregamos campos a secop_processes para precontractual y extendemos el
-- trigger de notificaciones con los nuevos change_types (precontractual +
-- los nuevos del contractual que faltaban).

-- ── Nuevos campos en secop_processes ───────────────────────
-- (nit_entidad, modalidad, fase ya existen en 002_secop_tables.sql)

ALTER TABLE secop_processes ADD COLUMN IF NOT EXISTS notice_uid        TEXT;
ALTER TABLE secop_processes ADD COLUMN IF NOT EXISTS tipo_proceso      TEXT
  CHECK (tipo_proceso IN ('precontractual', 'contractual'));
ALTER TABLE secop_processes ADD COLUMN IF NOT EXISTS id_portafolio     TEXT;
ALTER TABLE secop_processes ADD COLUMN IF NOT EXISTS precio_base       TEXT;
ALTER TABLE secop_processes ADD COLUMN IF NOT EXISTS adjudicado        BOOLEAN DEFAULT false;
ALTER TABLE secop_processes ADD COLUMN IF NOT EXISTS nit_adjudicado    TEXT;
ALTER TABLE secop_processes ADD COLUMN IF NOT EXISTS nombre_adjudicado TEXT;
ALTER TABLE secop_processes ADD COLUMN IF NOT EXISTS valor_adjudicado  TEXT;

CREATE INDEX IF NOT EXISTS idx_secop_processes_notice_uid
  ON secop_processes(notice_uid)
  WHERE notice_uid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_secop_processes_tipo
  ON secop_processes(tipo_proceso)
  WHERE tipo_proceso IS NOT NULL;

-- ── Actualizar trigger de notificaciones ───────────────────

CREATE OR REPLACE FUNCTION create_notifications_from_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notifications (user_id, process_id, change_id, title, body, priority)
  SELECT
    p.id,
    NEW.process_id,
    NEW.id,
    CASE NEW.change_type
      -- Contractual (existentes)
      WHEN 'state_changed'            THEN 'Cambio de estado del contrato'
      WHEN 'value_changed'            THEN 'Cambio de valor'
      WHEN 'end_date_changed'         THEN 'Fecha fin modificada'
      WHEN 'deadline_approaching'     THEN 'Deadline próximo'
      WHEN 'version_changed'          THEN 'Versión actualizada'
      WHEN 'new_document'             THEN 'Nuevo documento del contrato'
      WHEN 'new_payment'              THEN 'Nuevo pago'
      WHEN 'payment_state_changed'    THEN 'Pago actualizado'
      WHEN 'new_modification'         THEN 'Nueva modificación'
      -- Contractual (nuevos: garantías + docs)
      WHEN 'provider_doc_added'       THEN 'Documento del proveedor agregado'
      WHEN 'provider_doc_removed'     THEN 'Documento del proveedor eliminado'
      WHEN 'execution_doc_added'      THEN 'Nuevo documento de ejecución'
      WHEN 'warranty_added'           THEN 'Nueva póliza'
      WHEN 'warranty_accepted'        THEN '✅ Póliza aceptada'
      WHEN 'warranty_rejected'        THEN '❌ Póliza rechazada'
      WHEN 'warranty_expired'         THEN '⚠️ Póliza vencida'
      WHEN 'warranty_state_changed'   THEN 'Cambio de estado de póliza'
      -- Precontractual (nuevos)
      WHEN 'phase_changed'            THEN 'Nueva fase del proceso'
      WHEN 'process_state_changed'    THEN 'Cambio de estado del proceso'
      WHEN 'process_awarded'          THEN 'Proceso adjudicado'
      WHEN 'process_awarded_to_us'    THEN '🎯 Te adjudicaron el proceso'
      WHEN 'process_awarded_to_other' THEN 'Proceso adjudicado (a otro)'
      WHEN 'process_declared_void'    THEN 'Proceso declarado desierto'
      WHEN 'process_value_changed'    THEN 'Cambio de valor del proceso'
      WHEN 'process_deadline_changed' THEN 'Deadline del proceso modificado'
      WHEN 'new_responses'            THEN 'Nuevas respuestas al proceso'
      ELSE 'Cambio detectado'
    END,
    NEW.summary,
    NEW.priority
  FROM profiles p
  WHERE p.role = 'jefe';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
