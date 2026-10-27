import vue from '@vitejs/plugin-vue'
import { defineConfig, type Plugin, type ProxyOptions } from 'vite'

/**
 * Builds the front end into `dist/`, which `mindlink serve` serves at `/`.
 *
 * `vite web` (`pnpm --filter @mindlink/app dev:web`) is the development server: it proxies `/api` and `/mcp` to a
 * running `mindlink serve`, at `MINDLINK_URL` (default `http://127.0.0.1:4321`).
 */

const target = new URL(process.env['MINDLINK_URL'] ?? 'http://127.0.0.1:4321').origin

/**
 * A local `mindlink serve` hands the person's session cookie out with the page. In development the page comes from
 * Vite, so the cookie is fetched from the service's own page and passed on.
 */
function localSession(): Plugin {
  return {
    name: 'mindlink-local-session',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = (request.url ?? '').split('?')[0]
        if (path !== '/' && path !== '/index.html') {
          next()
          return
        }
        fetch(`${target}/`)
          .then((answer) => {
            const cookies = answer.headers.getSetCookie()
            if (cookies.length > 0) response.setHeader('set-cookie', cookies)
          })
          .catch(() => {
            server.config.logger.warn(`mindlink serve is not answering at ${target}`)
          })
          .finally(() => next())
      })
    },
  }
}

/** The service accepts a browser's request only from its own origin, so the proxy speaks as that origin. */
const proxy: ProxyOptions = {
  target,
  changeOrigin: true,
  configure: (server) => {
    server.on('proxyReq', (request) => {
      if (request.getHeader('origin') !== undefined) request.setHeader('origin', target)
    })
  },
}

export default defineConfig({
  base: './',
  plugins: [vue(), localSession()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: { proxy: { '/api': proxy, '/mcp': proxy } },
})
