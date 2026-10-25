import { registry } from './features.js'
import { start } from './shell.js'

/**
 * Starts the front end once every feature entry `index.html` loads has registered. Module scripts all run before
 * `DOMContentLoaded`, whatever their order in the page.
 */

const { document } = globalThis

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('app')
  if (root === null) throw new Error('index.html has no #app')
  const shell = start({
    document,
    window: globalThis.window,
    fetch: (input, init) => globalThis.fetch(input, init),
    registry,
    root,
  })
  void shell.show()
})
