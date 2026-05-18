-- 016: Override manual de etapa por proceso
--
-- SECOP no actualiza la fase/estado de forma confiable: muchos contratos
-- que ya pasaron a liquidación o garantías siguen reportando "En ejecución".
-- Esta columna permite que el jefe fuerce la etapa visible en LiciTrack
-- desde el panel de detalle.
--
-- NULL = sin override → se deriva de tipo_proceso (pre vs contractual).
-- Cualquier valor del CHECK gana sobre la derivación automática.

ALTER TABLE secop_processes
  ADD COLUMN IF NOT EXISTS phase_override TEXT
    CHECK (phase_override IN ('pre', 'contractual', 'post'));

NOTIFY pgrst, 'reload schema';
