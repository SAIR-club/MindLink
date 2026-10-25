import { describe, expect, it } from 'vitest'
import { ApiError, createClient, messageOf, type Fetch } from '../../apps/mindlink/web/client.js'
import { REFUSAL_TEXT } from '../../apps/mindlink/web/refusals.js'

interface Sent {
  readonly path: string
  readonly init: RequestInit
}

/** A fetch that answers `status` with `body` (a string is sent as is, not as JSON), and keeps what it was sent. */
function answering(status: number, body: unknown): { fetch: Fetch; sent: Sent[] } {
  const sent: Sent[] = []
  const fetch: Fetch = (path, init) => {
    sent.push({ path, init })
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () =>
        typeof body === 'string'
          ? Promise.reject(new SyntaxError('not JSON'))
          : Promise.resolve(body),
    })
  }
  return { fetch, sent }
}

async function refusal(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof ApiError) return error
    throw error
  }
  throw new Error('the request was not refused')
}

describe('the request client', () => {
  it('reads with GET and the session cookie, and returns the JSON', async () => {
    const { fetch, sent } = answering(200, { epoch: 'e', dimensions: [] })
    const api = createClient({ fetch })
    expect(await api.get('/api/v1/vocabulary')).toEqual({ epoch: 'e', dimensions: [] })
    expect(sent).toEqual([
      {
        path: '/api/v1/vocabulary',
        init: {
          method: 'GET',
          headers: { accept: 'application/json' },
          credentials: 'same-origin',
        },
      },
    ])
  })

  it('sends a POST body as JSON', async () => {
    const { fetch, sent } = answering(200, { ok: true })
    await createClient({ fetch }).post('/api/v1/scene/mindlink/projects', { title: '线性代数' })
    expect(sent[0]?.init).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '线性代数' }),
    })
  })

  it('turns a refusal into an ApiError in Chinese, keeping the code and the service’s words', async () => {
    const { fetch } = answering(422, { error: 'there is no node "n1"', code: 'unknown_node' })
    const error = await refusal(createClient({ fetch }).get('/api/v1/nodes/n1'))
    expect(error.status).toBe(422)
    expect(error.code).toBe('unknown_node')
    expect(error.message).toBe(REFUSAL_TEXT['unknown_node'])
    expect(error.detail).toBe('there is no node "n1"')
    expect(messageOf(error)).toBe(REFUSAL_TEXT['unknown_node'])
  })

  it('tells the shell when the session has ended, and still refuses the request', async () => {
    const { fetch } = answering(401, { error: 'this token is not valid', code: 'unauthenticated' })
    const ended: ApiError[] = []
    const api = createClient({ fetch, onUnauthenticated: (error) => ended.push(error) })
    const error = await refusal(api.post('/api/v1/suggestions/s1/accept'))
    expect(error.code).toBe('unauthenticated')
    expect(ended).toEqual([error])
  })

  it('does not treat a refusal for another reason as an ended session', async () => {
    const { fetch } = answering(403, { error: 'only the person', code: 'human_required' })
    const ended: ApiError[] = []
    const api = createClient({ fetch, onUnauthenticated: (error) => ended.push(error) })
    expect((await refusal(api.post('/api/v1/x'))).code).toBe('human_required')
    expect(ended).toEqual([])
  })

  it('names a failure that came with no code by its status', async () => {
    expect((await refusal(createClient(answering(502, 'Bad gateway')).get('/x'))).code).toBe(
      'internal',
    )
    expect((await refusal(createClient(answering(404, 'Not found.')).get('/x'))).code).toBe(
      'no_route',
    )
    expect((await refusal(createClient(answering(401, '')).get('/x'))).code).toBe('unauthenticated')
  })

  it('refuses a success that is not a JSON object', async () => {
    expect((await refusal(createClient(answering(200, 'hello')).get('/x'))).code).toBe(
      'bad_response',
    )
    expect((await refusal(createClient(answering(200, [1, 2])).get('/x'))).code).toBe(
      'bad_response',
    )
  })

  it('reports a service it cannot reach', async () => {
    const fetch: Fetch = () => Promise.reject(new TypeError('Failed to fetch'))
    const error = await refusal(createClient({ fetch }).get('/x'))
    expect(error).toMatchObject({ status: 0, code: 'network', detail: 'Failed to fetch' })
    expect(error.message).toBe(REFUSAL_TEXT['network'])
  })

  it('says a page failed when what it threw is not a refusal', () => {
    expect(messageOf(new TypeError('x is undefined'))).toBe('页面出了问题，请刷新后再试。')
  })
})
