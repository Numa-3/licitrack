import type { SupabaseClient } from '@supabase/supabase-js'

export type RecentChange = {
  id: string
  change_type: string
  summary: string
  priority: 'low' | 'medium' | 'high'
  detected_at: string
}

export type UnreadInfo = {
  unread_changes_count: number
  recent_changes: RecentChange[]
}

/**
 * Para un usuario dado y una lista de procesos, calcula cuántos cambios
 * tiene cada proceso desde que el usuario los marcó como vistos.
 *
 * - Si no hay fila en `secop_process_views` para (user, proceso), todos los
 *   cambios cuentan como no vistos (umbral = epoch).
 * - `recent_changes` devuelve hasta 10 cambios más recientes (vistos o no)
 *   para mostrar en el popover; el conteo solo refleja los no vistos.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchUnreadChanges(supabase: SupabaseClient<any>, userId: string, processIds: string[]): Promise<Map<string, UnreadInfo>> {
  const out = new Map<string, UnreadInfo>()
  if (processIds.length === 0) return out

  // 1) Last seen por proceso para este usuario
  const { data: views } = await supabase
    .from('secop_process_views')
    .select('process_id, last_seen_change_at')
    .eq('user_id', userId)
    .in('process_id', processIds)

  const lastSeenById: Record<string, string> = {}
  for (const v of views || []) lastSeenById[v.process_id] = v.last_seen_change_at

  // 2) Cambios recientes (hasta 10 por proceso)
  const { data: changes } = await supabase
    .from('secop_process_changes')
    .select('id, process_id, change_type, summary, priority, detected_at')
    .in('process_id', processIds)
    .order('detected_at', { ascending: false })
    .limit(150)  // 14 procesos × ~10 cambios. Margen.

  const byProcess: Record<string, RecentChange[]> = {}
  for (const c of changes || []) {
    const arr = byProcess[c.process_id] || (byProcess[c.process_id] = [])
    if (arr.length < 10) {
      arr.push({
        id: c.id,
        change_type: c.change_type,
        summary: c.summary,
        priority: c.priority as 'low' | 'medium' | 'high',
        detected_at: c.detected_at,
      })
    }
  }

  for (const pid of processIds) {
    const all = byProcess[pid] || []
    const lastSeen = lastSeenById[pid]
    const unreadCount = lastSeen
      ? all.filter(c => c.detected_at > lastSeen).length
      : all.length
    out.set(pid, { unread_changes_count: unreadCount, recent_changes: all })
  }

  return out
}
