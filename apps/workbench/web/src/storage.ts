/** What the browser kept under `key`, or nothing when storage is unavailable. */
export function kept(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function keep(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Only a convenience: the default comes back next time.
  }
}
