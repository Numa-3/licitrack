'use client'

import type { ReactNode } from 'react'

type Props = {
  title: string
  children: ReactNode
  onClose: () => void
}

export default function Modal({ title, children, onClose }: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}
