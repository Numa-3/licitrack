'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, List, AlertTriangle, Clock, Activity, Loader2 } from 'lucide-react'
import { PHASE_META, type Phase } from '@/lib/secop/phase'
import type { CalendarEvent, CalendarProcess } from '@/app/api/secop/calendar/events/route'
import CronogramaDrawer from './calendario/CronogramaDrawer'

type View = 'month' | 'week'
type EventType = CalendarEvent['type']
type Urgency = CalendarEvent['urgency']

type FilterState = {
  phase: Set<Phase>
  accountId: Set<string>
  type: Set<EventType>
  urgency: Set<Urgency>
}

const URGENCY_META: Record<Urgency, { label: string; tone: string }> = {
  urgent:    { label: 'Urgente',      tone: 'bg-red-50 text-red-700 ring-red-600/20' },
  this_week: { label: 'Esta semana',  tone: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
  upcoming:  { label: 'Próximo',      tone: 'bg-blue-50 text-blue-700 ring-blue-600/20' },
  past:      { label: 'Pasado',       tone: 'bg-gray-100 text-gray-600 ring-gray-500/20' },
}

const TYPE_META: Record<EventType, { label: string }> = {
  deadline: { label: 'Deadlines' },
  change:   { label: 'Cambios' },
}

const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const WEEKDAYS_SHORT = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']
const WEEKDAYS_LONG = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

function dateKey(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const dayOfWeek = (first.getDay() + 6) % 7  // 0=lunes
  const start = new Date(year, month, 1 - dayOfWeek)
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

function eventPassesFilters(ev: CalendarEvent, f: FilterState): boolean {
  if (f.phase.size > 0 && !f.phase.has(ev.phase)) return false
  if (f.accountId.size > 0) {
    const key = ev.account_id || '__none__'
    if (!f.accountId.has(key)) return false
  }
  if (f.type.size > 0 && !f.type.has(ev.type)) return false
  if (f.urgency.size > 0 && !f.urgency.has(ev.urgency)) return false
  return true
}

export default function CalendarClient({
  initialEvents,
  initialProcesses,
  initialMonth,
}: {
  initialEvents: CalendarEvent[]
  initialProcesses: CalendarProcess[]
  initialMonth: string
}) {
  const [view, setView] = useState<View>('month')
  const [monthDate, setMonthDate] = useState<Date>(() => {
    const [y, m] = initialMonth.split('-').map(Number)
    return new Date(y, m - 1, 1)
  })
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents)
  const [processes, setProcesses] = useState<CalendarProcess[]>(initialProcesses)
  const [loading, setLoading] = useState(false)
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null)
  const [highlightEventDate, setHighlightEventDate] = useState<string | null>(null)
  const [filters, setFilters] = useState<FilterState>({
    phase: new Set(),
    accountId: new Set(),
    type: new Set(),
    urgency: new Set(),
  })

  const fetchMonth = useCallback(async (d: Date) => {
    const from = new Date(d.getFullYear(), d.getMonth(), 1)
    from.setDate(from.getDate() - 7)
    const to = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59)
    to.setDate(to.getDate() + 7)
    const qs = new URLSearchParams({ from: dateKey(from), to: dateKey(to) })
    setLoading(true)
    try {
      const res = await fetch(`/api/secop/calendar/events?${qs}`)
      if (res.ok) {
        const json = await res.json()
        setEvents(json.events || [])
        setProcesses(json.processes || [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const navigateMonth = (delta: number) => {
    const next = new Date(monthDate.getFullYear(), monthDate.getMonth() + delta, 1)
    setMonthDate(next)
    fetchMonth(next)
  }
  const goToday = () => {
    const now = new Date()
    const next = new Date(now.getFullYear(), now.getMonth(), 1)
    setMonthDate(next)
    fetchMonth(next)
  }

  const visibleEvents = useMemo(
    () => events.filter(ev => eventPassesFilters(ev, filters)),
    [events, filters],
  )

  const phaseCounts = useMemo(() => {
    const c: Record<Phase, number> = { pre: 0, contractual: 0, post: 0 }
    for (const ev of events) c[ev.phase]++
    return c
  }, [events])

  const accountChoices = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>()
    for (const p of processes) {
      const key = p.account_id || '__none__'
      const name = p.account_name || 'Sin cuenta'
      if (!map.has(key)) map.set(key, { id: key, name })
    }
    return Array.from(map.values())
  }, [processes])

  const togglePhase = (v: Phase) => setFilters(prev => {
    const next = new Set(prev.phase); next.has(v) ? next.delete(v) : next.add(v)
    return { ...prev, phase: next }
  })
  const toggleAccount = (v: string) => setFilters(prev => {
    const next = new Set(prev.accountId); next.has(v) ? next.delete(v) : next.add(v)
    return { ...prev, accountId: next }
  })
  const toggleType = (v: EventType) => setFilters(prev => {
    const next = new Set(prev.type); next.has(v) ? next.delete(v) : next.add(v)
    return { ...prev, type: next }
  })
  const toggleUrgency = (v: Urgency) => setFilters(prev => {
    const next = new Set(prev.urgency); next.has(v) ? next.delete(v) : next.add(v)
    return { ...prev, urgency: next }
  })

  const openDrawer = (ev: CalendarEvent) => {
    setSelectedProcessId(ev.process_id)
    setHighlightEventDate(ev.date)
  }
  const closeDrawer = useCallback(() => {
    setSelectedProcessId(null)
    setHighlightEventDate(null)
  }, [])

  useEffect(() => {
    if (!selectedProcessId) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeDrawer() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedProcessId, closeDrawer])

  const selectedProcess = selectedProcessId
    ? processes.find(p => p.id === selectedProcessId) || null
    : null

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Calendario</h1>
          <p className="text-sm text-gray-500">Deadlines y cambios de los procesos monitoreados</p>
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle view={view} onChange={setView} />
          <button onClick={goToday}
            className="px-3 py-1.5 text-xs font-medium rounded-md ring-1 ring-inset ring-gray-200 text-gray-700 hover:bg-gray-50">
            Hoy
          </button>
        </div>
      </div>

      {view === 'month' && (
        <div className="flex items-center gap-2">
          <button onClick={() => navigateMonth(-1)}
            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-600">
            <ChevronLeft size={16} />
          </button>
          <h2 className="text-sm font-medium text-gray-900 min-w-[140px] text-center">
            {MONTH_NAMES[monthDate.getMonth()]} {monthDate.getFullYear()}
          </h2>
          <button onClick={() => navigateMonth(1)}
            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-600">
            <ChevronRight size={16} />
          </button>
          {loading && <Loader2 size={14} className="animate-spin text-gray-400 ml-2" />}
        </div>
      )}

      <div className="bg-white border border-[#EAEAEA] rounded-xl p-3 space-y-2"
        style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
        <FilterRow
          label="Etapa"
          options={[
            { key: 'pre',         label: 'Precontractual',   count: phaseCounts.pre },
            { key: 'contractual', label: 'En ejecución',     count: phaseCounts.contractual },
            { key: 'post',        label: 'Post-contractual', count: phaseCounts.post },
          ]}
          active={filters.phase as Set<string>}
          onToggle={v => togglePhase(v as Phase)}
          onClear={() => setFilters(prev => ({ ...prev, phase: new Set() }))}
          chipClassWhenActive={(key) => PHASE_META[key as Phase].pill}
        />
        <FilterRow
          label="Cuenta"
          options={accountChoices.map(a => ({ key: a.id, label: a.name }))}
          active={filters.accountId}
          onToggle={toggleAccount}
          onClear={() => setFilters(prev => ({ ...prev, accountId: new Set() }))}
        />
        <FilterRow
          label="Tipo"
          options={(['deadline', 'change'] as const).map(k => ({ key: k, label: TYPE_META[k].label }))}
          active={filters.type as Set<string>}
          onToggle={v => toggleType(v as EventType)}
          onClear={() => setFilters(prev => ({ ...prev, type: new Set() }))}
        />
        <FilterRow
          label="Urgencia"
          options={(['urgent', 'this_week', 'upcoming', 'past'] as const).map(k => ({ key: k, label: URGENCY_META[k].label }))}
          active={filters.urgency as Set<string>}
          onToggle={v => toggleUrgency(v as Urgency)}
          onClear={() => setFilters(prev => ({ ...prev, urgency: new Set() }))}
          chipClassWhenActive={(key) => URGENCY_META[key as Urgency].tone}
        />
      </div>

      {view === 'month' ? (
        <MonthView monthDate={monthDate} events={visibleEvents} onEventClick={openDrawer} />
      ) : (
        <WeekView events={visibleEvents} onEventClick={openDrawer} />
      )}

      {selectedProcessId && selectedProcess && (
        <CronogramaDrawer
          processId={selectedProcessId}
          processName={selectedProcess.name}
          phase={selectedProcess.phase}
          accountName={selectedProcess.account_name}
          highlightEventDate={highlightEventDate}
          onClose={closeDrawer}
        />
      )}
    </div>
  )
}

function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div className="inline-flex rounded-md ring-1 ring-inset ring-gray-200 bg-white">
      <button onClick={() => onChange('month')}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-l-md transition-colors ${
          view === 'month' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
        }`}>
        <CalendarIcon size={14} /> Mes
      </button>
      <button onClick={() => onChange('week')}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-r-md transition-colors ${
          view === 'week' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
        }`}>
        <List size={14} /> Próximos 7 días
      </button>
    </div>
  )
}

function FilterRow({ label, options, active, onToggle, onClear, chipClassWhenActive }: {
  label: string
  options: { key: string; label: string; count?: number }[]
  active: Set<string>
  onToggle: (key: string) => void
  onClear: () => void
  chipClassWhenActive?: (key: string) => string
}) {
  const allActive = active.size === 0
  return (
    <div className="flex items-center flex-wrap gap-1.5">
      <span className="text-[11px] font-medium text-gray-500 w-16 shrink-0">{label}:</span>
      <button onClick={onClear}
        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ring-1 ring-inset transition-colors ${
          allActive ? 'bg-gray-900 text-white ring-gray-900' : 'bg-white text-gray-600 ring-gray-200 hover:ring-gray-300'
        }`}>
        Todas
      </button>
      {options.map(o => {
        const isActive = active.has(o.key)
        const tone = isActive && chipClassWhenActive
          ? chipClassWhenActive(o.key)
          : isActive
            ? 'bg-gray-900 text-white ring-gray-900'
            : 'bg-white text-gray-600 ring-gray-200 hover:ring-gray-300'
        return (
          <button key={o.key} onClick={() => onToggle(o.key)}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium ring-1 ring-inset transition-colors ${tone}`}>
            {o.label}
            {typeof o.count === 'number' && o.count > 0 && (
              <span className={`text-[10px] ${isActive ? 'opacity-70' : 'text-gray-400'}`}>{o.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function MonthView({ monthDate, events, onEventClick }: {
  monthDate: Date
  events: CalendarEvent[]
  onEventClick: (ev: CalendarEvent) => void
}) {
  const days = monthGrid(monthDate.getFullYear(), monthDate.getMonth())
  const today = new Date()
  const byDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>()
    for (const ev of events) {
      const k = dateKey(ev.date)
      const arr = m.get(k) || []
      arr.push(ev)
      m.set(k, arr)
    }
    return m
  }, [events])

  return (
    <div className="bg-white rounded-xl border border-[#EAEAEA] overflow-hidden"
      style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
      <div className="grid grid-cols-7 border-b border-[#EAEAEA] bg-gray-50/50">
        {WEEKDAYS_SHORT.map(d => (
          <div key={d} className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 px-2 py-2 text-center">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 grid-rows-6">
        {days.map((d, i) => {
          const inMonth = d.getMonth() === monthDate.getMonth()
          const isToday = isSameDay(d, today)
          const dayEvents = byDay.get(dateKey(d)) || []
          return (
            <div key={i}
              className={`min-h-[96px] border-b border-r border-[#EAEAEA] px-1.5 py-1 ${
                !inMonth ? 'bg-gray-50/40' : 'bg-white'
              } ${(i + 1) % 7 === 0 ? 'border-r-0' : ''} ${i >= 35 ? 'border-b-0' : ''}`}
            >
              <div className={`flex items-center justify-between mb-1 ${!inMonth ? 'text-gray-400' : 'text-gray-700'}`}>
                <span className={`text-[11px] font-medium ${
                  isToday ? 'bg-indigo-600 text-white rounded-full w-5 h-5 inline-flex items-center justify-center' : ''
                }`}>
                  {d.getDate()}
                </span>
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map(ev => (
                  <EventPill key={ev.id} event={ev} onClick={() => onEventClick(ev)} />
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[10px] text-gray-500 px-1">+{dayEvents.length - 3} más</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function EventPill({ event, onClick }: { event: CalendarEvent; onClick: () => void }) {
  const isChange = event.type === 'change'
  const phaseMeta = PHASE_META[event.phase]
  const tone = isChange
    ? 'bg-blue-50 text-blue-700 ring-blue-600/20'
    : event.urgency === 'urgent'
      ? 'bg-red-50 text-red-700 ring-red-600/20'
      : event.urgency === 'this_week'
        ? 'bg-amber-50 text-amber-700 ring-amber-600/20'
        : phaseMeta.pill
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className={`w-full text-left truncate px-1.5 py-0.5 rounded text-[10px] font-medium ring-1 ring-inset transition-colors hover:brightness-95 ${tone}`}
      title={`${event.process_name} · ${event.event_name}`}
    >
      <span className="truncate inline-block max-w-full align-middle">
        {isChange && <Activity size={9} className="inline mr-1" />}
        {!isChange && event.urgency === 'urgent' && <AlertTriangle size={9} className="inline mr-1" />}
        {event.process_name}
      </span>
    </button>
  )
}

function WeekView({ events, onEventClick }: {
  events: CalendarEvent[]
  onEventClick: (ev: CalendarEvent) => void
}) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    return d
  })

  const byDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>()
    for (const ev of events) {
      const k = dateKey(ev.date)
      const arr = m.get(k) || []
      arr.push(ev)
      m.set(k, arr)
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    }
    return m
  }, [events])

  return (
    <div className="bg-white rounded-xl border border-[#EAEAEA] overflow-hidden divide-y divide-[#EAEAEA]"
      style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
      {week.map(d => {
        const k = dateKey(d)
        const dayEvents = byDay.get(k) || []
        const isToday = isSameDay(d, today)
        if (dayEvents.length === 0) {
          return (
            <div key={k} className="px-5 py-3 flex items-center justify-between">
              <DayHeader date={d} isToday={isToday} />
              <span className="text-xs text-gray-400">Sin eventos</span>
            </div>
          )
        }
        return (
          <div key={k} className="px-5 py-3">
            <div className="flex items-center justify-between mb-2">
              <DayHeader date={d} isToday={isToday} />
              <span className="text-[11px] text-gray-400">{dayEvents.length} evento{dayEvents.length === 1 ? '' : 's'}</span>
            </div>
            <div className="space-y-1.5">
              {dayEvents.map(ev => (
                <WeekEventCard key={ev.id} event={ev} onClick={() => onEventClick(ev)} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function DayHeader({ date, isToday }: { date: Date; isToday: boolean }) {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)
  const isTomorrow = isSameDay(date, tomorrow)
  const weekday = WEEKDAYS_LONG[(date.getDay() + 6) % 7]
  const label = isToday ? 'Hoy' : isTomorrow ? 'Mañana' : weekday.charAt(0).toUpperCase() + weekday.slice(1)
  return (
    <div className="flex items-baseline gap-2">
      <span className={`text-sm font-semibold ${isToday ? 'text-indigo-600' : 'text-gray-900'}`}>{label}</span>
      <span className="text-xs text-gray-500">{date.getDate()} {MONTH_NAMES[date.getMonth()].slice(0, 3)}</span>
    </div>
  )
}

function WeekEventCard({ event, onClick }: { event: CalendarEvent; onClick: () => void }) {
  const isChange = event.type === 'change'
  const phaseMeta = PHASE_META[event.phase]
  const urgency = URGENCY_META[event.urgency]
  const time = new Date(event.date).toLocaleTimeString('es-CO', {
    hour: '2-digit', minute: '2-digit',
  })
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-start gap-3 px-3 py-2 rounded-lg border border-[#EAEAEA] hover:border-gray-300 hover:bg-gray-50/60 transition-colors"
    >
      <div className="text-xs text-gray-500 w-12 shrink-0 pt-0.5">{time}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          {isChange ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ring-1 ring-inset bg-blue-50 text-blue-700 ring-blue-600/20">
              <Activity size={9} /> Cambio
            </span>
          ) : (
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ring-1 ring-inset ${phaseMeta.pill}`}>
              {phaseMeta.label}
            </span>
          )}
          {event.urgency !== 'past' && (
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ring-1 ring-inset ${urgency.tone}`}>
              {event.urgency === 'urgent' && <AlertTriangle size={9} />}
              {event.urgency === 'this_week' && <Clock size={9} />}
              {urgency.label}
            </span>
          )}
          {event.account_name && (
            <span className="text-[10px] text-gray-500">· {event.account_name}</span>
          )}
        </div>
        <p className="text-sm font-medium text-gray-900 truncate">{event.event_name}</p>
        <p className="text-xs text-gray-500 truncate">{event.process_name}</p>
      </div>
    </button>
  )
}
