import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { BlockInput, BlockSource } from './types.js'

/**
 * Reads a directory of blocks, one subdirectory per block, into inputs for `checkBlocks`.
 *
 * Every file is read as bytes and nothing else is done with it, so the parser sees exactly what is on disk, files it
 * does not allow included. Files directly in `dir` belong to no block and are skipped.
 */
export async function loadBlockDirectory(dir: string, source: BlockSource): Promise<BlockInput[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return []
      throw error
    },
  )
  const inputs: BlockInput[] = []
  for (const entry of entries
    .filter((candidate) => candidate.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const files = new Map<string, Uint8Array>()
    await collect(join(dir, entry.name), '', files)
    inputs.push({ source, id: entry.name, files })
  }
  return inputs
}

async function collect(dir: string, prefix: string, files: Map<string, Uint8Array>): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = prefix + entry.name
    if (entry.isDirectory()) await collect(join(dir, entry.name), `${path}/`, files)
    else if (entry.isFile()) files.set(path, await readFile(join(dir, entry.name)))
    else files.set(path, new Uint8Array())
  }
}
