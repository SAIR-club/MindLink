import { SessionRefusal, isRefusal } from '@episteme/application'

/**
 * Refuses a request: the caller asked for something that cannot be done, and nothing changed.
 *
 * A refusal reaches an agent as a tool error with its code and a person as a 422, like Episteme's own. A failure,
 * such as a bug, is thrown as a plain error instead, so it is never mistaken for "nothing happened".
 */
export function refuse(code: string, message: string): never {
  throw new SessionRefusal(code, message)
}

export { isRefusal }
