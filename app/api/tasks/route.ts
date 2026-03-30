import { requireAuth } from '@/lib/admin'
import { NextRequest } from 'next/server'

export async function GET() {
  const auth = await requireAuth()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { data, error } = await supabase
    .from('tasks')
    .select(`
      *,
      creator:profiles!tasks_created_by_fkey(id, name),
      assignee:profiles!tasks_assigned_to_fkey(id, name),
      contract:contracts!tasks_contract_id_fkey(id, name)
    `)
    .order('position', { ascending: true })

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json(data)
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if ('error' in auth) return auth.error
  const { supabase, userId } = auth

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

  if (!title || !title.trim()) {
    return Response.json({ error: 'El titulo es obligatorio' }, { status: 400 })
  }

  const insert: Record<string, unknown> = {
    title: title.trim(),
    created_by: userId,
  }

  if (description !== undefined) insert.description = description
  if (status) insert.status = status
  if (priority) insert.priority = priority
  if (color) insert.color = color
  if (typeof position === 'number') insert.position = position
  if (assigned_to !== undefined) insert.assigned_to = assigned_to
  if (contract_id !== undefined) insert.contract_id = contract_id
  if (due_date !== undefined) insert.due_date = due_date

  const { data, error } = await supabase
    .from('tasks')
    .insert(insert)
    .select(`
      *,
      creator:profiles!tasks_created_by_fkey(id, name),
      assignee:profiles!tasks_assigned_to_fkey(id, name),
      contract:contracts!tasks_contract_id_fkey(id, name)
    `)
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json(data, { status: 201 })
}
