import { createClient } from './client.js'
import { el } from './components/dom.js'
import { emptyState, errorState, loading } from './components/states.js'
import { SIGN_IN_PATH } from './features.js'
import { hrefOf, parseHash, resolveRoute } from './router.js'
import { VOCABULARY_PATH, vocabularyOf } from './vocabulary.js'

/**
 * The shell every page is shown in: the header and navigation, the route in the hash, and what happens when a
 * person's session ends.
 *
 * It takes the document, the window and `fetch` it works with, so it runs the same against a test's fakes.
 */

/**
 * @typedef {{
 *   readonly location: { hash: string, reload(): void },
 *   addEventListener(type: 'hashchange', listener: () => void): void,
 *   removeEventListener(type: 'hashchange', listener: () => void): void,
 * }} ShellWindow
 * @typedef {{ show(): Promise<void>, close(): void }} Shell
 */

/**
 * Builds the layout in `root` and shows the route the hash names, and every route it changes to.
 * @param {{
 *   readonly document: Document,
 *   readonly window: ShellWindow,
 *   readonly fetch: import('./client.js').Fetch,
 *   readonly registry: import('./features.js').Registry,
 *   readonly root: HTMLElement,
 * }} options
 * @returns {Shell}
 */
export function start({ document, window, fetch, registry, root }) {
  const routes = registry.routes()
  const navItems = registry.nav()
  const signIn = routes.some((route) => route.path === SIGN_IN_PATH)

  const notice = el(document, 'div', { class: 'notice', role: 'alert', hidden: true })
  const links = navItems.map((item) => ({
    item,
    link: el(document, 'a', { href: hrefOf(item.path) }, item.label),
  }))
  const main = el(document, 'main', { class: 'page', id: 'page' })
  root.replaceChildren(
    el(
      document,
      'header',
      { class: 'top' },
      el(document, 'a', { class: 'brand', href: '#/' }, 'MindLink'),
      el(
        document,
        'nav',
        { class: 'nav', 'aria-label': '主导航' },
        ...links.map(({ link }) => link),
      ),
    ),
    notice,
    main,
  )

  const api = createClient({ fetch, onUnauthenticated: expired })
  /** Bumped on every navigation, so a slow page that finishes late does not replace the one now shown. */
  let generation = 0

  /** The session has ended: to the sign-in page when there is one, otherwise a notice to reload. */
  function expired() {
    const { path, query } = parseHash(window.location.hash)
    if (signIn && path !== SIGN_IN_PATH) {
      const back = `${path}${query.size === 0 ? '' : `?${query.toString()}`}`
      window.location.hash = hrefOf(SIGN_IN_PATH, {}, { return: back })
      return
    }
    if (!notice.hasAttribute('hidden')) return
    notice.replaceChildren(
      el(document, 'span', {}, '登录已过期。重新载入页面即可继续。'),
      el(
        document,
        'button',
        { type: 'button', onclick: () => window.location.reload() },
        '重新载入',
      ),
    )
    notice.removeAttribute('hidden')
  }

  /** @param {string} path */
  function markNav(path) {
    for (const { item, link } of links) {
      const here = path === item.path || (item.path !== '/' && path.startsWith(`${item.path}/`))
      if (here) link.setAttribute('aria-current', 'page')
      else link.removeAttribute('aria-current')
    }
  }

  async function show() {
    const current = ++generation
    const { path, query } = parseHash(window.location.hash)
    markNav(path)
    const found = resolveRoute(routes, path)
    if (found === undefined) {
      document.title = 'MindLink'
      main.replaceChildren(
        path === '/'
          ? emptyState(
              document,
              navItems.length === 0
                ? '欢迎使用 MindLink。还没有可用的页面。'
                : '欢迎使用 MindLink。',
            )
          : emptyState(document, '找不到这个页面。', el(document, 'a', { href: '#/' }, '回到首页')),
      )
      return
    }
    document.title = `${found.route.title} · MindLink`
    main.replaceChildren(loading(document))
    /** @type {import('./features.js').PageContext} */
    const context = {
      document,
      api,
      params: found.params,
      query,
      // Read when a page asks, so a page always offers what the graph accepts now.
      vocabulary: async () => vocabularyOf(await api.get(VOCABULARY_PATH)),
      navigate: (pattern, params = {}, search = {}) => {
        window.location.hash = hrefOf(pattern, params, search)
      },
    }
    try {
      const node = await found.route.render(context)
      if (current === generation) main.replaceChildren(node)
    } catch (error) {
      if (current === generation)
        main.replaceChildren(errorState(document, error, { retry: () => void show() }))
    }
  }

  const onHashChange = () => void show()
  window.addEventListener('hashchange', onHashChange)
  return {
    show,
    close: () => window.removeEventListener('hashchange', onHashChange),
  }
}
