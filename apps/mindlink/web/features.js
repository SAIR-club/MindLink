import { shapeOf } from './router.js'

/**
 * The features whose pages the shell shows.
 *
 * A feature's entry, `web/<feature>/index.js`, calls `register` once; `index.html` loads that entry with one
 * `<script>` line. The shell never imports a feature, so no page can reach another feature's pages through it
 * (MindLink spec, section 2.2, rule 5). See `README.md`.
 */

/**
 * @typedef {import('./client.js').Client} Client
 * @typedef {import('./vocabulary.js').Vocabulary} Vocabulary
 * @typedef {{
 *   readonly document: Document,
 *   readonly api: Client,
 *   readonly params: import('./router.js').Params,
 *   readonly query: URLSearchParams,
 *   readonly vocabulary: () => Promise<Vocabulary>,
 *   readonly navigate: (pattern: string, params?: import('./router.js').Params, query?: Readonly<Record<string, string>>) => void,
 * }} PageContext
 * @typedef {{
 *   readonly path: string,
 *   readonly title: string,
 *   readonly render: (context: PageContext) => Node | Promise<Node>,
 * }} Route
 * @typedef {{ readonly label: string, readonly path: string }} NavItem
 * @typedef {{
 *   readonly id: string,
 *   readonly nav?: readonly NavItem[],
 *   readonly routes: readonly Route[],
 * }} Feature
 * @typedef {{
 *   register(feature: Feature): void,
 *   features(): readonly Feature[],
 *   routes(): readonly Route[],
 *   nav(): readonly NavItem[],
 * }} Registry
 */

/** The route a sign-in page registers. The shell sends a person there when their session has ended. */
export const SIGN_IN_PATH = '/sign-in'

/** @returns {Registry} */
export function createRegistry() {
  /** @type {Feature[]} */
  const features = []
  /** @type {Map<string, string>} */
  const owners = new Map()

  return {
    register(feature) {
      if (!/^[a-z][a-z0-9-]*$/.test(feature.id)) {
        throw new Error(`feature id "${feature.id}" must be lowercase letters, digits and "-"`)
      }
      if (features.some((each) => each.id === feature.id)) {
        throw new Error(`feature "${feature.id}" is registered twice`)
      }
      /** @type {Map<string, string>} */
      const added = new Map()
      for (const route of feature.routes) {
        if (!route.path.startsWith('/')) {
          throw new Error(`route "${route.path}" of "${feature.id}" must start with "/"`)
        }
        const shape = shapeOf(route.path)
        const owner = owners.get(shape) ?? added.get(shape)
        if (owner !== undefined) {
          throw new Error(`route "${route.path}" of "${feature.id}" is already "${owner}"'s`)
        }
        added.set(shape, feature.id)
      }
      for (const [shape, id] of added) owners.set(shape, id)
      features.push(Object.freeze({ ...feature }))
    },
    features: () => [...features],
    routes: () => features.flatMap((feature) => feature.routes),
    nav: () => features.flatMap((feature) => feature.nav ?? []),
  }
}

/** The registry the page uses: every feature entry `index.html` loads registers here. */
export const registry = createRegistry()

/** @param {Feature} feature */
export function register(feature) {
  registry.register(feature)
}
