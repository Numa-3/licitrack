/**
 * Retry wrapper for Supabase calls that may fail due to network issues.
 * Retries up to 2 times with 2s delay. If still failing, returns the error.
 */
export async function withRetry<T>(
  fn: () => Promise<{ data: T; error: { message: string } | null }>,
  maxRetries = 2,
  delayMs = 2000,
): Promise<{ data: T; error: { message: string; canRetry: boolean } | null }> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await fn()

    if (!result.error) {
      return { data: result.data, error: null }
    }

    // Check if it's a network error (not a Supabase/RLS error)
    const msg = result.error.message.toLowerCase()
    const isNetworkError = msg.includes('fetch') || msg.includes('network') || msg.includes('failed to fetch') || msg.includes('load failed') || !navigator.onLine

    if (!isNetworkError || attempt === maxRetries) {
      return {
        data: result.data,
        error: {
          message: isNetworkError
            ? 'No se pudo guardar. ¿Reintentar?'
            : result.error.message,
          canRetry: isNetworkError,
        },
      }
    }

    // Wait before retrying
    await new Promise(resolve => setTimeout(resolve, delayMs))
  }

  // Should never reach here, but TypeScript needs it
  return { data: null as T, error: { message: 'Error inesperado', canRetry: false } }
}

/**
 * Retry wrapper for fetch() calls to API routes.
 * Retries on network errors only (not HTTP errors like 400/500).
 */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  maxRetries = 2,
  delayMs = 2000,
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetch(input, init)
    } catch (err) {
      if (attempt === maxRetries) throw err
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
  throw new Error('Error inesperado')
}
