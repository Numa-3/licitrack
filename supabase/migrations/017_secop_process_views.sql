-- 017: Tracking de cambios vistos por usuario
--
-- Cada usuario marca cuándo "leyó" los cambios de un proceso. Si el proceso
-- recibe nuevos cambios después de ese timestamp, la UI muestra un indicador.
-- Para "marcar como visto" hacemos UPSERT del last_seen_change_at a NOW().

CREATE TABLE IF NOT EXISTS secop_process_views (
  user_id              UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  process_id           UUID NOT NULL REFERENCES secop_processes(id) ON DELETE CASCADE,
  last_seen_change_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, process_id)
);

CREATE INDEX IF NOT EXISTS idx_secop_process_views_user
  ON secop_process_views(user_id);

ALTER TABLE secop_process_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "process_views: ver propios" ON secop_process_views;
CREATE POLICY "process_views: ver propios" ON secop_process_views
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "process_views: insertar propios" ON secop_process_views;
CREATE POLICY "process_views: insertar propios" ON secop_process_views
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "process_views: actualizar propios" ON secop_process_views;
CREATE POLICY "process_views: actualizar propios" ON secop_process_views
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
