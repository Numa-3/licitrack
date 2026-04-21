-- 011: Nombre personalizado por proceso
--
-- Permite al jefe asignar un alias al proceso (ej: "SENA Amazonas Q2")
-- que se muestra como título en la UI en lugar de la entidad oficial.
-- La entidad oficial pasa a subtítulo cuando hay custom_name.

ALTER TABLE secop_processes
  ADD COLUMN IF NOT EXISTS custom_name TEXT;

NOTIFY pgrst, 'reload schema';
