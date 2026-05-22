/**
 * Inbox monitor: scrapea la bandeja global de mensajes por cuenta SECOP y
 * persiste los mensajes nuevos en `secop_inbox_messages`. Si el mensaje
 * matchea un proceso monitoreado (por `referencia_proceso`), también inserta
 * un registro en `secop_process_changes` para que el pipeline de
 * notificaciones existente (trigger → notifications → Telegram → campanita
 * unread) se dispare automáticamente.
 *
 * Estrategia para evitar abrir mensajes individuales (riesgo: SECOP los
 * marca como "Leído"): leemos solo la lista del listado, que ya trae Desde,
 * Tipo, Asunto, Fecha, Estado y a veces "Ref:".
 */
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { admin } from './db.js'
import { getValidSession, invalidateSession } from './session.js'
import { loginAccount } from './login.js'
import { SECOP, USER_AGENT } from './config.js'
import { parseInboxList, parseInboxDetail } from './parsers/inbox.js'

type AccountRow = {
  id: string
  name: string
  is_active: boolean
  last_inbox_sync_at: string | null
}

type ProcessLookupRow = {
  id: string
  account_id: string | null
  referencia_proceso: string | null
}

const DEBUG_HTML_DIR = path.resolve(process.cwd(), 'debug-html')

async function debugDump(filename: string, html: string): Promise<void> {
  try {
    await mkdir(DEBUG_HTML_DIR, { recursive: true })
    await writeFile(path.join(DEBUG_HTML_DIR, filename), html, 'utf8')
    console.log(`[Inbox] Sample HTML guardado en debug-html/${filename}`)
  } catch (err) {
    console.error('[Inbox] No pude guardar debug HTML:', err instanceof Error ? err.message : err)
  }
}

/**
 * Aplica el filtro "Mensaje recibido desde" usando el formulario de la
 * propia página. Si falla, retorna false y el caller debe scrapear sin filtro
 * (más mensajes pero igualmente dedupeados via UNIQUE constraint).
 */
async function applyDateFilter(page: import('playwright').Page, sinceIsoDate: string): Promise<boolean> {
  // sinceIsoDate llega como 'YYYY-MM-DD'. SECOP espera DD/MM/YYYY HH:MM AM/PM
  // pero su input acepta varios formatos. Usamos el formato más común.
  const [y, mo, d] = sinceIsoDate.split('-')
  const formatted = `${d}/${mo}/${y} 12:00 AM`
  try {
    // Buscar input por label común (heurístico — el id real lo veremos en debug HTML)
    const candidates = [
      'input[id*="MessageReceivedFrom"]',
      'input[name*="MessageReceivedFrom"]',
      'input[id*="ReceivedFrom"]',
      'input[id*="FechaDesde"]',
      'input[placeholder*="desde"]',
    ]
    for (const sel of candidates) {
      const $input = page.locator(sel).first()
      if (await $input.count() > 0) {
        await $input.fill(formatted)
        // Click en el botón Buscar (selector heurístico también)
        const $btn = page.locator('button:has-text("Buscar"), input[value="Buscar"]').first()
        if (await $btn.count() > 0) {
          await Promise.all([
            page.waitForLoadState('domcontentloaded'),
            $btn.click(),
          ])
          return true
        }
      }
    }
    return false
  } catch {
    return false
  }
}

async function syncAccountInbox(account: AccountRow): Promise<{ scraped: number; inserted: number; matched: number; warnings: string[] }> {
  const warnings: string[] = []
  let session = await getValidSession(account.id)
  if (!session) {
    console.log(`[Inbox] ${account.name}: session expirada, re-login...`)
    const ok = await loginAccount(account.id)
    if (!ok) {
      console.error(`[Inbox] ${account.name}: login falló, skip`)
      return { scraped: 0, inserted: 0, matched: 0, warnings: ['login failed'] }
    }
    session = await getValidSession(account.id)
    if (!session) return { scraped: 0, inserted: 0, matched: 0, warnings: ['no session after login'] }
  }

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ userAgent: USER_AGENT })
  await context.addCookies(session.cookies.map(c => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path || '/',
    httpOnly: true,
    secure: true,
    sameSite: 'None' as const,
  })))

  const page = await context.newPage()

  try {
    await page.goto(SECOP.messagesUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })

    // Si redirigió a login, sesión inválida
    if (page.url().toLowerCase().includes('/login')) {
      await invalidateSession(account.id)
      console.error(`[Inbox] ${account.name}: redirected to login, session invalidated`)
      return { scraped: 0, inserted: 0, matched: 0, warnings: ['session expired'] }
    }

    // Aplicar filtro de fecha si hay last_sync (sino, traemos lo que SECOP devuelve por default)
    if (account.last_inbox_sync_at) {
      const sinceDate = account.last_inbox_sync_at.slice(0, 10)  // YYYY-MM-DD
      const ok = await applyDateFilter(page, sinceDate)
      if (!ok) warnings.push(`No pude aplicar filtro desde ${sinceDate}, scrapeando default`)
    }

    const html = await page.content()
    const { rows, warnings: parserWarnings } = parseInboxList(html)
    warnings.push(...parserWarnings)

    // Si parsing devolvió 0 filas, guardar HTML para debug
    if (rows.length === 0) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      await debugDump(`inbox-${account.name.replace(/\s+/g, '_')}-${stamp}.html`, html)
      console.warn(`[Inbox] ${account.name}: 0 filas parseadas. HTML dumped.`)
      return { scraped: 0, inserted: 0, matched: 0, warnings }
    }

    console.log(`[Inbox] ${account.name}: ${rows.length} filas parseadas`)

    // Lookup de procesos monitoreados de esta cuenta por referencia_proceso
    const { data: procs } = await admin
      .from('secop_processes')
      .select('id, account_id, referencia_proceso')
      .eq('account_id', account.id)
      .not('referencia_proceso', 'is', null)
    const refToProcessId = new Map<string, string>()
    for (const p of (procs as ProcessLookupRow[] | null) || []) {
      if (p.referencia_proceso) {
        refToProcessId.set(p.referencia_proceso.trim().toLowerCase(), p.id)
      }
    }

    // Política de apertura de mensajes:
    //
    // - PRIMER ciclo de la cuenta (last_inbox_sync_at = NULL): se registran
    //   todos los mensajes existentes SIN abrir ninguno. Quedan como "el
    //   pasado" — los que no traen Ref en el subject van a huérfanos.
    //
    // - Ciclos siguientes: solo se abren mensajes con `estado='Nuevo'`, sin
    //   Ref en el subject, y con `fecha > last_inbox_sync_at`. Esos son los
    //   que llegaron DESPUÉS de que arrancamos el scraper.
    //
    // Esto evita disparar "Leído por LiciTrack" en mensajes históricos que
    // el equipo nunca abrió manualmente.
    const isFirstSync = !account.last_inbox_sync_at
    const sinceMs = account.last_inbox_sync_at
      ? new Date(account.last_inbox_sync_at).getTime()
      : null

    if (isFirstSync) {
      console.log(`[Inbox] ${account.name}: primer sync — registrando ${rows.length} mensaje(s) histórico(s) SIN abrir ninguno`)
    } else {
      const newRowsWithoutRef = rows.filter(r => {
        if (r.estado !== 'Nuevo' || r.ref_proceso || !r.detalle_url) return false
        if (!r.fecha_iso) return false
        const fechaMs = new Date(r.fecha_iso).getTime()
        return sinceMs !== null && fechaMs > sinceMs
      })

      if (newRowsWithoutRef.length > 0) {
        console.log(`[Inbox] ${account.name}: abriendo ${newRowsWithoutRef.length} mensaje(s) nuevo(s) posteriores a ${account.last_inbox_sync_at} para extraer Ref`)
        for (const row of newRowsWithoutRef) {
          try {
            const detalleUrl = row.detalle_url!.startsWith('http')
              ? row.detalle_url!
              : new URL(row.detalle_url!, SECOP.baseUrl).toString()
            await page.goto(detalleUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
            const detailHtml = await page.content()
            const detail = parseInboxDetail(detailHtml)
            if (detail.ref_proceso) row.ref_proceso = detail.ref_proceso
            // Pequeño delay para no spamear SECOP
            await new Promise(r => setTimeout(r, 1500))
          } catch (err) {
            warnings.push(`No pude abrir detalle de "${row.asunto.slice(0, 40)}": ${err instanceof Error ? err.message : err}`)
          }
        }
      }
    }

    let inserted = 0
    let matched = 0
    for (const row of rows) {
      const refKey = row.ref_proceso?.trim().toLowerCase() || null
      const processId = refKey ? refToProcessId.get(refKey) || null : null

      const insertPayload = {
        account_id: account.id,
        process_id: processId,
        message_uid: row.message_uid,
        ref_proceso: row.ref_proceso,
        tipo: row.tipo,
        asunto: row.asunto,
        sender: row.desde,
        fecha: row.fecha_iso!,
        estado: row.estado,
        has_attachments: row.has_attachments,
        detalle_url: row.detalle_url,
      }

      const { data, error } = await admin
        .from('secop_inbox_messages')
        .insert(insertPayload)
        .select('id')
        .single()

      if (error) {
        // 23505 = unique violation (ya existe) — esperado, idempotencia
        if ((error as { code?: string }).code === '23505') continue
        warnings.push(`Insert failed: ${error.message}`)
        continue
      }

      inserted++

      // Si matchea proceso monitoreado → disparar change para notificación
      if (processId && data) {
        matched++
        const changeType = classifyChangeType(row.tipo)
        const priority = priorityFor(row.tipo)
        const summary = `${row.tipo}: ${row.asunto}${row.desde ? ` (${row.desde})` : ''}`
        const { error: changeErr } = await admin
          .from('secop_process_changes')
          .insert({
            process_id: processId,
            change_type: changeType,
            priority,
            summary,
            after_json: { inbox_message_id: data.id, tipo: row.tipo, asunto: row.asunto, sender: row.desde, fecha: row.fecha_iso },
          })
        if (changeErr) warnings.push(`Change insert failed: ${changeErr.message}`)
        else {
          await admin.from('secop_inbox_messages').update({ notified_at: new Date().toISOString() }).eq('id', data.id)
        }
      }
    }

    // Marcar la cuenta con timestamp de último sync
    await admin
      .from('secop_accounts')
      .update({ last_inbox_sync_at: new Date().toISOString() })
      .eq('id', account.id)

    return { scraped: rows.length, inserted, matched, warnings }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error'
    warnings.push(`Fatal: ${msg}`)
    return { scraped: 0, inserted: 0, matched: 0, warnings }
  } finally {
    await browser.close()
  }
}

/**
 * Mapea tipo SECOP → change_type interno. Los títulos amigables están
 * mapeados en el trigger create_notifications_from_change (migración 018).
 */
function classifyChangeType(tipo: string): string {
  const t = tipo.toLowerCase()
  if (t.includes('notificac') || t.includes('modificac') || t.includes('adenda')) return 'inbox_adenda'
  if (t.includes('informe')) return 'inbox_informe'
  return 'inbox_message'
}

function priorityFor(tipo: string): 'low' | 'medium' | 'high' {
  const t = tipo.toLowerCase()
  if (t.includes('notificac') || t.includes('adenda') || t.includes('modificac')) return 'high'
  if (t.includes('informe')) return 'high'
  if (t.includes('observac')) return 'medium'
  return 'low'
}

export async function runInboxSyncCycle(): Promise<{
  totalNew: number
  totalMatched: number
  perAccount: Record<string, { scraped: number; inserted: number; matched: number; warnings: string[] }>
}> {
  const { data: accounts, error } = await admin
    .from('secop_accounts')
    .select('id, name, is_active, last_inbox_sync_at')
    .eq('is_active', true)

  if (error) {
    console.error('[Inbox] No pude leer cuentas:', error.message)
    return { totalNew: 0, totalMatched: 0, perAccount: {} }
  }

  const result: { totalNew: number; totalMatched: number; perAccount: Record<string, { scraped: number; inserted: number; matched: number; warnings: string[] }> } = {
    totalNew: 0,
    totalMatched: 0,
    perAccount: {},
  }

  for (const account of (accounts as AccountRow[]) || []) {
    const r = await syncAccountInbox(account)
    result.totalNew += r.inserted
    result.totalMatched += r.matched
    result.perAccount[account.name] = r
    console.log(`[Inbox] ${account.name}: ${r.scraped} scraped, ${r.inserted} nuevos, ${r.matched} matched`)
    if (r.warnings.length > 0) {
      for (const w of r.warnings) console.warn(`[Inbox] ${account.name}: ${w}`)
    }
  }

  return result
}
