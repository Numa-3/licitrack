import { requireAuth } from '@/lib/admin'
import { NextRequest } from 'next/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if ('error' in auth) return auth.error
  const { supabase } = auth
  const { id } = await params

  const body = await request.json()
  const { title, description, status, priority, color, position, assigned_to, contract_id, due_date } = body as {
    title?: string
    description?: string
    status?: string
    priority?: string
    color?: string
    position?: number
    assigned_to?: string | null
    contract_id?: string | null
    due_date?: string | null
  }

  const update: Record<string, unknown> = {}

  if (title !== undefined) {
    if (!title.trim()) {
      return Response.json({ error: 'El titulo no puede estar vacio' }, { status: 400 })
    }
    update.title = title.trim()
  }
  if (description !== undefined) update.description = description
  if (priority !== undefined) update.priority = priority
  if (color !== undefined) update.color = color
  if (typeof position === 'number') update.position = position
  if (assigned_to !== undefined) update.assigned_to = assigned_to
  if (contract_id !== undefined) update.contract_id = contract_id
  if (due_date !== undefined) update.due_date = due_date

  // Handle status + completed_at logic
  if (status !== undefined) {
    update.status = status
    if (status === 'done') {
      update.completed_at = new Date().toISOString()
    } else {
      update.completed_at = null
    }
  }

  if (Object.keys(update).length === 0) {
    return Response.json({ error: 'No hay campos para actualizar' }, { status: 400 })
  }

  // RLS handles permission checks — operadora can only update own/assigned tasks
  const { data, error } = await supabase
    .from('tasks')
    .update(update)
    .eq('id', id)
    .select(`
      *,
      creator:profiles!tasks_created_by_fkey(id, name),
      assignee:profiles!tasks_assigned_to_fkey(id, name),
      contract:contracts!tasks_contract_id_fkey(id, name)
    `)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return Response.json({ error: 'Tarea no encontrada o sin permisos' }, { status: 404 })
    }
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(data)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if ('error' in auth) return auth.error
  const { supabase, userId } = auth
  const { id } = await params

  // Log before deleting
  await supabase.from('activity_log').insert({
    user_id: userId,
    action: 'delete',
    entity_type: 'task',
    entity_id: id,
    details: {},
  })

  // RLS handles permission checks — operadora can only delete own tasks
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', id)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ success: true })
}
