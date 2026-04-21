import type { LucideIcon } from 'lucide-react'

export type Process = {
  id: string
  secop_process_id: string
  referencia_proceso: string | null
  entidad: string
  objeto: string
  descripcion: string | null
  modalidad: string | null
  tipo_contrato: string | null
  fase: string | null
  estado: string | null
  estado_resumen: string | null
  valor_estimado: number | null
  url_publica: string | null
  departamento: string | null
  municipio: string | null
  source: 'radar' | 'account' | 'manual'
  account_id: string | null
  radar_state: string
  monitoring_enabled: boolean
  last_monitored_at: string | null
  next_deadline: string | null
  next_deadline_label: string | null
  api_pending?: boolean
  tipo_proceso?: 'contractual' | 'precontractual'
  secop_accounts?: { name: string } | null
}

export type Change = {
  id: string
  process_id: string
  change_type: string
  priority: 'low' | 'medium' | 'high'
  summary: string
  detected_at: string
  before_json?: Record<string, unknown> | null
  after_json?: Record<string, unknown> | null
  secop_processes?: {
    secop_process_id: string
    entidad: string
    objeto: string
  } | null
}

export type Account = {
  id: string
  name: string
  username: string
  is_active: boolean
  entity_name: string | null
  discovered_entities: { name: string; value: string }[] | null
  monitored_entities: string[] | null
  last_login_at: string | null
  last_sync_at: string | null
  sync_requested_at: string | null
  process_count: number
  cookies_expire_at: string | null
}

export type WorkerStatus = {
  status: 'running' | 'success' | 'error'
  finished_at: string | null
  processes_checked: number
  changes_found: number
} | null

export type AccountProcess = {
  id: string
  secop_process_id: string
  referencia_proceso: string | null
  entidad: string
  objeto: string
  estado: string | null
  valor_estimado: number | null
  monitoring_enabled: boolean
  url_publica: string | null
  entity_name: string | null
}

export type CronogramaEvent = {
  event_name: string
  start_date: string | null
  end_date: string | null
  remaining_days: number | null
  status: 'upcoming' | 'active' | 'past'
}

// Re-export for convenience
export type { LucideIcon }
