import { createApp, type App as VueApp } from 'vue'
import {
  createRouter,
  createWebHashHistory,
  type RouteRecordRaw,
  type Router,
  type RouterHistory,
} from 'vue-router'
import App from './App.vue'
import { createClient, type Fetch } from './client.js'
import { createConfirmer } from './confirm.js'
import HomePage from './pages/HomePage.vue'
import NotFoundPage from './pages/NotFoundPage.vue'
import { normalisePath, titleOf } from './paths.js'
import { SIGN_IN_PATH, type Registry } from './registry.js'
import { provideServices, type Services } from './services.js'
import { createSession, signInTarget } from './session.js'
import { VOCABULARY_PATH, vocabularyOf } from './vocabulary.js'

/**
 * Builds the front end: the shell, one route per registered page, and the services every page uses.
 *
 * It takes `fetch`, the router's history and how to reload, so a test runs the same shell against fakes.
 */

declare module 'vue-router' {
  interface RouteMeta {
    /** The page's name, for the browser's title bar. */
    title?: string
  }
}

export interface MindLinkOptions {
  readonly registry: Registry
  readonly fetch: Fetch
  /** Where the route lives: the hash in the browser (the default), memory in a test. */
  readonly history?: RouterHistory
  readonly reload?: () => void
}

export interface MindLink {
  readonly app: VueApp
  readonly router: Router
  readonly services: Services
}

/** Every registered page, the welcome page at `/` unless a feature has one, and a page for any other path. */
export function routesOf(registry: Registry): RouteRecordRaw[] {
  const records: RouteRecordRaw[] = registry.routes().map((route) => ({
    path: route.path,
    component: route.component,
    meta: { title: route.title },
  }))
  if (!registry.routes().some((route) => normalisePath(route.path) === '/')) {
    records.push({
      path: '/',
      component: HomePage,
      props: { pages: registry.nav().length > 0 },
    })
  }
  records.push({ path: '/:missing(.*)*', component: NotFoundPage })
  return records
}

export function createMindLink({
  registry,
  fetch,
  history = createWebHashHistory(),
  reload = () => globalThis.location.reload(),
}: MindLinkOptions): MindLink {
  const router = createRouter({ history, routes: routesOf(registry) })
  const hasSignIn = registry.routes().some((route) => normalisePath(route.path) === SIGN_IN_PATH)
  const session = createSession(reload)

  const api = createClient({
    fetch,
    onUnauthenticated: () => {
      const { path, fullPath } = router.currentRoute.value
      const target = signInTarget(hasSignIn, path, fullPath)
      if (target === undefined) session.expired.value = true
      else void router.push(target)
    },
  })
  const services: Services = {
    api,
    vocabulary: async () => vocabularyOf(await api.get(VOCABULARY_PATH)),
    confirmer: createConfirmer(),
    session,
  }

  router.afterEach((to) => {
    globalThis.document.title = titleOf(to.meta.title)
  })

  const app = createApp(App, { nav: registry.nav() })
  provideServices(app, services)
  app.use(router)
  return { app, router, services }
}
