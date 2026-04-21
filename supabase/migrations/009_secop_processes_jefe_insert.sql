-- 009: Permitir INSERT en secop_processes para usuarios con rol 'jefe'
--
-- Problema: las policies originales (migration 002) crearon SELECT (todos
-- autenticados) y UPDATE (solo jefes) pero NUNCA un INSERT policy. Por RLS
-- por defecto, ningún usuario de la app puede insertar filas en esta tabla —
-- solo el worker (que usa service_role y bypassea RLS).
--
-- Esto bloquea el flujo de "agregar proceso precontractual" desde la UI.
-- Con el scraper-first fallback es aún más crítico porque ahora
-- explícitamente insertamos filas desde la app cuando la API pública no
-- tiene el proceso aún.
--
-- Solución: agregar INSERT policy que permita a jefes crear secop_processes.

CREATE POLICY "secop_processes: insertar (jefe)" ON secop_processes
  FOR INSERT WITH CHECK (get_my_role() = 'jefe');

-- Notify PostgREST para que el cambio de policy se vea inmediato
NOTIFY pgrst, 'reload schema';
