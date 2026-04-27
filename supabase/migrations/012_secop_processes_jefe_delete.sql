-- 012: Política RLS para que jefes puedan eliminar procesos SECOP.
--
-- Ya existían SELECT (todos auth) y UPDATE (jefe) y INSERT (jefe).
-- Faltaba DELETE → cualquier intento de eliminar quedaba bloqueado por RLS.
-- El borrado cascadea automáticamente a secop_process_snapshots,
-- secop_process_changes y notifications gracias a los FK ON DELETE CASCADE
-- configurados en migrations 002 y 006.

CREATE POLICY "secop_processes: eliminar (jefe)" ON secop_processes
  FOR DELETE USING (get_my_role() = 'jefe');

NOTIFY pgrst, 'reload schema';
