import 'dotenv/config'

function requireEnv(name: string): string {
  const val = process.env[name]
  if (!val) throw new Error(`Missing required env var: ${name}`)
  return val
}

export const config = {
  supabaseUrl: requireEnv('SUPABASE_URL'),
  supabaseServiceKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  capsolverApiKey: process.env.CAPSOLVER_API_KEY || '',
  encryptionKey: requireEnv('SECOP_ENCRYPTION_KEY'),
  monitorIntervalMs: Number(process.env.MONITOR_INTERVAL_MS) || 3_600_000,
  delayBetweenRequestsMs: Number(process.env.DELAY_BETWEEN_REQUESTS_MS) || 3_000,
} as const

export const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'

// SECOP URLs
export const SECOP = {
  loginUrl: 'https://www.secop.gov.co/CO1Portal/Tendering/Login',
  baseUrl: 'https://www.secop.gov.co',
  // "Mis contratos" page — supplier dashboard (post-login)
  contractsUrl: 'https://www.secop.gov.co/CO1ContractsManagement/Tendering/SalesContractManagement/Index',
  // Switch active company context (no re-login needed — uses session cookies)
  switchCompanyUrl: 'https://www.secop.gov.co/CO1ContractsManagement/Tendering/SalesContractManagement/SwitchCompany',
  // Contract detail page (from docUniqueIdentifier in discovery links)
  contractDetailUrl: (docId: string) =>
    `https://www.secop.gov.co/CO1ContractsManagement/Tendering/SalesContractEdit/View?docUniqueIdentifier=${docId}`,
  // Public procurement notice page (for radar processes)
  processUrl: (ntcId: string) =>
    `https://www.secop.gov.co/CO1BusinessLine/Tendering/ContractNoticeView/Index?notice=${ntcId}`,
} as const
