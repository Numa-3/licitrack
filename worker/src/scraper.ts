import { SECOP, USER_AGENT } from './config.js'
import { serializeCookies, type CookieEntry } from './session.js'

type ScrapeResult = {
  html: string
  status: number
}

/**
 * Fetch an authenticated SECOP process page.
 * Returns HTML string or null if session is expired (redirected to login).
 */
export async function scrapePage(
  ntcId: string,
  cookies: CookieEntry[],
): Promise<ScrapeResult | null> {
  const url = SECOP.processUrl(ntcId)

  const res = await fetch(url, {
    headers: {
      Cookie: serializeCookies(cookies, url),
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-CO,es;q=0.9,en;q=0.8',
    },
    redirect: 'manual', // Don't follow redirects — detect login redirect
  })

  // If SECOP redirects to login page, session is expired
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get('location') || ''
    if (location.includes('Login') || location.includes('login')) {
      return null // Session expired
    }
  }

  if (!res.ok && res.status !== 304) {
    throw new Error(`SECOP page error: ${res.status} ${res.statusText}`)
  }

  const html = await res.text()

  // Double-check: if the HTML contains the login form, session expired
  if (html.includes('id="loginForm"') || html.includes('Tendering/Login')) {
    return null
  }

  return { html, status: res.status }
}
