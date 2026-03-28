-- Migración: agregar start_date, end_date y actualizar CHECK constraints de contracts
-- Ejecutar en SQL Editor de Supabase

-- 1. Agregar columnas de fecha
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS end_date DATE;

-- 2. Migrar datos existentes ANTES de aplicar nuevos constraints
UPDATE contracts SET type = 'supply' WHERE type = 'purchase';

-- 3. Actualizar CHECK de type (agregar supply, construction, sale)
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_type_check;
ALTER TABLE contracts ADD CONSTRAINT contracts_type_check
  CHECK (type IN ('supply', 'construction', 'sale', 'service', 'logistics', 'mixed'));

-- 4. Actualizar CHECK de status (agregar settled)
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_status_check;
ALTER TABLE contracts ADD CONSTRAINT contracts_status_check
  CHECK (status IN ('draft', 'active', 'completed', 'settled', 'cancelled'));
