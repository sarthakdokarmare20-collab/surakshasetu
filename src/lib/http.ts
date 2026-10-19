export class HttpError extends Error {
  constructor(message: string, public status?: number, public kind: 'network' | 'http' | 'timeout' | 'parse' | 'aborted' = 'http') { super(message) }
}

export async function fetchJson<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = 20000, signal, ...rest } = init
  const ctrl = new AbortController()
  const onAbort = () => ctrl.abort()
  signal?.addEventListener('abort', onAbort)
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...rest, signal: ctrl.signal })
    if (!res.ok) {
      let body = ''
      try { body = (await res.text()).slice(0, 200) } catch { /* ignore */ }
      throw new HttpError(res.status === 429 ? 'The service is rate-limiting requests. Please wait a moment and try again.' : `Service responded with HTTP ${res.status}. ${body}`.trim(), res.status, 'http')
    }
    try { return (await res.json()) as T } catch { throw new HttpError('The service returned an unreadable response.', res.status, 'parse') }
  } catch (e) {
    if (e instanceof HttpError) throw e
    if (signal?.aborted) throw new HttpError('Request cancelled.', undefined, 'aborted')
    if ((e as Error).name === 'AbortError') throw new HttpError('The service took too long to respond.', undefined, 'timeout')
    throw new HttpError('Could not reach the service. Check your internet connection.', undefined, 'network')
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort) }
}

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Tiny localStorage cache with TTL; silently degrades when storage is unavailable. */
export const cache = {
  get<T>(key: string): T | null {
    try { const raw = localStorage.getItem('ss:' + key); if (!raw) return null; const { t, ttl, v } = JSON.parse(raw); if (Date.now() - t > ttl) { localStorage.removeItem('ss:' + key); return null } return v as T } catch { return null }
  },
  set(key: string, v: unknown, ttlMs: number) { try { localStorage.setItem('ss:' + key, JSON.stringify({ t: Date.now(), ttl: ttlMs, v })) } catch { /* ignore */ } },
}
