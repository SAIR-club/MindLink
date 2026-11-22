import { chromium, type Browser } from 'playwright-core'

/**
 * An installed Edge or Chrome, so the journeys need no browser download. Local runs without one skip; a CI run
 * without one fails, because a missing browser must not read as a passing journey.
 */
export async function installedBrowser(journey: string): Promise<Browser | undefined> {
  for (const channel of ['msedge', 'chrome']) {
    try {
      return await chromium.launch({ channel })
    } catch {
      continue
    }
  }
  if (process.env['CI'] !== undefined) {
    throw new Error(`CI needs Edge or Chrome for ${journey}`)
  }
  return undefined
}
