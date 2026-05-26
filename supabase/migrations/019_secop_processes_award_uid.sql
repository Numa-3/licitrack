-- 019: award_uid en secop_processes para mapear mensajes CO1.AWD.X
--
-- Los Informes de evaluación / selección que llegan a la bandeja usan el
-- "Award UID" del proceso (CO1.AWD.X), distinto del "Notice UID" (CO1.NTC.X).
-- Sin esta columna, esos mensajes quedan como huérfanos aunque el proceso
-- sí esté monitoreado.
--
-- El monitor precontractual ya recibe `id_adjudicacion` desde el API público
-- (datos.gov.co). Esta migración solo agrega el espacio para persistirlo.
-- El inbox-monitor matcheará por referencia_proceso O por award_uid.

ALTER TABLE secop_processes ADD COLUMN IF NOT EXISTS award_uid TEXT;

CREATE INDEX IF NOT EXISTS idx_secop_processes_award_uid
  ON secop_processes(award_uid)
  WHERE award_uid IS NOT NULL;

NOTIFY pgrst, 'reload schema';
