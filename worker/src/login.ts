import { chromium } from 'playwright'
import { config, SECOP } from './config.js'
import { admin } from './db.js'
import { decrypt } from './crypto.js'
import { saveSession, type CookieEntry } from './session.js'

/**
 * Login to SECOP using Playwright + CapSolver for CAPTCHA.
 *
 * SECOP login flow:
 *   1. Enter username + password + solve CAPTCHA → click Login
 *   2. Select entity from dropdown (each account has multiple entities/companies)
 *   3. Click "Entrar" → session active for that entity
 *
 * Run standalone:
 *   npx tsx src/login.ts                    # all active accounts
 *   npx tsx src/login.ts <accountId>        # specific account
 *   npx tsx src/login.ts --discover <user>  # discover entities for a username
 */
export async function loginAccount(accountId: string, entityOverride?: string): Promise<boolean> {
  const { data: account } = await admin
    .from('secop_accounts')
    .select('id, name, username, password_encrypted, entity_name, monitored_entities, discovered_entities')
    .eq('id', accountId)
    .single()

  if (!account) {
    console.error(`[Login] Account ${accountId} not found`)
    return false
  }

  // Entity selection is NOT needed during login — the SECOP company selector is post-login.
  // Company switching uses SwitchCompany?companyCode=XXX after a single login.
  const password = decrypt(account.password_encrypted)
  console.log(`[Login] Logging in as ${account.username} (${account.name})... pwd_len=${password.length}`)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    // Step 1: Load login page (SECOP redirects to community.secop.gov.co)
    await page.goto(SECOP.loginUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForSelector('#txtUserName', { state: 'visible', timeout: 45_000 })
    console.log(`[Login] Login form loaded`)

    // Step 2: Fill credentials first — CAPTCHA solving can take 30-60s, creds should be ready
    await page.fill('#txtUserName', account.username)
    await page.fill('#txtPassword', password)

    // Step 3: Solve CAPTCHA
    const captchaToken = await solveCaptcha(page.url(), page)

    // If CAPTCHA is still present but solving failed, abort (don't attempt login without token)
    if (!captchaToken) {
      const captchaStillPresent = await page.evaluate(`
        !!document.querySelector('.g-recaptcha, [data-sitekey]')
      `) as boolean
      if (captchaStillPresent) {
        console.error('[Login] CAPTCHA required but solving failed — aborting')
        return false
      }
    }

    // Step 4: Inject CAPTCHA token — trigger callback so SECOP form accepts the token
    if (captchaToken) {
      await page.evaluate(`
        (() => {
          var token = ${JSON.stringify(captchaToken)};
          // Set all g-recaptcha-response textareas (may be multiple iframes)
          var tas = document.querySelectorAll('textarea[name="g-recaptcha-response"]');
          for (var i = 0; i < tas.length; i++) {
            tas[i].removeAttribute('readonly');
            tas[i].style.display = 'block';
            tas[i].value = token;
            tas[i].dispatchEvent(new Event('change', { bubbles: true }));
            tas[i].dispatchEvent(new Event('input', { bubbles: true }));
          }
          // responseKey field (SECOP-specific)
          var rk = document.querySelector('#txaresponseKey, [name="txaresponseKey"]');
          if (rk) rk.value = token;
          // Override grecaptcha.getResponse (v2 and enterprise)
          window.grecaptcha = window.grecaptcha || {};
          window.grecaptcha.getResponse = function() { return token; };
          window.grecaptcha.enterprise = window.grecaptcha.enterprise || {};
          window.grecaptcha.enterprise.getResponse = function() { return token; };
          // Trigger data-callback if defined on the reCAPTCHA element
          var captchaEl = document.querySelector('.g-recaptcha, [data-sitekey]');
          if (captchaEl) {
            var cbName = captchaEl.getAttribute('data-callback');
            if (cbName && typeof window[cbName] === 'function') {
              window[cbName](token);
            }
          }
        })()
      `)
      await page.waitForTimeout(800)
    }

    // Step 5: Click login button (uses postForm() via onclick — AJAX call)
    // Listen for the AJAX response to know when auth is done
    const loginResponsePromise = page.waitForResponse(
      res => res.url().includes('LoginAuthenticate'),
      { timeout: 30_000 },
    )
    await page.click('#btnLoginButton')
    const loginResponse = await loginResponsePromise
    console.log(`[Login] Auth response: ${loginResponse.status()}`)

    // Step 6: After credentials auth, SECOP shows a "Company:" dropdown + "Entrar" button.
    // This is a required second step — select a company and click Entrar to enter the portal.
    await page.waitForTimeout(2_000)

    const companies = await page.evaluate(`
      (() => {
        var sel = document.querySelector('#seldpCompany');
        if (!sel) return null;
        var opts = [];
        for (var i = 0; i < sel.options.length; i++) {
          opts.push({ value: sel.options[i].value, name: sel.options[i].text.trim() });
        }
        return opts;
      })()
    `) as { value: string; name: string }[] | null

    if (companies && companies.length > 0) {
      console.log(`[Login] Company selector found — ${companies.length} companies`)

      // Save discovered companies to DB so discovery knows what to iterate
      await admin
        .from('secop_accounts')
        .update({ discovered_entities: companies.map(c => ({ name: c.name, value: c.value })) })
        .eq('id', accountId)

      // Select specific entity if override provided, otherwise first is already selected
      if (entityOverride) {
        const target = companies.find(c =>
          c.name.toUpperCase().includes(entityOverride.toUpperCase()),
        )
        if (target) {
          await page.selectOption('#seldpCompany', target.value)
          console.log(`[Login] Selected company: ${target.name}`)
        }
      }

      // Click "Entrar" to finalize login under selected company
      const enterResponsePromise = page.waitForResponse(
        res => res.url().includes('ChooseInformation'),
        { timeout: 20_000 },
      ).catch(() => null)
      await page.click('#btnButton1')
      await enterResponsePromise
      await page.waitForTimeout(3_000)
    }

    // Step 7: Verify we're now in the portal (URL should be secop.gov.co, not community.secop.gov.co/STS/Users/Login)
    const finalUrl = page.url()
    const stillOnLogin = finalUrl.includes('/STS/Users/Login') || finalUrl.includes('/CO1Portal/Tendering/Login')
    if (stillOnLogin) {
      // Only capture VISIBLE error messages (SECOP keeps error elements in DOM with display:none)
      const errorMsg = await page.evaluate(`
        (() => {
          var els = document.querySelectorAll('[class*="error-text"], [id*="Failure"]');
          var msgs = [];
          for (var i = 0; i < els.length; i++) {
            var style = window.getComputedStyle(els[i]);
            if (style.display !== 'none' && style.visibility !== 'hidden') {
              var t = els[i].textContent ? els[i].textContent.trim() : '';
              if (t) msgs.push(t);
            }
          }
          return msgs.join(' | ').slice(0, 200);
        })()
      `) as string
      console.error(`[Login] Still on login page. URL: ${finalUrl}`)
      if (errorMsg) console.error(`[Login] Visible errors: ${errorMsg}`)
      return false
    }

    console.log(`[Login] Success! URL: ${finalUrl}`)

    // Step 8: Navigate to contracts page to initialize CO1ContractsManagement session.
    // This sets up additional session cookies needed for the fetch-based discovery flow.
    try {
      await page.goto(SECOP.contractsUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await page.waitForTimeout(2_000)
      console.log(`[Login] Contracts page initialized: ${page.url()}`)
    } catch {
      console.warn('[Login] Could not pre-initialize contracts page — discovery may still work')
    }

    // Step 9: Extract and save cookies with full path/domain info.
    // SECOP issues separate FedAuth tokens per application (CO1Marketplace, CO1ContractsManagement).
    // We must preserve path context so each endpoint gets the right token.
    const browserCookies = await context.cookies()
    const cookieList: CookieEntry[] = browserCookies.map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
    }))

    await saveSession(accountId, cookieList, 4)
    console.log(`[Login] Saved ${cookieList.length} cookies for ${account.name}`)

    return true
  } catch (err) {
    console.error(`[Login] Failed for ${account.name}:`, err instanceof Error ? err.message : err)
    return false
  } finally {
    await browser.close()
  }
}

/**
 * Discover available entities for a SECOP account.
 * Logs in, reads the entity dropdown, saves to DB.
 */
export async function discoverEntities(accountId: string): Promise<string[]> {
  const { data: account } = await admin
    .from('secop_accounts')
    .select('id, name, username, password_encrypted')
    .eq('id', accountId)
    .single()

  if (!account) {
    console.error(`[Discover] Account ${accountId} not found`)
    return []
  }

  const password = decrypt(account.password_encrypted)
  console.log(`[Discover] Finding entities for ${account.username} (${account.name})...`)

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    await page.goto(SECOP.loginUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForSelector('#txtUserName', { state: 'visible', timeout: 45_000 })

    const captchaToken = await solveCaptcha(page.url(), page)

    await page.fill('#txtUserName', account.username)
    await page.fill('#txtPassword', password)

    if (captchaToken) {
      await page.evaluate(`
        (() => {
          var token = ${JSON.stringify(captchaToken)};
          var tas = document.querySelectorAll('textarea[name="g-recaptcha-response"]');
          for (var i = 0; i < tas.length; i++) tas[i].value = token;
          var rk = document.querySelector('#txaresponseKey, [name="txaresponseKey"]');
          if (rk) rk.value = token;
          window.grecaptcha = Object.assign(window.grecaptcha || {}, { getResponse: function() { return token; } });
        })()
      `)
      await page.waitForTimeout(500)
    }

    const loginResponsePromise = page.waitForResponse(
      res => res.url().includes('LoginAuthenticate'),
      { timeout: 30_000 },
    )
    await page.click('#btnLoginButton')
    await loginResponsePromise

    // Navigate to the contracts management page to find the company selector.
    // The #companiesSelector dropdown appears AFTER login on the contracts page,
    // not on the login page itself.
    await page.waitForTimeout(2_000)
    await page.goto('https://www.secop.gov.co/CO1ContractsManagement/Tendering/SalesContractManagement/Index', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    })
    await page.waitForTimeout(3_000)

    // Extract companies from the #companiesSelector dropdown
    // NOTE: Using string-based evaluate to avoid tsx/esbuild __name injection bug
    const entities = await page.evaluate(`
      (() => {
        var results = [];
        var sel = document.querySelector('#companiesSelector');
        if (sel) {
          var opts = sel.querySelectorAll('option');
          for (var i = 0; i < opts.length; i++) {
            var name = opts[i].getAttribute('title') || opts[i].textContent.trim();
            var value = opts[i].value;
            if (name && value) results.push({ name: name, value: value });
          }
        }
        return results;
      })()
    `) as { name: string; value: string }[]

    console.log(`[Discover] Found ${entities.length} companies:`)
    entities.forEach((e, i) => console.log(`  ${i + 1}. ${e.name} (${e.value})`))

    // Save to DB
    await admin
      .from('secop_accounts')
      .update({ discovered_entities: entities })
      .eq('id', accountId)

    console.log(`[Discover] Saved to DB`)

    return entities.map(e => e.name)
  } catch (err) {
    console.error(`[Discover] Failed:`, err instanceof Error ? err.message : err)
    return []
  } finally {
    await browser.close()
  }
}

// ── CAPTCHA solver ─────────────────────────────────────────

async function solveCaptcha(pageUrl: string, page: import('playwright').Page): Promise<string | null> {
  if (!config.capsolverApiKey) {
    console.warn('[Login] No CAPSOLVER_API_KEY — waiting 30s for manual solve...')
    await page.waitForTimeout(30_000)
    return null
  }

  const siteKey = await page.evaluate(`
    (() => {
      var el = document.querySelector('.g-recaptcha, [data-sitekey]');
      return el ? el.getAttribute('data-sitekey') : null;
    })()
  `) as string | null

  if (!siteKey) {
    console.log('[Login] No reCAPTCHA detected')
    return null
  }

  console.log(`[Login] reCAPTCHA detected. Solving with CapSolver...`)

  const createRes = await fetch('https://api.capsolver.com/createTask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientKey: config.capsolverApiKey,
      task: {
        type: 'ReCaptchaV2TaskProxyLess',
        websiteURL: pageUrl,
        websiteKey: siteKey,
      },
    }),
  })

  const createData = await createRes.json() as { errorId: number; taskId?: string; errorDescription?: string }
  if (createData.errorId !== 0) {
    console.error('[Login] CapSolver error:', createData.errorDescription)
    return null
  }

  const taskId = createData.taskId!
  console.log(`[Login] CapSolver task: ${taskId}`)

  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 3_000))

    const resultRes = await fetch('https://api.capsolver.com/getTaskResult', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientKey: config.capsolverApiKey, taskId }),
    })

    const resultData = await resultRes.json() as {
      status: string
      solution?: { gRecaptchaResponse: string }
      errorDescription?: string
    }

    if (resultData.status === 'ready') {
      console.log('[Login] CAPTCHA solved!')
      return resultData.solution!.gRecaptchaResponse
    }
    if (resultData.status === 'failed') {
      console.error('[Login] CapSolver failed:', resultData.errorDescription)
      return null
    }
  }

  console.error('[Login] CapSolver timeout')
  return null
}

// ── CLI ────────────────────────────────────────────────────
// Guard: only run CLI code when this file is executed directly (not when imported)

import { fileURLToPath } from 'url'
const isMain = process.argv[1] === fileURLToPath(import.meta.url)

if (isMain) {

const args = process.argv.slice(2)

if (args[0] === '--discover') {
  // Discover entities: npx tsx src/login.ts --discover [accountId]
  if (args[1]) {
    await discoverEntities(args[1])
  } else {
    const { data: accounts } = await admin
      .from('secop_accounts')
      .select('id, name')
      .eq('is_active', true)

    if (!accounts?.length) {
      console.log('[Discover] No active accounts')
      process.exit(0)
    }

    for (const acc of accounts) {
      console.log(`\n--- ${acc.name} ---`)
      await discoverEntities(acc.id)
    }
  }
} else if (args[0] && !args[0].startsWith('-')) {
  // Login specific account: npx tsx src/login.ts <accountId>
  loginAccount(args[0]).then(ok => {
    console.log(ok ? 'Login successful' : 'Login failed')
    process.exit(ok ? 0 : 1)
  })
} else {
  // Login all active accounts
  const { data: accounts } = await admin
    .from('secop_accounts')
    .select('id, name')
    .eq('is_active', true)

  if (!accounts?.length) {
    console.log('[Login] No active accounts found')
    process.exit(0)
  }

  for (const acc of accounts) {
    console.log(`\n--- ${acc.name} ---`)
    await loginAccount(acc.id)
  }
}
} // end isMain
