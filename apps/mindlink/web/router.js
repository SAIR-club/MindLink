/**
 * Hash routes: `#/projects/p1?tab=settings`.
 *
 * The service serves the front end as static files and answers any other path with 404, so the route lives in
 * the hash and every page is `index.html`. Everything here is a pure function of strings.
 */

/**
 * @typedef {{ readonly path: string, readonly query: URLSearchParams }} Location
 * @typedef {Readonly<Record<string, string>>} Params
 */

/**
 * A path with one leading `/`, no empty segments and no trailing `/`, so `''`, `//a/` and `/a` are the same route.
 * @param {string} path
 * @returns {string}
 */
export function normalisePath(path) {
  const segments = path.split('/').filter((segment) => segment !== '')
  return `/${segments.join('/')}`
}

/**
 * Where a hash points: its path and its query.
 * @param {string} hash `location.hash`, with or without the leading `#`.
 * @returns {Location}
 */
export function parseHash(hash) {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  const mark = raw.indexOf('?')
  const path = mark === -1 ? raw : raw.slice(0, mark)
  const query = mark === -1 ? '' : raw.slice(mark + 1)
  return { path: normalisePath(path), query: new URLSearchParams(query) }
}

/**
 * The parameters `path` gives `pattern`, or `undefined` when it does not match. A segment written `:name` matches
 * any one segment and is decoded; every other segment must be equal.
 * @param {string} pattern such as `/projects/:id`
 * @param {string} path a normalised path, such as `/projects/p1`
 * @returns {Params | undefined}
 */
export function matchPath(pattern, path) {
  const want = normalisePath(pattern).split('/')
  const have = normalisePath(path).split('/')
  if (want.length !== have.length) return undefined
  /** @type {Record<string, string>} */
  const params = {}
  for (const [index, segment] of want.entries()) {
    const actual = have[index] ?? ''
    if (segment.startsWith(':')) {
      try {
        params[segment.slice(1)] = decodeURIComponent(actual)
      } catch {
        return undefined
      }
    } else if (segment !== actual) {
      return undefined
    }
  }
  return params
}

/**
 * The route `path` shows, and its parameters. When several match, the one with the fewest parameters wins, so
 * `/projects/new` beats `/projects/:id` whatever order they were registered in.
 * @template {{ readonly path: string }} R
 * @param {readonly R[]} routes
 * @param {string} path
 * @returns {{ route: R, params: Params } | undefined}
 */
export function resolveRoute(routes, path) {
  /** @type {{ route: R, params: Params, dynamic: number } | undefined} */
  let best
  for (const route of routes) {
    const params = matchPath(route.path, path)
    if (params === undefined) continue
    const dynamic = Object.keys(params).length
    if (best === undefined || dynamic < best.dynamic) best = { route, params, dynamic }
  }
  return best === undefined ? undefined : { route: best.route, params: best.params }
}

/**
 * The hash for a route, its parameters filled in and encoded: `hrefOf('/projects/:id', { id: 'a b' })` is
 * `#/projects/a%20b`.
 * @param {string} pattern
 * @param {Params} [params]
 * @param {Readonly<Record<string, string>> | URLSearchParams} [query]
 * @returns {string}
 */
export function hrefOf(pattern, params = {}, query = {}) {
  const path = normalisePath(pattern)
    .split('/')
    .map((segment) => {
      if (!segment.startsWith(':')) return segment
      const value = params[segment.slice(1)]
      if (value === undefined) throw new Error(`route ${pattern} needs "${segment.slice(1)}"`)
      return encodeURIComponent(value)
    })
    .join('/')
  const search = new URLSearchParams(query).toString()
  return `#${path}${search === '' ? '' : `?${search}`}`
}

/**
 * The same pattern with every parameter name erased, so `/a/:id` and `/a/:key` are seen as one route.
 * @param {string} pattern
 * @returns {string}
 */
export function shapeOf(pattern) {
  return normalisePath(pattern)
    .split('/')
    .map((segment) => (segment.startsWith(':') ? ':' : segment))
    .join('/')
}
