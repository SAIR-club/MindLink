#!/usr/bin/env node
import { relative, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { learnStateDimensions } from '@episteme/domain-learn'
import { loadBlockDirectory } from './load.js'
import { checkBlocks } from './registry.js'
import { blockToolNames } from './tools.js'
import type { BlockIssue } from './types.js'

/**
 * `pnpm modules:check`: checks every built-in block in `apps/mindlink/blocks/`.
 *
 * Prints each issue with the block's real path and line, and exits 1 if there is any.
 */

export const LIBRARY = fileURLToPath(new URL('../../blocks/', import.meta.url))

export interface LibraryCheck {
  readonly blocks: number
  readonly issues: readonly BlockIssue[]
}

export async function checkLibrary(dir: string = LIBRARY): Promise<LibraryCheck> {
  const inputs = await loadBlockDirectory(dir, 'builtin')
  const { issues } = checkBlocks(inputs, {
    dimensions: learnStateDimensions.map((dimension) => dimension.id),
    tools: blockToolNames,
  })
  return { blocks: inputs.length, issues }
}

/** An issue as a line an editor can jump to: `path:line:column code message`. */
export function formatIssue(issue: BlockIssue, dir: string = LIBRARY): string {
  const path = relative(process.cwd(), `${dir}${issue.file.replace(/^builtin:/, '')}`)
    .split(sep)
    .join('/')
  const at =
    issue.line === undefined
      ? ''
      : `:${issue.line}${issue.column === undefined ? '' : `:${issue.column}`}`
  return `${path}${at} ${issue.code} ${issue.message}`
}

async function main(): Promise<void> {
  const { blocks, issues } = await checkLibrary()
  for (const issue of issues) process.stderr.write(`${formatIssue(issue)}\n`)
  if (issues.length > 0) {
    process.stderr.write(`${issues.length} 个问题，${blocks} 块内置积木\n`)
    process.exitCode = 1
  } else {
    process.stdout.write(`${blocks} 块内置积木全部通过校验\n`)
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
