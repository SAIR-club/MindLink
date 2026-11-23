/**
 * JSON over a running service's REST API, as a page or an agent host sends it: POST when there is a body, GET
 * otherwise. What a non-success means is the caller's to decide, because a test often asserts the status.
 */

export interface Reply<T> {
  readonly status: number
  readonly body: T
}

export async function rest<T = Record<string, unknown>>(
  base: string,
  path: string,
  body?: unknown,
  token?: string,
  headers: Record<string, string> = {},
): Promise<Reply<T>> {
  const response = await fetch(`${base}${path}`, {
    ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      ...headers,
    },
  })
  return { status: response.status, body: (await response.json().catch(() => ({}))) as T }
}

/** A page's call, with the person's credential; a non-success throws with the path and body. */
export async function pageRest<T = Record<string, unknown>>(
  service: { readonly apiUrl: string; readonly humanToken: string | undefined },
  path: string,
  body?: unknown,
): Promise<Reply<T>> {
  const reply = await rest<T>(service.apiUrl, path, body, service.humanToken)
  if (reply.status < 200 || reply.status >= 300) {
    throw new Error(`${path} -> ${reply.status}: ${JSON.stringify(reply.body)}`)
  }
  return reply
}

/** A page's call when it only wants the answer. */
export async function pageBody<T = Record<string, unknown>>(
  service: { readonly apiUrl: string; readonly humanToken: string | undefined },
  path: string,
  body?: unknown,
): Promise<T> {
  return (await pageRest<T>(service, path, body)).body
}
