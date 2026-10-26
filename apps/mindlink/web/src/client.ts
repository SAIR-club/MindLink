import { refusalText } from './refusals.js'

/**
 * The one way a page reaches the service: JSON over the REST API, with the page's session cookie.
 *
 * Every answer that is not a success becomes an `ApiError` whose message is already the Chinese text for its
 * code, so a page shows `error.message` and nothing else. A 401 also tells the shell, which sends the person to
 * sign in again.
 */

/** Episteme's REST API. */
export const API = '/api/v1'

/** MindLink's own routes: a feature's `routes.ts` paths are served under this. */
export const SCENE_API = `${API}/scene/mindlink`

/** A request the service refused or could not answer. `message` is for the person; `detail` for a report. */
export class ApiError extends Error {
  /**
   * @param status the HTTP status, or 0 when no answer came back
   * @param code the refusal code
   * @param detail the service's own English message
   */
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail = '',
  ) {
    super(refusalText(code))
    this.name = 'ApiError'
  }
}

export type Fetch = (
  input: string,
  init: RequestInit,
) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>

export interface Client {
  get(path: string): Promise<Record<string, unknown>>
  post(path: string, body?: Readonly<Record<string, unknown>>): Promise<Record<string, unknown>>
}

export function createClient({
  fetch,
  onUnauthenticated = () => {},
}: {
  readonly fetch: Fetch
  readonly onUnauthenticated?: (error: ApiError) => void
}): Client {
  async function request(
    method: 'GET' | 'POST',
    path: string,
    body?: Readonly<Record<string, unknown>>,
  ): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = { accept: 'application/json' }
    if (body !== undefined) headers['content-type'] = 'application/json'
    let response: Awaited<ReturnType<Fetch>>
    try {
      response = await fetch(path, {
        method,
        headers,
        credentials: 'same-origin',
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
    } catch (error) {
      throw new ApiError(0, 'network', error instanceof Error ? error.message : String(error))
    }
    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      payload = undefined
    }
    const object =
      typeof payload === 'object' && payload !== null && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : undefined
    if (response.ok) {
      if (object === undefined) throw new ApiError(response.status, 'bad_response')
      return object
    }
    const code =
      typeof object?.['code'] === 'string' ? object['code'] : codeOfStatus(response.status)
    const detail = typeof object?.['error'] === 'string' ? object['error'] : ''
    const error = new ApiError(response.status, code, detail)
    if (response.status === 401) onUnauthenticated(error)
    throw error
  }

  return {
    get: (path) => request('GET', path),
    post: (path, body = {}) => request('POST', path, body),
  }
}

/** The code an answer without one stands for, such as a proxy's own error page. */
function codeOfStatus(status: number): string {
  if (status === 401) return 'unauthenticated'
  if (status === 404) return 'no_route'
  if (status >= 500) return 'internal'
  return 'bad_response'
}

/** What to tell a person about anything a page threw: a refusal's text, or that the page itself failed. */
export function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return '页面出了问题，请刷新后再试。'
}

/** A refusal's code, for a report, or `undefined` when what was thrown is not a refusal. */
export function codeOf(error: unknown): string | undefined {
  return error instanceof ApiError ? error.code : undefined
}
