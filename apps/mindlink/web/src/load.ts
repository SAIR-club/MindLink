import { onScopeDispose, shallowRef, watch, type ShallowRef, type WatchSource } from 'vue'

/**
 * What a page shows while it reads from the service: loading, then the answer or the failure.
 *
 * Each load is numbered, so an answer that arrives after a newer load started (the person moved to another
 * project, or pressed retry) is dropped instead of replacing what is now shown.
 */

export type LoadState<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly data: T }
  | { readonly status: 'error'; readonly error: unknown }

export interface Load<T> {
  readonly state: Readonly<ShallowRef<LoadState<T>>>
  /** Loads again, such as on the retry button. */
  reload(): Promise<void>
}

/**
 * Starts `load` now, and again whenever one of `sources` changes, such as the route's parameters. Call it from a
 * component's `setup` (or inside an `effectScope`), which stops it when the component goes away.
 */
export function useLoad<T>(load: () => Promise<T>, sources: readonly WatchSource[] = []): Load<T> {
  const state = shallowRef<LoadState<T>>({ status: 'loading' })
  let generation = 0
  let live = true

  async function reload(): Promise<void> {
    const current = ++generation
    state.value = { status: 'loading' }
    try {
      const data = await load()
      if (live && current === generation) state.value = { status: 'ready', data }
    } catch (error) {
      if (live && current === generation) state.value = { status: 'error', error }
    }
  }

  if (sources.length > 0) watch([...sources], () => void reload())
  onScopeDispose(() => {
    live = false
  }, true)
  void reload()
  return { state, reload }
}
