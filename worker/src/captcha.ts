/**
 * Shared CapSolver integration for solving reCAPTCHA v2 challenges.
 *
 * Used by:
 *   - login.ts (SECOP proveedor login)
 *   - precontractual/scraper.ts (public OpportunityDetail page)
 */
import type { Page } from 'playwright'
import { config } from './config.js'

/**
 * Solve a reCAPTCHA v2 on the given page using CapSolver.
 * Returns the gRecaptchaResponse token, or null if solving failed.
 *
 * The caller is responsible for injecting the token into the page — this
 * function does NOT submit any form.
 */
export async function solveCaptcha(
  pageUrl: string,
  page: Page,
  logPrefix = '[Captcha]',
): Promise<string | null> {
  if (!config.capsolverApiKey) {
    console.warn(`${logPrefix} No CAPSOLVER_API_KEY — waiting 30s for manual solve...`)
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
    console.log(`${logPrefix} No reCAPTCHA detected`)
    return null
  }

  console.log(`${logPrefix} reCAPTCHA detected (sitekey=${siteKey.slice(0, 10)}...). Solving with CapSolver...`)

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
    console.error(`${logPrefix} CapSolver error:`, createData.errorDescription)
    return null
  }

  const taskId = createData.taskId!
  console.log(`${logPrefix} CapSolver task: ${taskId}`)

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
      console.log(`${logPrefix} CAPTCHA solved!`)
      return resultData.solution!.gRecaptchaResponse
    }
    if (resultData.status === 'failed') {
      console.error(`${logPrefix} CapSolver failed:`, resultData.errorDescription)
      return null
    }
  }

  console.error(`${logPrefix} CapSolver timeout`)
  return null
}

/**
 * Inject a solved reCAPTCHA token into the page so the form accepts it.
 * Covers multiple reCAPTCHA variants (v2, enterprise, multi-iframe).
 */
export async function injectCaptchaToken(page: Page, token: string): Promise<void> {
  await page.evaluate(`
    (() => {
      var token = ${JSON.stringify(token)};
      var tas = document.querySelectorAll('textarea[name="g-recaptcha-response"]');
      for (var i = 0; i < tas.length; i++) {
        tas[i].innerHTML = token;
        tas[i].value = token;
        tas[i].style.display = 'block';
      }
      var hidden = document.querySelectorAll('input[name="g-recaptcha-response"]');
      for (var i = 0; i < hidden.length; i++) {
        hidden[i].value = token;
      }
      window.grecaptcha = window.grecaptcha || {};
      window.grecaptcha.getResponse = function() { return token; };
      window.grecaptcha.enterprise = window.grecaptcha.enterprise || {};
      window.grecaptcha.enterprise.getResponse = function() { return token; };
    })()
  `)
}
