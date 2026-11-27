import { createMindLink } from './app.js'
import './features/index.js'
import { registry } from './registry.js'
import '@mindlink/ui/tokens.css'
import './style.css'
import '@mindlink/ui/primitives.css'

/** Starts the front end once every feature `features/index.ts` imports has registered. */

const { app } = createMindLink({
  registry,
  fetch: (input, init) => globalThis.fetch(input, init),
})
app.mount('#app')
