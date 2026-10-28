import { ref, type Ref } from 'vue'
import { SIGN_IN_PATH } from './registry.js'

/**
 * What happens when a person's session ends (a request answered 401).
 *
 * With a sign-in page registered (MindLink#24), the person goes there, and back to where they were once signed
 * in. Without one, the shell shows a notice under the header with a button to reload: in local mode a reloaded
 * page carries a new session.
 */

export interface Session {
  /** Whether the notice that the session ended is shown. */
  readonly expired: Ref<boolean>
  /** Reloads the page, which in local mode brings a new session. */
  readonly reload: () => void
}

export function createSession(reload: () => void): Session {
  return { expired: ref(false), reload }
}

/** Where to send a person whose session ended at `fullPath`, or `undefined` to show the notice instead. */
export function signInTarget(
  hasSignIn: boolean,
  path: string,
  fullPath: string,
): { readonly path: string; readonly query: { readonly return: string } } | undefined {
  if (!hasSignIn || path === SIGN_IN_PATH) return undefined
  return { path: SIGN_IN_PATH, query: { return: fullPath } }
}
