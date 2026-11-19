#!/usr/bin/env node
/**
 * Puts what the desktop program carries into `src-tauri/resources`:
 *
 * - `app/`: the workbench as `pnpm deploy` lays it out, production dependencies only, with its built page;
 * - `node/`: the Node runtime this script runs on, so the installed program needs no Node of its own.
 *
 * MindLink reaches the Episteme kernel through `link:` overrides to the `../Episteme` checkout named by
 * `episteme.ref`, which a deploy leaves as links to that checkout. So the kernel is deployed from its own workspace
 * and copied in over those links: the program carries the kernel it was built and tested against, and nothing points
 * outside it.
 *
 * The SQLite driver ships Node-API builds, which work on every Node from 22 on, so the runtime copied here does not
 * have to match the one the dependencies were installed with. Only the current platform's build is kept.
 */
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..', '..')
const kernel = join(root, '..', 'Episteme')
const resources = join(here, '..', 'src-tauri', 'resources')
const app = join(resources, 'app')
const runtime = join(resources, 'node')
const windows = process.platform === 'win32'

function run(command, args, cwd = root) {
  process.stdout.write(`> ${command} ${args.join(' ')}\n`)
  execFileSync(command, args, { cwd, stdio: 'inherit', shell: windows })
}

/**
 * `deploy` records its own settings (hoisted, production only) in the workspace's install state, after which the
 * next `pnpm` command in that repository wants to remove node_modules. Puts the state back as it was.
 */
function deploy(workspace, name, into) {
  const state = join(workspace, 'node_modules', '.pnpm-workspace-state-v1.json')
  const saved = existsSync(state) ? readFileSync(state) : undefined
  try {
    run(
      'pnpm',
      [
        '--filter',
        name,
        'deploy',
        '--prod',
        '--legacy',
        '--ignore-scripts',
        '--config.node-linker=hoisted',
        into,
      ],
      workspace,
    )
  } finally {
    if (saved !== undefined) writeFileSync(state, saved)
  }
}

if (Number.parseInt(process.versions.node, 10) < 22) {
  throw new Error(
    `the program needs Node 22 or later to carry; this is Node ${process.versions.node}`,
  )
}
const pinned = readFileSync(join(root, 'episteme.ref'), 'utf8').trim()
const checkedOut = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: kernel,
  encoding: 'utf8',
}).trim()
if (checkedOut !== pinned) {
  throw new Error(
    `../Episteme is at ${checkedOut}, but episteme.ref pins ${pinned}; run node scripts/setup-episteme.mjs`,
  )
}

rmSync(resources, { recursive: true, force: true })
mkdirSync(runtime, { recursive: true })

run('pnpm', ['workbench:build'])
deploy(root, '@mindlink/workbench', app)

// The kernel, from its own workspace, over the links the deploy left.
const kernelDeploy = mkdtempSync(join(tmpdir(), 'mindlink-kernel-'))
try {
  deploy(kernel, '@episteme/service', kernelDeploy)
  const scope = join(app, 'node_modules', '@episteme')
  for (const entry of existsSync(scope) ? readdirSync(scope) : []) {
    const path = join(scope, entry)
    // A link is removed as a link: never what it points to.
    if (lstatSync(path).isSymbolicLink()) rmSync(path)
  }
  const modules = join(kernelDeploy, 'node_modules')
  for (const entry of readdirSync(modules)) {
    if (entry === '.bin' || entry === '.modules.yaml') continue
    cpSync(join(modules, entry), join(app, 'node_modules', entry), {
      recursive: true,
      force: false,
      errorOnExist: false,
    })
  }
  const service = join(scope, 'service')
  mkdirSync(service, { recursive: true })
  for (const entry of ['package.json', 'dist']) {
    cpSync(join(kernelDeploy, entry), join(service, entry), { recursive: true })
  }
} finally {
  rmSync(kernelDeploy, { recursive: true, force: true })
}
for (const entry of readdirSync(join(app, 'node_modules', '@episteme'))) {
  const path = join(app, 'node_modules', '@episteme', entry)
  if (lstatSync(path).isSymbolicLink()) throw new Error(`@episteme/${entry} is still a link`)
}

// `deploy` copies the package as it is in the repository; the page is a build output, so copy it explicitly.
const page = join(root, 'apps', 'workbench', 'web', 'dist')
rmSync(join(app, 'web'), { recursive: true, force: true })
cpSync(page, join(app, 'web', 'dist'), { recursive: true })

/** Removes what the running program never reads: sources, type declarations, maps, other platforms' drivers. */
function prune(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    if (lstatSync(path).isDirectory()) {
      prune(path)
    } else if (/\.(map|d\.ts|d\.mts|d\.cts|tsbuildinfo)$/.test(entry)) {
      rmSync(path)
    }
  }
}
for (const entry of ['src', 'tsconfig.json', 'tsconfig.tsbuildinfo']) {
  rmSync(join(app, entry), { recursive: true, force: true })
}
prune(app)

const sqlite = join(app, 'node_modules', 'better-sqlite3')
const keep = `${process.platform}-${process.arch}.node`
for (const entry of readdirSync(join(sqlite, 'prebuilds'))) {
  if (entry !== keep) rmSync(join(sqlite, 'prebuilds', entry))
}
if (!existsSync(join(sqlite, 'prebuilds', keep))) {
  throw new Error(`the SQLite driver has no build for ${keep}`)
}
for (const entry of ['deps', 'src', 'binding.gyp']) {
  rmSync(join(sqlite, entry), { recursive: true, force: true })
}

const node = join(runtime, windows ? 'node.exe' : 'node')
copyFileSync(process.execPath, node)
const license = join(dirname(process.execPath), 'LICENSE')
if (existsSync(license)) {
  copyFileSync(license, join(runtime, 'LICENSE'))
} else {
  const response = await fetch(
    `https://raw.githubusercontent.com/nodejs/node/v${process.versions.node}/LICENSE`,
  )
  if (!response.ok) throw new Error(`could not fetch Node's licence: ${response.status}`)
  await writeFile(join(runtime, 'LICENSE'), await response.text())
}

let bytes = 0
let files = 0
;(function count(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) count(path)
    else {
      bytes += stat.size
      files += 1
    }
  }
})(resources)
process.stdout.write(
  `\nBundled Node ${process.versions.node}, the workbench and Episteme ${pinned.slice(0, 7)} into ` +
    `${relative(root, resources)}: ${files} files, ${(bytes / 1024 / 1024).toFixed(1)} MB.\n`,
)
