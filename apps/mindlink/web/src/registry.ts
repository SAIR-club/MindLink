import type { RouteComponent } from 'vue-router'
import { shapeOf } from './paths.js'

/**
 * The features whose pages the shell shows.
 *
 * A feature's entry, `src/features/<feature>/index.ts`, calls `register` once; `src/features/index.ts` imports that
 * entry with one line. The shell never imports a feature's pages itself, and a feature imports only its own files
 * and the shell, so no page can reach another feature's pages (MindLink spec, section 2.2, rule 5). See `README.md`.
 */

/** A page: a Vue component, or a function that loads one, so a feature's pages load only when first shown. */
export type PageComponent =
  | RouteComponent
  | (() => Promise<RouteComponent | { readonly default: RouteComponent }>)

export interface Route {
  /** A Vue Router path, such as `/projects/:id`. The page reads `:id` from `useRoute().params`. */
  readonly path: string
  /** The page's name, shown in the browser's title bar. */
  readonly title: string
  readonly component: PageComponent
}

export interface NavItem {
  readonly label: string
  readonly path: string
}

export interface Feature {
  readonly id: string
  readonly nav?: readonly NavItem[]
  readonly routes: readonly Route[]
}

export interface Registry {
  register(feature: Feature): void
  features(): readonly Feature[]
  routes(): readonly Route[]
  nav(): readonly NavItem[]
}

/** The route a sign-in page registers. The shell sends a person there when their session has ended. */
export const SIGN_IN_PATH = '/sign-in'

export function createRegistry(): Registry {
  const features: Feature[] = []
  const owners = new Map<string, string>()

  return {
    register(feature) {
      if (!/^[a-z][a-z0-9-]*$/.test(feature.id)) {
        throw new Error(`feature id "${feature.id}" must be lowercase letters, digits and "-"`)
      }
      if (features.some((each) => each.id === feature.id)) {
        throw new Error(`feature "${feature.id}" is registered twice`)
      }
      const added = new Map<string, string>()
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

/** The registry the page uses: every feature `src/features/index.ts` imports registers here. */
export const registry = createRegistry()

export function register(feature: Feature): void {
  registry.register(feature)
}
