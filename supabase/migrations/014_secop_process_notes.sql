-- 014: Notas de estado por proceso (timeline de seguimiento del equipo).
--
-- Permite a jefes y operadoras agregar notas a un proceso a modo de bitácora
-- compartida ("estamos esperando que nos acepten la póliza", "esperando
-- respuestas de observaciones", etc.). Soft delete: cualquier auth puede
-- borrar cualquier nota, pero los jefes pueden ver las borradas (auditoría).

CREATE TABLE IF NOT EXISTS secop_process_notes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  process_id  UUID NOT NULL REFERENCES secop_processes(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES profiles(id),
  content     TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 2000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ NULL,                                  -- soft delete
  deleted_by  UUID NULL REFERENCES profiles(id)                  -- quién la borró
);

CREATE INDEX IF NOT EXISTS idx_notes_process
  ON secop_process_notes(process_id, created_at DESC);

ALTER TABLE secop_process_notes ENABLE ROW LEVEL SECURITY;

-- Policies: jefes y operadoras pueden ver, crear y borrar (soft).
-- No hay DELETE policy: nunca se hace hard delete; el "borrado" es UPDATE
-- de deleted_at + deleted_by.

DROP POLICY IF EXISTS "process_notes: leer" ON secop_process_notes;
CREATE POLICY "process_notes: leer" ON secop_process_notes
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "process_notes: crear" ON secop_process_notes;
CREATE POLICY "process_notes: crear" ON secop_process_notes
  FOR INSERT
  WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "process_notes: actualizar (soft delete)" ON secop_process_notes;
CREATE POLICY "process_notes: actualizar (soft delete)" ON secop_process_notes
  FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

NOTIFY pgrst, 'reload schema';
