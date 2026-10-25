import { posix } from 'node:path'

/**
 * Checks MindLink's layering against `architecture.json`.
 *
 * A pure function over a map of repository-relative paths to file contents, so every rule can be shown to fail on a
 * deliberate violation without touching the real code. The rules (MindLink spec, section 2.2):
 *
 * 1. Every source file belongs to a module in the layer table.
 * 2. A module imports only modules in lower layers; modules in one layer do not import each other.
 * 3. A module is imported only through its public entry: a package by its name or a declared export, never its
 *    testing entry from source; an app feature by its `index`.
 * 4. A feature's MCP tools and REST routes (`mcp.ts`, `routes.ts`) are imported only by the assembly.
 * 5. A page under `web/<feature>/` imports only its own feature's pages and the shared shell.
 * 6. Only the modules listed under `episteme` import `@episteme/*`, and only the packages listed for them; the
 *    block engine names no built-in block; pages never write HTML (`innerHTML` and its relatives).
 */

export interface ArchitectureConfig {
  readonly layers: readonly { readonly name: string; readonly modules: readonly string[] }[]
  readonly episteme: Readonly<Record<string, readonly string[] | string>>
  readonly assembly: string
  readonly web: string
  /** Once the block engine exists: its module, and the directory of built-in blocks it must not name. */
  readonly blocks?: { readonly engine: string; readonly library: string }
}

/** A workspace package: its name, its directory, and the subpaths it exports (`.` included). */
export interface PackageInfo {
  readonly name: string
  readonly dir: string
  readonly exports: readonly string[]
}

export interface Violation {
  readonly rule: number
  readonly file: string
  readonly message: string
}

const SOURCE = /\.(ts|js|mjs)$/
const HTML_WRITERS = /\b(innerHTML|outerHTML|insertAdjacentHTML)\b/

/** Removes comments, so a path in prose is not mistaken for an import. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const IMPORT_PATTERN =
  /\b(?:(?:import|export)\s[^'"`;]*?\sfrom|import)\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g

/** Every module specifier the file imports or re-exports, static or dynamic. */
export function importsOf(text: string): readonly string[] {
  const code = stripComments(text)
  const found: string[] = []
  for (const match of code.matchAll(IMPORT_PATTERN)) {
    const specifier = match[1] ?? match[2]
    if (specifier !== undefined) found.push(specifier)
  }
  return found
}

interface ModuleEntry {
  readonly path: string
  readonly layer: number
}

function modulesOf(config: ArchitectureConfig): readonly ModuleEntry[] {
  return config.layers.flatMap((layer, index) =>
    layer.modules.map((path) => ({ path, layer: index })),
  )
}

/** The module a file belongs to: the longest listed path that is the file or a directory containing it. */
function moduleOf(file: string, modules: readonly ModuleEntry[]): ModuleEntry | undefined {
  return modules
    .filter((entry) => file === entry.path || file.startsWith(`${entry.path}/`))
    .sort((left, right) => right.path.length - left.path.length)[0]
}

/** The source file a relative specifier points at, as a repository-relative path. */
function resolveRelative(from: string, specifier: string, files: ReadonlySet<string>): string {
  const target = posix.normalize(posix.join(posix.dirname(from), specifier))
  const candidates = [target, target.replace(/\.js$/, '.ts'), `${target}.ts`, `${target}/index.ts`]
  return candidates.find((candidate) => files.has(candidate)) ?? target
}

/** Whether a file is a feature's public entry: its `index`, directly under the module directory. */
function isPublicEntry(file: string, module: string): boolean {
  return file === module || /^index\.(ts|js)$/.test(file.slice(module.length + 1))
}

function isSourceFile(file: string, config: ArchitectureConfig): boolean {
  if (!SOURCE.test(file)) return false
  if (file.startsWith(`${config.web}/`)) return true
  return /^(packages|apps)\/[^/]+\/src\//.test(file)
}

export function check(
  files: ReadonlyMap<string, string>,
  config: ArchitectureConfig,
  packages: readonly PackageInfo[],
): readonly Violation[] {
  const violations: Violation[] = []
  const modules = modulesOf(config)
  const paths = new Set(files.keys())
  const report = (rule: number, file: string, message: string): void => {
    violations.push({ rule, file, message })
  }
  const moduleOfPackage = (pkg: PackageInfo): ModuleEntry | undefined =>
    modules.find((entry) => entry.path === pkg.dir)

  for (const [file, text] of files) {
    if (!isSourceFile(file, config)) continue
    const isWeb = file.startsWith(`${config.web}/`)

    if (isWeb) {
      if (HTML_WRITERS.test(stripComments(text))) {
        report(6, file, 'writes HTML; build the DOM with textContent')
      }
      const own = file.slice(config.web.length + 1).split('/')
      const feature = own.length > 1 ? own[0] : undefined
      for (const specifier of importsOf(text)) {
        if (!specifier.startsWith('.')) continue
        const target = resolveRelative(file, specifier, paths)
        const rest = target.startsWith(`${config.web}/`)
          ? target.slice(config.web.length + 1).split('/')
          : []
        const targetFeature = rest.length > 1 && rest[0] !== 'components' ? rest[0] : undefined
        if (targetFeature !== undefined && targetFeature !== feature) {
          report(
            5,
            file,
            `imports the "${targetFeature}" pages (${specifier}); reach them through REST`,
          )
        }
      }
      continue
    }

    const module = moduleOf(file, modules)
    if (module === undefined) {
      report(1, file, 'belongs to no module in architecture.json')
      continue
    }
    const allowedEpisteme = config.episteme[module.path]
    const episteme = Array.isArray(allowedEpisteme) ? allowedEpisteme : []

    for (const specifier of importsOf(text)) {
      if (specifier.startsWith('node:')) continue

      if (specifier.startsWith('@episteme/') && !specifier.startsWith('@episteme/domain-learn')) {
        const name = specifier.split('/').slice(0, 2).join('/')
        if (!episteme.includes(name)) {
          report(6, file, `imports ${specifier}; only @mindlink/platform reaches Episteme`)
        }
        continue
      }

      let target: ModuleEntry | undefined
      let targetFile: string
      if (specifier.startsWith('.')) {
        targetFile = resolveRelative(file, specifier, paths)
        target = moduleOf(targetFile, modules)
        if (target === undefined) {
          report(1, file, `imports ${specifier}, which belongs to no module`)
          continue
        }
        if (target.path === module.path) continue
        if (target.path.startsWith('packages/')) {
          report(
            3,
            file,
            `imports ${specifier}, inside ${target.path}; import the package by its name`,
          )
        } else if (/\/(mcp|routes)\.(ts|js)$/.test(targetFile) && file !== config.assembly) {
          report(4, file, `imports ${specifier}; only ${config.assembly} wires tools and routes`)
        } else if (
          !isPublicEntry(targetFile, target.path) &&
          !/\/(mcp|routes)\.(ts|js)$/.test(targetFile)
        ) {
          report(3, file, `imports ${specifier}, inside ${target.path}; use its index`)
        }
      } else {
        const pkg = packages.find(
          (candidate) => specifier === candidate.name || specifier.startsWith(`${candidate.name}/`),
        )
        if (pkg === undefined) continue
        target = moduleOfPackage(pkg)
        if (target === undefined || target.path === module.path) continue
        const subpath = specifier === pkg.name ? '.' : `.${specifier.slice(pkg.name.length)}`
        if (!pkg.exports.includes(subpath)) {
          report(3, file, `imports ${specifier}, which ${pkg.name} does not export`)
        } else if (subpath === './testing') {
          report(3, file, `imports ${specifier}; the testing entry is for tests only`)
        }
      }

      if (target.layer > module.layer) {
        report(2, file, `imports ${target.path}, in a higher layer`)
      } else if (target.layer === module.layer) {
        report(2, file, `imports ${target.path}, in the same layer`)
      }
    }
  }

  if (config.blocks !== undefined) {
    const { engine, library } = config.blocks
    const ids = new Set(
      [...files.keys()]
        .filter((file) => file.startsWith(`${library}/`))
        .map((file) => file.slice(library.length + 1).split('/')[0])
        .filter((id): id is string => id !== undefined && id !== ''),
    )
    for (const [file, text] of files) {
      if (!file.startsWith(`${engine}/`) || !SOURCE.test(file)) continue
      const code = stripComments(text)
      for (const id of ids) {
        if (new RegExp(`['"\`]${id}['"\`]`).test(code)) {
          report(6, file, `names the built-in block "${id}"; the engine knows no specific block`)
        }
      }
    }
  }

  return violations
}
