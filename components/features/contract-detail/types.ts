export type Supplier = { id: string; name: string; whatsapp: string | null }
export type Profile = { id: string; name: string; role: string }
export type Category = { id: string; name: string; type: string }

export type ItemSupplier = { id: string; name: string; whatsapp: string | null } | null
export type ItemProfile = { id: string; name: string } | null

export type Item = {
  id: string
  item_number: number | null
  short_name: string
  description: string
  type: 'purchase' | 'logistics' | 'service'
  quantity: number
  unit: string | null
  sale_price: number | null
  supplier_cost: number | null
  status: string
  payment_status: 'unpaid' | 'invoiced' | 'paid'
  due_date: string | null
  contact_phone: string | null
  notes: string
  category_id: string | null
  supplier_id: string | null
  assigned_to: string | null
  created_by: string
  suppliers: ItemSupplier
  profiles: ItemProfile
}

export type Contract = {
  id: string
  name: string
  entity: string
  entity_id: string | null
  type: 'supply' | 'construction' | 'sale' | 'service' | 'logistics' | 'mixed'
  status: 'draft' | 'active' | 'completed' | 'settled' | 'cancelled'
  created_at: string
  updated_at: string
  organization_id: string
  organizations: { name: string } | null
  contracting_entities: { id: string; name: string } | null
  created_by_profile: { name: string } | null
  assigned_to_profile: { name: string } | null
}

export type ContractingEntity = { id: string; name: string }

export type AvailableSupplier = { id: string; name: string; whatsapp: string | null; city: string; trusted: boolean }

export type ActivityEntry = {
  id: string
  user_id: string
  action: string
  entity_type: string
  entity_id: string
  details: Record<string, unknown>
  created_at: string
}
