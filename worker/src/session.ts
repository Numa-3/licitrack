import { admin } from './db.js'

export type CookieEntry = {
  name: string
  value: string
  domain: string
  path: string
}

type AccountSession = {
  accountId: string
  cookies: CookieEntry[]
  expiresAt: string
}

/**
 * Get valid session cookies for an account.
 * Returns null if no valid session exists (cookies expired or invalidated).
 */
export async function getValidSession(accountId: string): Promise<AccountSession | null> {
  const { data } = await admin
    .from('secop_accounts')
    .select('id, cookies_json, cookies_expire_at')
    .eq('id', accountId)
    .eq('is_active', true)
    .single()

  if (!data?.cookies_json || !data.cookies_expire_at) return null

  // Check expiry (with 5 min buffer)
  const expiresAt = new Date(data.cookies_expire_at)
  const buffer = 5 * 60 * 1000
  if (expiresAt.getTime() - buffer < Date.now()) return null

  const raw = data.cookies_json
  // Legacy format (Record<string, string>) lacks path info needed for FedAuth scoping — force re-login
  if (!Array.isArray(raw)) return null
  const cookies = raw as CookieEntry[]

  return {
    accountId: data.id,
    cookies,
    expiresAt: data.cookies_expire_at,
  }
}

/**
 * Save session cookies for an account after successful login.
 */
export async function saveSession(
  accountId: string,
  cookies: CookieEntry[],
  ttlHours = 4,
): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString()

  await admin
    .from('secop_accounts')
    .update({
      cookies_json: cookies,
      cookies_expire_at: expiresAt,
      last_login_at: new Date().toISOString(),
    })
    .eq('id', accountId)
}

/**
 * Invalidate session cookies (e.g., after detecting expired session from SECOP response).
 */
export async function invalidateSession(accountId: string): Promise<void> {
  await admin
    .from('secop_accounts')
    .update({
      cookies_json: null,
      cookies_expire_at: null,
    })
    .eq('id', accountId)
}

/**
 * Serialize cookies to a Cookie header string, optionally filtered by URL.
 *
 * When forUrl is provided, only cookies matching that URL's domain and path are included.
 * This is critical for SECOP: FedAuth tokens are scoped per application
 * (CO1Marketplace, CO1ContractsManagement, etc.) and must not be mixed.
 */
export function serializeCookies(cookies: CookieEntry[], forUrl?: string): string {
  let filtered = cookies
  if (forUrl) {
    try {
      const urlObj = new URL(forUrl)
      filtered = cookies.filter(c => {
        const cleanDomain = c.domain.replace(/^\./, '')
        const hostMatch = urlObj.hostname === cleanDomain || urlObj.hostname.endsWith('.' + cleanDomain)
        const pathMatch = c.path === '/' || urlObj.pathname.startsWith(c.path)
        return hostMatch && pathMatch
      })
    } catch {
      // Invalid URL — fall through with all cookies
    }
  }
  return filtered.map(c => `${c.name}=${c.value}`).join('; ')
}
