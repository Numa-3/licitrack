import type { SupabaseClient } from '@supabase/supabase-js'

export type InboxOrphan = {
  id: string
  account_id: string
  account_name: string | null
  ref_proceso: string | null
  tipo: string
  asunto: string
  sender: string | null
  fecha: string
  estado: string
  has_attachments: boolean
  detalle_url: string | null
}

/**
 * Devuelve los mensajes "huérfanos" — recibidos en la bandeja pero cuya
 * `ref_proceso` no matchea ningún proceso monitoreado. Limitado a los últimos
 * 30 días para evitar acumulación visual.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchInboxOrphans(supabase: SupabaseClient<any>): Promise<InboxOrphan[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('secop_inbox_messages')
    .select(`
      id, account_id, ref_proceso, tipo, asunto, sender, fecha, estado, has_attachments, detalle_url,
      secop_accounts!secop_inbox_messages_account_id_fkey(name)
    `)
    .is('process_id', null)
    .gte('fecha', thirtyDaysAgo)
    .order('fecha', { ascending: false })
    .limit(50)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data || []) as any[]).map(r => ({
    id: r.id,
    account_id: r.account_id,
    account_name: Array.isArray(r.secop_accounts) ? r.secop_accounts[0]?.name ?? null : r.secop_accounts?.name ?? null,
    ref_proceso: r.ref_proceso,
    tipo: r.tipo,
    asunto: r.asunto,
    sender: r.sender,
    fecha: r.fecha,
    estado: r.estado,
    has_attachments: r.has_attachments,
    detalle_url: r.detalle_url,
  }))
}
