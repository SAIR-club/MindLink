import { inject, type App, type InjectionKey } from 'vue'
import type { Client } from './client.js'
import type { ConfirmSpec, Confirmer } from './confirm.js'
import type { Session } from './session.js'
import type { Vocabulary } from './vocabulary.js'

/**
 * What the shell gives every page: the request client, the vocabulary, and the confirm dialog. A page reaches
 * them with `useApi()`, `useVocabulary()` and `useConfirm()` in its `setup`.
 */

export interface Services {
  readonly api: Client
  /** Reads the vocabulary when a page asks, so a page always offers what the graph accepts now. */
  readonly vocabulary: () => Promise<Vocabulary>
  readonly confirmer: Confirmer
  readonly session: Session
}

const SERVICES: InjectionKey<Services> = Symbol('mindlink services')

export function provideServices(app: App, services: Services): void {
  app.provide(SERVICES, services)
}

export function useServices(): Services {
  const services = inject(SERVICES)
  if (services === undefined) throw new Error('the MindLink shell provides no services here')
  return services
}

/** The request client: `api.get(path)`, `api.post(path, body)`. */
export function useApi(): Client {
  return useServices().api
}

/** A function that reads the current vocabulary. */
export function useVocabulary(): () => Promise<Vocabulary> {
  return useServices().vocabulary
}

/** Asks a person to confirm: `if (await confirm({ message: '撤回这条发布？', danger: true })) …`. */
export function useConfirm(): (spec: ConfirmSpec) => Promise<boolean> {
  const { confirmer } = useServices()
  return (spec) => confirmer.ask(spec)
}
