/**
 * Extract NTC ID from a SECOP public URL.
 *
 * Input examples:
 *   "https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?noticeUID=CO1.NTC.5398889&isFromPublicArea=True"
 *   "https://www.secop.gov.co/CO1BusinessLine/Tendering/ContractNoticeView/Index?notice=CO1.NTC.5398889"
 *   "CO1.NTC.5398889"
 *
 * Output: "CO1.NTC.5398889" or null
 */
export function extractNtcId(input: string | null): string | null {
  if (!input) return null
  const match = input.match(/CO1\.NTC\.\d+/)
  return match ? match[0] : null
}
