'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, Clock, AlertTriangle, Activity, Loader2 } from 'lucide-react'

type CalendarEvent = {
  date: string
  type: 'deadline' | 'change'
  label: string
  process_id: string
  entidad: string
  objeto: string
  priority: 'high' | 'medium' | 'low'
  secop_process_id: string
}

type Props = {
  initialEvents: CalendarEvent[]
  initialMonth: string // YYYY-MM
}

const DAYS = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom']
const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export default function CalendarClient({ initialEvents, initialMonth }: Props) {
  const [year, month] = initialMonth.split('-').map(Number)
  const [currentYear, setCurrentYear] = useState(year)
  const [currentMonth, setCurrentMonth] = useState(month - 1) // 0-indexed
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const navigate = async (delta: number) => {
    let newMonth = currentMonth + delta
    let newYear = currentYear
    if (newMonth < 0) { newMonth = 11; newYear-- }
    if (newMonth > 11) { newMonth = 0; newYear++ }

    setCurrentMonth(newMonth)
    setCurrentYear(newYear)
    setSelectedDay(null)
    setLoading(true)

    try {
      const monthStr = `${newYear}-${String(newMonth + 1).padStart(2, '0')}`
      const res = await fetch(`/api/secop/calendar?month=${monthStr}`)
      if (res.ok) {
        const json = await res.json()
        setEvents(json.events || [])
      }
    } finally {
      setLoading(false)
    }
  }

  const goToToday = async () => {
    const now = new Date()
    const todayYear = now.getFullYear()
    const todayMonth = now.getMonth()

    if (todayYear === currentYear && todayMonth === currentMonth) {
      setSelectedDay(now.toISOString().slice(0, 10))
      return
    }

    setCurrentYear(todayYear)
    setCurrentMonth(todayMonth)
    setSelectedDay(now.toISOString().slice(0, 10))
    setLoading(true)

    try {
      const monthStr = `${todayYear}-${String(todayMonth + 1).padStart(2, '0')}`
      const res = await fetch(`/api/secop/calendar?month=${monthStr}`)
      if (res.ok) {
        const json = await res.json()
        setEvents(json.events || [])
      }
    } finally {
      setLoading(false)
    }
  }

  // Build calendar grid
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1)
  const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0)
  const daysInMonth = lastDayOfMonth.getDate()

  // Monday = 0, Sunday = 6
  let startDow = firstDayOfMonth.getDay() - 1
  if (startDow < 0) startDow = 6

  const cells: { date: string; day: number; isCurrentMonth: boolean }[] = []

  // Previous month padding
  const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate()
  for (let i = startDow - 1; i >= 0; i--) {
    const d = prevMonthLastDay - i
    const prevMonth = currentMonth === 0 ? 12 : currentMonth
    const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear
    cells.push({
      date: `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      day: d,
      isCurrentMonth: false,
    })
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      date: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      day: d,
      isCurrentMonth: true,
    })
  }

  // Next month padding (fill to 42 cells = 6 rows)
  const remaining = 42 - cells.length
  for (let d = 1; d <= remaining; d++) {
    const nextMonth = currentMonth === 11 ? 1 : currentMonth + 2
    const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear
    cells.push({
      date: `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      day: d,
      isCurrentMonth: false,
    })
  }

  // Group events by date
  const eventsByDate = new Map<string, CalendarEvent[]>()
  for (const e of events) {
    const list = eventsByDate.get(e.date) || []
    list.push(e)
    eventsByDate.set(e.date, list)
  }

  const today = new Date().toISOString().slice(0, 10)
  const selectedEvents = selectedDay ? (eventsByDate.get(selectedDay) || []) : []

  const dotColor = (e: CalendarEvent) => {
    if (e.type === 'change') return 'bg-blue-500'
    if (e.priority === 'high') return 'bg-red-500'
    if (e.priority === 'medium') return 'bg-amber-500'
    return 'bg-emerald-500'
  }

  const eventIcon = (e: CalendarEvent) => {
    if (e.type === 'change') return <Activity size={12} className="text-blue-600" />
    if (e.priority === 'high') return <AlertTriangle size={12} className="text-red-600" />
    return <Clock size={12} className="text-amber-600" />
  }

  return (
    <div className="p-4 md:p-6 max-w-[900px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Calendario SECOP</h1>
        <button
          onClick={goToToday}
          className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 hover:bg-gray-50 rounded-md"
        >
          Hoy
        </button>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => navigate(-1)}
          className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors">
          <ChevronLeft size={16} />
        </button>
        <h2 className="text-lg font-semibold text-gray-900">
          {MONTHS[currentMonth]} {currentYear}
          {loading && <Loader2 size={14} className="inline ml-2 animate-spin text-gray-400" />}
        </h2>
        <button onClick={() => navigate(1)}
          className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Calendar grid */}
      <div className="bg-white rounded-xl border border-[#EAEAEA] overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-[#EAEAEA]">
          {DAYS.map(d => (
            <div key={d} className="px-2 py-2.5 text-center text-[10px] font-semibold uppercase tracking-widest text-gray-500">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {cells.map((cell, i) => {
            const dayEvents = eventsByDate.get(cell.date) || []
            const isToday = cell.date === today
            const isSelected = cell.date === selectedDay
            const hasHigh = dayEvents.some(e => e.priority === 'high')

            return (
              <button
                key={i}
                onClick={() => setSelectedDay(isSelected ? null : cell.date)}
                className={`relative min-h-[72px] p-1.5 border-b border-r border-gray-100 text-left transition-colors ${
                  !cell.isCurrentMonth ? 'bg-gray-50/50' : 'bg-white hover:bg-gray-50'
                } ${isSelected ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-200' : ''}`}
              >
                <span className={`inline-flex items-center justify-center w-6 h-6 text-xs font-medium rounded-full ${
                  isToday
                    ? 'bg-gray-900 text-white'
                    : !cell.isCurrentMonth
                      ? 'text-gray-300'
                      : hasHigh
                        ? 'text-red-700 font-semibold'
                        : 'text-gray-700'
                }`}>
                  {cell.day}
                </span>

                {/* Event dots */}
                {dayEvents.length > 0 && (
                  <div className="flex gap-0.5 mt-1 flex-wrap">
                    {dayEvents.slice(0, 4).map((e, j) => (
                      <span key={j} className={`w-1.5 h-1.5 rounded-full ${dotColor(e)}`} />
                    ))}
                    {dayEvents.length > 4 && (
                      <span className="text-[8px] text-gray-400 leading-none ml-0.5">+{dayEvents.length - 4}</span>
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 text-[10px] text-gray-500">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Urgente</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Esta semana</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Normal</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Cambio</span>
      </div>

      {/* Selected day events */}
      {selectedDay && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            {new Date(selectedDay + 'T12:00:00').toLocaleDateString('es-CO', {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
            })}
          </h3>

          {selectedEvents.length === 0 ? (
            <p className="text-sm text-gray-400 py-4">Sin eventos este dia</p>
          ) : (
            <div className="space-y-2">
              {selectedEvents.map((e, i) => (
                <div
                  key={i}
                  className="bg-white rounded-lg border border-[#EAEAEA] p-3 flex items-start gap-3 hover:border-gray-300 transition-colors"
                  style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
                >
                  <div className="mt-0.5 shrink-0">{eventIcon(e)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        e.type === 'deadline'
                          ? e.priority === 'high' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {e.type === 'deadline' ? 'Deadline' : 'Cambio'}
                      </span>
                      <span className="text-[10px] text-gray-400">{e.secop_process_id}</span>
                    </div>
                    <p className="text-sm font-medium text-gray-900 mt-1">{e.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{e.entidad}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
