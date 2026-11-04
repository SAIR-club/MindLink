import { onScopeDispose } from 'vue'

/**
 * Reads again every `interval` milliseconds while the page is visible and `paused()` says no, such as while a
 * person is editing a suggestion, so a refresh never throws their edit away. Coming back to the tab reads at once.
 * Call it from a component's `setup`; it stops when the component goes away.
 */
export function usePolling(
  refresh: () => Promise<unknown>,
  {
    interval = 5000,
    paused = () => false,
    document = globalThis.document,
  }: {
    readonly interval?: number
    readonly paused?: () => boolean
    readonly document?: Pick<
      Document,
      'visibilityState' | 'addEventListener' | 'removeEventListener'
    >
  } = {},
): void {
  let running = false

  async function tick(): Promise<void> {
    if (running || paused() || (document !== undefined && document.visibilityState !== 'visible')) {
      return
    }
    running = true
    try {
      await refresh()
    } catch {
      // A failed refresh keeps what is shown; the next one tries again.
    } finally {
      running = false
    }
  }

  const timer = setInterval(() => void tick(), interval)
  const onVisible = (): void => {
    if (document?.visibilityState === 'visible') void tick()
  }
  document?.addEventListener('visibilitychange', onVisible)
  onScopeDispose(() => {
    clearInterval(timer)
    document?.removeEventListener('visibilitychange', onVisible)
  })
}
