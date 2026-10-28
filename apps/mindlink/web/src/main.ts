import { createMindLink } from './app.js'
import './features/index.js'
import { registry } from './registry.js'
import './style.css'

/** Starts the front end once every feature `features/index.ts` imports has registered. */

const { app } = createMindLink({
  registry,
  fetch: (input, init) => globalThis.fetch(input, init),
})
app.mount('#app')
