'use client'

import { formatDateTime } from '@/lib/utils/format'
import { ACTION_LABELS } from './constants'
import type { ActivityEntry } from './types'

type Props = {
  entries: ActivityEntry[]
}

export default function ActivityFeed({ entries }: Props) {
  if (entries.length === 0) return null

  return (
    <div className="mt-6 bg-white border border-gray-200 rounded-xl">
      <div className="px-5 py-4 border-b border-gray-200">
        <h2 className="font-semibold text-gray-900">Actividad reciente</h2>
      </div>
      <div className="divide-y divide-gray-100">
        {entries.slice(0, 10).map(entry => (
          <div key={entry.id} className="px-5 py-3 flex items-center justify-between text-sm">
            <div>
              <span className="text-gray-700 font-medium">
                {ACTION_LABELS[entry.action] || entry.action}
              </span>
              {entry.details && Object.keys(entry.details).length > 0 && (
                <span className="text-gray-400 ml-2">
                  {entry.details.new_value ? `→ ${entry.details.new_value as string}` : ''}
                  {entry.details.supplier ? `→ ${entry.details.supplier as string}` : ''}
                  {entry.details.assigned_to ? `→ ${entry.details.assigned_to as string}` : ''}
                </span>
              )}
            </div>
            <span className="text-xs text-gray-400">
              {formatDateTime(entry.created_at)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
