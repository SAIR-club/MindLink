import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { check, type ArchitectureConfig, type PackageInfo } from './architecture/check.js'

/**
 * MindLink's layering, checked against `architecture.json` (MindLink spec, section 2.2).
 *
 * The first test runs the checker over the repository. The rest give it small made-up repositories that each break
 * one rule, so a rule that silently stopped working would show here.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const files: string[] = []
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await walk(path)))
    else files.push(path)
  }
  return files
}

const toPosix = (path: string): string => path.split(sep).join('/')

/**
 * The files the checker sees: every package's `src/` and `web/`, and the built-in block library, whose directory names
 * are the block ids the engine must not name. The library holds content, not source, so no layering rule reads it.
 */
async function repository(root: string = ROOT): Promise<{
  files: Map<string, string>
  config: ArchitectureConfig
  packages: PackageInfo[]
}> {
  const config = JSON.parse(
    await readFile(join(root, 'architecture.json'), 'utf8'),
  ) as ArchitectureConfig
  const files = new Map<string, string>()
  const packages: PackageInfo[] = []
  for (const group of ['packages', 'apps']) {
    const dirs = await readdir(join(root, group), { withFileTypes: true }).catch(() => [])
    for (const dir of dirs.filter((entry) => entry.isDirectory())) {
      const base = join(root, group, dir.name)
      const manifest = JSON.parse(await readFile(join(base, 'package.json'), 'utf8')) as {
        name: string
        exports?: Record<string, unknown>
      }
      packages.push({
        name: manifest.name,
        dir: `${group}/${dir.name}`,
        exports: Object.keys(manifest.exports ?? { '.': true }),
      })
      for (const file of [...(await walk(join(base, 'src'))), ...(await walk(join(base, 'web')))]) {
        files.set(toPosix(relative(root, file)), await readFile(file, 'utf8'))
      }
    }
  }
  if (config.blocks !== undefined) {
    for (const file of await walk(join(root, config.blocks.library))) {
      files.set(toPosix(relative(root, file)), await readFile(file, 'utf8'))
    }
  }
  return { files, config, packages }
}

describe('the repository', () => {
  it('keeps every layering rule', async () => {
    const { files, config, packages } = await repository()
    expect(files.size).toBeGreaterThan(0)
    expect(check(files, config, packages)).toEqual([])
  })

  it('reads the built-in block library, so the engine naming a block in it is caught', async () => {
    const root = await mkdtemp(join(tmpdir(), 'architecture-'))
    try {
      const write = async (path: string, text: string): Promise<void> => {
        await mkdir(dirname(join(root, path)), { recursive: true })
        await writeFile(join(root, path), text)
      }
      const config: ArchitectureConfig = {
        layers: [{ name: 'L2', modules: ['apps/mindlink/src/blocks'] }],
        episteme: {},
        assembly: 'apps/mindlink/src/app.ts',
        web: 'apps/mindlink/web',
        blocks: { engine: 'apps/mindlink/src/blocks', library: 'apps/mindlink/blocks' },
      }
      await write('architecture.json', JSON.stringify(config))
      await write('apps/mindlink/package.json', JSON.stringify({ name: '@mindlink/app' }))
      await write('apps/mindlink/blocks/guide/BLOCK.md', '---\nid: guide\n---\n')
      await write('apps/mindlink/src/blocks/index.ts', 'export const first = (id: string) => id')
      const clean = await repository(root)
      expect(clean.files.has('apps/mindlink/blocks/guide/BLOCK.md')).toBe(true)
      expect(check(clean.files, clean.config, clean.packages)).toEqual([])

      await write(
        'apps/mindlink/src/blocks/index.ts',
        "export const first = (id: string) => id === 'guide'",
      )
      const named = await repository(root)
      expect(check(named.files, named.config, named.packages)).toEqual([
        {
          rule: 6,
          file: 'apps/mindlink/src/blocks/index.ts',
          message: 'names the built-in block "guide"; the engine knows no specific block',
        },
      ])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

/** A small repository: the platform, two features in different layers, the assembly and a web shell. */
const CONFIG: ArchitectureConfig = {
  layers: [
    { name: 'L0', modules: ['packages/platform'] },
    { name: 'L1', modules: ['apps/mindlink/src/project', 'apps/mindlink/src/account'] },
    { name: 'L2', modules: ['apps/mindlink/src/understanding'] },
    { name: 'L3', modules: ['apps/mindlink/src/app.ts'] },
  ],
  episteme: { 'packages/platform': ['@episteme/application'] },
  assembly: 'apps/mindlink/src/app.ts',
  web: 'apps/mindlink/web',
  blocks: { engine: 'packages/platform/src/engine', library: 'packages/platform/library' },
}
const PACKAGES: PackageInfo[] = [
  { name: '@mindlink/platform', dir: 'packages/platform', exports: ['.', './testing'] },
]

/** The violations `extra` adds to a repository that keeps every rule. */
function violationsOf(extra: Record<string, string>): readonly number[] {
  const files = new Map<string, string>([
    [
      'packages/platform/src/index.ts',
      "import { x } from '@episteme/application'\nexport const y = x",
    ],
    [
      'apps/mindlink/src/project/index.ts',
      "import { portsOf } from '@mindlink/platform'\nexport const project = portsOf",
    ],
    ['apps/mindlink/src/project/logic.ts', 'export const rule = 1'],
    [
      'apps/mindlink/src/project/mcp.ts',
      "import { rule } from './logic.js'\nexport const tools = [rule]",
    ],
    [
      'apps/mindlink/src/understanding/index.ts',
      "import { project } from '../project/index.js'\nexport const view = project",
    ],
    [
      'apps/mindlink/src/app.ts',
      "import { tools } from './project/mcp.js'\nimport { view } from './understanding/index.js'\nexport const all = [tools, view]",
    ],
    ['apps/mindlink/web/router.js', 'export const route = 1'],
    [
      'apps/mindlink/web/project/list.js',
      "import { route } from '../router.js'\nexport const page = route",
    ],
    ...Object.entries(extra),
  ])
  return check(files, CONFIG, PACKAGES).map((violation) => violation.rule)
}

describe('each rule catches its violation', () => {
  it('the made-up repository keeps every rule', () => {
    expect(violationsOf({})).toEqual([])
  })

  it('1: a source file outside every module', () => {
    expect(violationsOf({ 'apps/mindlink/src/stray/index.ts': 'export const stray = 1' })).toEqual([
      1,
    ])
  })

  it('2: an import from a higher layer', () => {
    expect(
      violationsOf({
        'apps/mindlink/src/project/up.ts':
          "import { view } from '../understanding/index.js'\nexport const up = view",
      }),
    ).toEqual([2])
  })

  it('2: an import between modules in the same layer', () => {
    expect(
      violationsOf({
        'apps/mindlink/src/account/index.ts':
          "import { project } from '../project/index.js'\nexport const a = project",
      }),
    ).toEqual([2])
  })

  it('3: an import past a feature’s index', () => {
    expect(
      violationsOf({
        'apps/mindlink/src/understanding/deep.ts':
          "import { rule } from '../project/logic.js'\nexport const d = rule",
      }),
    ).toEqual([3])
  })

  it('3: the testing entry imported from source', () => {
    expect(
      violationsOf({
        'apps/mindlink/src/project/fake.ts':
          "import { memoryPorts } from '@mindlink/platform/testing'\nexport const f = memoryPorts",
      }),
    ).toEqual([3])
  })

  it('3: a package reached by a relative path', () => {
    expect(
      violationsOf({
        'apps/mindlink/src/project/rel.ts':
          "import { y } from '../../../../packages/platform/src/index.js'\nexport const r = y",
      }),
    ).toEqual([3])
  })

  it('4: a feature’s tools imported anywhere but the assembly', () => {
    expect(
      violationsOf({
        'apps/mindlink/src/understanding/wire.ts':
          "import { tools } from '../project/mcp.js'\nexport const w = tools",
      }),
    ).toEqual([4])
  })

  it('5: a page importing another feature’s pages', () => {
    expect(
      violationsOf({
        'apps/mindlink/web/understanding/view.js':
          "import { page } from '../project/list.js'\nexport const v = page",
      }),
    ).toEqual([5])
  })

  it('6: Episteme imported outside the platform', () => {
    expect(
      violationsOf({
        'apps/mindlink/src/project/direct.ts':
          "import { startService } from '@episteme/service'\nexport const s = startService",
      }),
    ).toEqual([6])
  })

  it('6: a page writing HTML', () => {
    expect(
      violationsOf({
        'apps/mindlink/web/project/bad.js':
          'export function show(el, text) { el.innerHTML = text }',
      }),
    ).toEqual([6])
  })

  it('6: the block engine naming a built-in block', () => {
    expect(
      violationsOf({
        'packages/platform/library/guide/BLOCK.md': '# guide',
        'packages/platform/src/engine/next.ts':
          "export const first = (id: string) => id === 'guide'",
      }),
    ).toEqual([6])
  })

  it('ignores imports that are only mentioned in comments', () => {
    expect(
      violationsOf({
        'apps/mindlink/src/project/doc.ts':
          "// import { x } from '@episteme/service'\n/* import '../understanding/index.js' */\nexport const d = 1",
      }),
    ).toEqual([])
  })
})
