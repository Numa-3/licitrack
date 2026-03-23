-- ============================================================
-- LiciTrack — Schema completo
-- Copiar y pegar en el SQL Editor de Supabase
-- ============================================================

-- Habilitar extensión UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================================
-- TABLAS
-- ============================================================

-- profiles (usuarios del sistema, espejo de auth.users)
CREATE TABLE profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('jefe', 'operadora')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- organizations (mis empresas)
CREATE TABLE organizations (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT NOT NULL,
  nit              TEXT NOT NULL,
  invoice_email    TEXT NOT NULL,
  rut_url          TEXT,
  chamber_cert_url TEXT,
  notes            TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- contracting_entities (entidades contratantes: SENA, Gobernación, ICBF, etc.)
-- Definida antes de contracts porque contracts tiene FK a esta tabla
CREATE TABLE contracting_entities (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         TEXT NOT NULL,
  nit          TEXT NOT NULL DEFAULT '',
  address      TEXT NOT NULL DEFAULT '',
  city         TEXT NOT NULL DEFAULT '',
  contact_name TEXT NOT NULL DEFAULT '',
  phone        TEXT NOT NULL DEFAULT '',
  email        TEXT NOT NULL DEFAULT '',
  notes        TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

-- contracts (contratos de licitación)
CREATE TABLE contracts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name            TEXT NOT NULL,
  entity          TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('purchase', 'logistics', 'service', 'mixed')),
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
  created_by      UUID NOT NULL REFERENCES profiles(id),
  entity_id       UUID REFERENCES contracting_entities(id),
  assigned_to     UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

-- categories (categorías de ítems)
CREATE TABLE categories (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL UNIQUE,
  type       TEXT NOT NULL DEFAULT 'general',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- suppliers (proveedores / prestadores de servicio)
CREATE TABLE suppliers (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT NOT NULL,
  type             TEXT NOT NULL DEFAULT 'vendor' CHECK (type IN ('vendor', 'service_provider', 'both')),
  whatsapp         TEXT,
  email            TEXT,
  city             TEXT NOT NULL DEFAULT '',
  has_rut          BOOLEAN NOT NULL DEFAULT false,
  has_chamber_cert BOOLEAN NOT NULL DEFAULT false,
  iva_exempt       BOOLEAN NOT NULL DEFAULT false,
  bbva_registered  BOOLEAN NOT NULL DEFAULT false,
  trusted          BOOLEAN NOT NULL DEFAULT false,
  notes            TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);

-- items (tareas / ítems del contrato)
CREATE TABLE items (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id    UUID NOT NULL REFERENCES contracts(id),
  item_number    INTEGER,
  short_name     TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  type           TEXT NOT NULL CHECK (type IN ('purchase', 'logistics', 'service')),
  category_id    UUID REFERENCES categories(id),
  quantity       NUMERIC NOT NULL DEFAULT 1,
  unit           TEXT,
  sale_price     NUMERIC,
  supplier_cost  NUMERIC,
  supplier_id    UUID REFERENCES suppliers(id),
  assigned_to    UUID REFERENCES profiles(id),
  status         TEXT NOT NULL DEFAULT 'pending',
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'invoiced', 'paid')),
  due_date       DATE,
  contact_phone  TEXT,
  notes          TEXT NOT NULL DEFAULT '',
  created_by     UUID NOT NULL REFERENCES profiles(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ
);

-- entity_documents (documentos legales de entidades contratantes)
CREATE TABLE entity_documents (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id   UUID NOT NULL REFERENCES contracting_entities(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('rut', 'chamber_cert', 'other')),
  file_url    TEXT NOT NULL,
  verified    BOOLEAN NOT NULL DEFAULT false,
  verified_by UUID REFERENCES profiles(id),
  expires_at  DATE,
  notes       TEXT,
  uploaded_by UUID NOT NULL REFERENCES profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- supplier_documents (documentos legales de proveedores)
CREATE TABLE supplier_documents (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('rut', 'chamber_cert', 'bank_cert', 'other')),
  file_url    TEXT NOT NULL,
  verified    BOOLEAN NOT NULL DEFAULT false,
  verified_by UUID REFERENCES profiles(id),
  expires_at  DATE,
  notes       TEXT,
  uploaded_by UUID NOT NULL REFERENCES profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- shipments (envíos a Leticia — solo para ítems tipo purchase)
CREATE TABLE shipments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id       UUID NOT NULL REFERENCES contracts(id),
  method            TEXT NOT NULL CHECK (method IN ('avion', 'barco', 'terrestre')),
  origin_city       TEXT NOT NULL DEFAULT '',
  dispatch_date     DATE NOT NULL,
  estimated_arrival DATE NOT NULL,
  actual_arrival    DATE,
  notes             TEXT NOT NULL DEFAULT '',
  created_by        UUID NOT NULL REFERENCES profiles(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- shipment_items (relación N:N envío ↔ ítem)
CREATE TABLE shipment_items (
  shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  item_id     UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  PRIMARY KEY (shipment_id, item_id)
);

-- invoices (facturas electrónicas)
CREATE TABLE invoices (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  contract_id     UUID NOT NULL REFERENCES contracts(id),
  supplier_id     UUID NOT NULL REFERENCES suppliers(id),
  invoice_number  TEXT NOT NULL,
  issue_date      DATE NOT NULL,
  subtotal        NUMERIC NOT NULL,
  tax             NUMERIC,
  total           NUMERIC NOT NULL,
  pdf_url         TEXT NOT NULL,
  xml_url         TEXT,
  notes           TEXT NOT NULL DEFAULT '',
  uploaded_by     UUID NOT NULL REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- invoice_items (relación N:N factura ↔ ítem)
CREATE TABLE invoice_items (
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  item_id    UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  PRIMARY KEY (invoice_id, item_id)
);

-- activity_log (registro de actividad para supervisión del jefe)
CREATE TABLE activity_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id),
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   UUID NOT NULL,
  details     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- TRIGGERS
-- ============================================================

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER items_updated_at
  BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER contracts_updated_at
  BEFORE UPDATE ON contracts
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER contracting_entities_updated_at
  BEFORE UPDATE ON contracting_entities
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Trigger para crear perfil automáticamente al registrar usuario en auth.users
-- El rol se pasa como metadata al crear el usuario (raw_user_meta_data->>'role')
-- Si no se pasa, el rol por defecto es 'operadora'
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'operadora')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ============================================================
-- CATEGORÍAS INICIALES
-- ============================================================

INSERT INTO categories (name, type) VALUES
  ('Ferretería',   'purchase'),
  ('Tecnología',   'purchase'),
  ('Papelería',    'purchase'),
  ('Aseo',         'purchase'),
  ('Investigación','purchase'),
  ('Evento',       'logistics'),
  ('Transporte',   'logistics'),
  ('Alojamiento',  'logistics'),
  ('Mantenimiento','service'),
  ('Fumigación',   'service'),
  ('General',      'general');


-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Función auxiliar para obtener el rol del usuario actual
-- Usar SECURITY DEFINER para que pueda leer profiles sin RLS circular
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Habilitar RLS en todas las tablas
ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE items             ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracting_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_documents     ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices          ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log      ENABLE ROW LEVEL SECURITY;


-- ── profiles ──────────────────────────────────────────────
-- Todos los usuarios autenticados pueden leer perfiles (para mostrar nombres)
CREATE POLICY "perfiles: leer" ON profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Cada usuario puede actualizar su propio perfil; jefe puede actualizar todos
CREATE POLICY "perfiles: actualizar propio" ON profiles
  FOR UPDATE USING (id = auth.uid() OR get_my_role() = 'jefe');

-- El trigger handle_new_user() inserta con SECURITY DEFINER, no necesita policy de INSERT


-- ── organizations ─────────────────────────────────────────
CREATE POLICY "organizaciones: leer" ON organizations
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "organizaciones: insertar (jefe)" ON organizations
  FOR INSERT WITH CHECK (get_my_role() = 'jefe');

CREATE POLICY "organizaciones: actualizar (jefe)" ON organizations
  FOR UPDATE USING (get_my_role() = 'jefe');

CREATE POLICY "organizaciones: eliminar (jefe)" ON organizations
  FOR DELETE USING (get_my_role() = 'jefe');


-- ── contracts ─────────────────────────────────────────────
CREATE POLICY "contratos: leer" ON contracts
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "contratos: insertar (jefe)" ON contracts
  FOR INSERT WITH CHECK (get_my_role() = 'jefe');

CREATE POLICY "contratos: actualizar (jefe)" ON contracts
  FOR UPDATE USING (get_my_role() = 'jefe');

CREATE POLICY "contratos: eliminar (jefe)" ON contracts
  FOR DELETE USING (get_my_role() = 'jefe');


-- ── categories ────────────────────────────────────────────
CREATE POLICY "categorías: leer" ON categories
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "categorías: insertar (jefe)" ON categories
  FOR INSERT WITH CHECK (get_my_role() = 'jefe');

CREATE POLICY "categorías: actualizar (jefe)" ON categories
  FOR UPDATE USING (get_my_role() = 'jefe');

CREATE POLICY "categorías: eliminar (jefe)" ON categories
  FOR DELETE USING (get_my_role() = 'jefe');


-- ── contracting_entities ─────────────────────────────────
CREATE POLICY "entidades: leer" ON contracting_entities
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "entidades: insertar (jefe)" ON contracting_entities
  FOR INSERT WITH CHECK (get_my_role() = 'jefe');

CREATE POLICY "entidades: actualizar (jefe)" ON contracting_entities
  FOR UPDATE USING (get_my_role() = 'jefe');

CREATE POLICY "entidades: eliminar (jefe)" ON contracting_entities
  FOR DELETE USING (get_my_role() = 'jefe');


-- ── entity_documents ────────────────────────────────────
CREATE POLICY "docs entidad: leer" ON entity_documents
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "docs entidad: insertar" ON entity_documents
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "docs entidad: actualizar (jefe)" ON entity_documents
  FOR UPDATE USING (get_my_role() = 'jefe');

CREATE POLICY "docs entidad: eliminar (jefe)" ON entity_documents
  FOR DELETE USING (get_my_role() = 'jefe');


-- ── suppliers ─────────────────────────────────────────────
CREATE POLICY "proveedores: leer" ON suppliers
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Cualquier usuario puede crear proveedores (operadoras también los registran)
CREATE POLICY "proveedores: insertar" ON suppliers
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "proveedores: actualizar (jefe)" ON suppliers
  FOR UPDATE USING (get_my_role() = 'jefe');

CREATE POLICY "proveedores: eliminar (jefe)" ON suppliers
  FOR DELETE USING (get_my_role() = 'jefe');


-- ── items ─────────────────────────────────────────────────
-- Todos leen ítems (para contexto)
CREATE POLICY "ítems: leer" ON items
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Cualquier usuario puede crear ítems
CREATE POLICY "ítems: insertar" ON items
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Jefe actualiza cualquier ítem
CREATE POLICY "ítems: actualizar (jefe)" ON items
  FOR UPDATE USING (get_my_role() = 'jefe');

-- Operadora actualiza solo ítems donde es responsable o creadora
CREATE POLICY "ítems: actualizar (operadora asignada)" ON items
  FOR UPDATE USING (
    get_my_role() = 'operadora'
    AND (assigned_to = auth.uid() OR created_by = auth.uid())
  );

-- Solo jefe puede archivar (soft delete)
CREATE POLICY "ítems: eliminar (jefe)" ON items
  FOR DELETE USING (get_my_role() = 'jefe');


-- ── supplier_documents ────────────────────────────────────
CREATE POLICY "docs proveedor: leer" ON supplier_documents
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "docs proveedor: insertar" ON supplier_documents
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "docs proveedor: actualizar (jefe)" ON supplier_documents
  FOR UPDATE USING (get_my_role() = 'jefe');

CREATE POLICY "docs proveedor: eliminar (jefe)" ON supplier_documents
  FOR DELETE USING (get_my_role() = 'jefe');


-- ── shipments ─────────────────────────────────────────────
CREATE POLICY "envíos: leer" ON shipments
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "envíos: insertar" ON shipments
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "envíos: actualizar (jefe)" ON shipments
  FOR UPDATE USING (get_my_role() = 'jefe');

CREATE POLICY "envíos: actualizar (operadora creadora)" ON shipments
  FOR UPDATE USING (
    get_my_role() = 'operadora' AND created_by = auth.uid()
  );

CREATE POLICY "envíos: eliminar (jefe)" ON shipments
  FOR DELETE USING (get_my_role() = 'jefe');


-- ── shipment_items ────────────────────────────────────────
CREATE POLICY "shipment_items: leer" ON shipment_items
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "shipment_items: insertar" ON shipment_items
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "shipment_items: eliminar (jefe)" ON shipment_items
  FOR DELETE USING (get_my_role() = 'jefe');


-- ── invoices ──────────────────────────────────────────────
CREATE POLICY "facturas: leer" ON invoices
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "facturas: insertar" ON invoices
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "facturas: actualizar (jefe)" ON invoices
  FOR UPDATE USING (get_my_role() = 'jefe');

CREATE POLICY "facturas: eliminar (jefe)" ON invoices
  FOR DELETE USING (get_my_role() = 'jefe');


-- ── invoice_items ─────────────────────────────────────────
CREATE POLICY "invoice_items: leer" ON invoice_items
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "invoice_items: insertar" ON invoice_items
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "invoice_items: eliminar (jefe)" ON invoice_items
  FOR DELETE USING (get_my_role() = 'jefe');


-- ── activity_log ──────────────────────────────────────────
-- Todos los usuarios autenticados pueden insertar (cada acción se registra)
CREATE POLICY "actividad: insertar" ON activity_log
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Solo el jefe puede leer el feed de actividad
CREATE POLICY "actividad: leer (jefe)" ON activity_log
  FOR SELECT USING (get_my_role() = 'jefe');


-- ============================================================
-- FIN DEL SCHEMA
-- ============================================================
-- Próximo paso: crear los buckets en Supabase Storage
--   - documents       → RUT y Cámara de Comercio de organizaciones
--   - invoices        → facturas electrónicas (PDF + XML)
--   - supplier-documents → documentos de proveedores
--   - entity-documents   → documentos de entidades contratantes
-- ============================================================
