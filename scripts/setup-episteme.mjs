#!/usr/bin/env node
/**
 * Puts the Episteme commit this repository builds against beside it, built (ADR 0013, step M1).
 *
 *   node scripts/setup-episteme.mjs
 *
 * MindLink resolves `@episteme/*` from `../Episteme`. This clones it there if it is missing, checks out the commit
 * in `episteme.ref`, and installs and builds it. Moving to a newer Episteme is a pull request that changes that one
 * line, so every build is reproducible.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ref = readFileSync(join(root, 'episteme.ref'), 'utf8').trim()
const episteme = resolve(root, '..', 'Episteme')

const run = (command, args, cwd) => execFileSync(command, args, { cwd, stdio: 'inherit' })

if (!existsSync(episteme)) {
  run(
    'git',
    ['clone', '-c', 'core.autocrlf=false', 'https://github.com/SAIR-club/Episteme.git', episteme],
    root,
  )
}
run('git', ['fetch', 'origin'], episteme)
run('git', ['checkout', '--detach', ref], episteme)
run('pnpm', ['install', '--frozen-lockfile'], episteme)
run('pnpm', ['build'], episteme)
process.stdout.write(`Episteme ${ref.slice(0, 7)} is ready at ${episteme}\n`)
