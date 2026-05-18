import type { Process } from '@/components/features/seguimiento/types'

export type Phase = 'pre' | 'contractual' | 'post'

// Mapeo entre tipo_proceso (campo SECOP) y la fase inicial sin override.
// SECOP no actualiza el estado post-contractual de forma confiable, así
// que NO derivamos 'post' automáticamente — solo via phase_override.
export function derivePhase(p: Process): Phase {
  if (p.phase_override) return p.phase_override
  if (p.tipo_proceso === 'precontractual') return 'pre'
  return 'contractual'
}

export const PHASE_META: Record<Phase, {
  label: string
  pill: string
  rowTint: string
  border: string
}> = {
  pre: {
    label: 'Precontractual',
    pill: 'bg-violet-50 text-violet-700 ring-violet-600/20',
    rowTint: 'bg-violet-50/40 hover:bg-violet-50/70',
    border: 'border-violet-400',
  },
  contractual: {
    label: 'En ejecución',
    pill: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    rowTint: 'bg-emerald-50/40 hover:bg-emerald-50/70',
    border: 'border-emerald-400',
  },
  post: {
    label: 'Post-contractual',
    pill: 'bg-blue-50 text-blue-700 ring-blue-600/20',
    rowTint: 'bg-blue-50/40 hover:bg-blue-50/70',
    border: 'border-blue-400',
  },
}
