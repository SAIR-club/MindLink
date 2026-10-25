import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

/**
 * The front end is plain JavaScript with JSDoc types, checked strictly against the browser's DOM by
 * `apps/mindlink/web/tsconfig.json`. It has no build, so `tsc -b` does not reach it; this test does.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const TSC = createRequire(join(ROOT, 'package.json')).resolve('typescript/bin/tsc')

describe('the front end', () => {
  it('type-checks against the DOM', async () => {
    const run = promisify(execFile)
    const result = await run(process.execPath, [TSC, '-p', join(ROOT, 'apps', 'mindlink', 'web')], {
      cwd: ROOT,
    }).catch((error: Error & { stdout?: string }) => ({ stdout: error.stdout ?? error.message }))
    expect(result.stdout).toBe('')
  }, 60_000)
})
