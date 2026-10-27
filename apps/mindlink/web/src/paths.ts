/**
 * Route paths, as pure functions of strings.
 *
 * The service serves the front end as static files and answers any other path with 404, so Vue Router keeps the
 * route in the hash (`#/projects/p1?tab=settings`) and every page is `index.html`. The paths below are the part
 * after `#`.
 */

export type Params = Readonly<Record<string, string>>

/** A path with one leading `/`, no empty segments and no trailing `/`, so `''`, `//a/` and `/a` are the same route. */
export function normalisePath(path: string): string {
  const segments = path.split('/').filter((segment) => segment !== '')
  return `/${segments.join('/')}`
}

/**
 * The path for a route, its parameters filled in and encoded: `pathOf('/projects/:id', { id: 'a b' })` is
 * `/projects/a%20b`. Give it to `router.push` or a `RouterLink`'s `to`.
 */
export function pathOf(
  pattern: string,
  params: Params = {},
  query: Readonly<Record<string, string>> | URLSearchParams = {},
): string {
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
  return `${path}${search === '' ? '' : `?${search}`}`
}

/** The same pattern with every parameter name erased, so `/a/:id` and `/a/:key` are seen as one route. */
export function shapeOf(pattern: string): string {
  return normalisePath(pattern)
    .split('/')
    .map((segment) => (segment.startsWith(':') ? ':' : segment))
    .join('/')
}

/** Whether a navigation entry for `entry` is where a person is at `path`: the entry itself or a page under it. */
export function isCurrent(entry: string, path: string): boolean {
  const here = normalisePath(path)
  const item = normalisePath(entry)
  return here === item || (item !== '/' && here.startsWith(`${item}/`))
}

/** The document title for a page. */
export function titleOf(title: string | undefined): string {
  return title === undefined || title === '' ? 'MindLink' : `${title} · MindLink`
}
