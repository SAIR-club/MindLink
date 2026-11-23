import { exec } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

/**
 * Builds the workbench page into a temporary folder of its own. Each browser test serves its own copy, so one
 * file's build cannot empty the page another file is still loading while it runs in parallel.
 */
export async function builtWorkbenchPage(): Promise<string> {
  const built = await mkdtemp(join(tmpdir(), 'episteme-web-build-'))
  await promisify(exec)(
    `pnpm --filter @mindlink/workbench-web exec vite build --outDir "${built}" --emptyOutDir`,
  )
  return built
}
