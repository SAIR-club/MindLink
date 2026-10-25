/** Where a feature reads the time, so a test can fix it. */
export interface Clock {
  now(): number
}

export const systemClock: Clock = Object.freeze({ now: Date.now })
