import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * `mindlink serve --local` serves the built front end (`apps/mindlink/web/dist`) at `/`: the page, and every
 * script, stylesheet and chunk it loads, transitively.
 *
 * Runs the built CLI and the built page as a person would (`pnpm test` builds both first), so what is checked is
 * what ships.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const CLI = join(ROOT, 'apps', 'mindlink', 'dist', 'cli.js')

let directory: string
let child: ChildProcess | undefined
let origin: string

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'mindlink-web-'))
  const running = spawn(
    process.execPath,
    [CLI, 'serve', '--local', '--port', '0', '--graph', join(directory, 'graph.jsonl')],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )
  child = running
  origin = await new Promise<string>((resolve, reject) => {
    let out = ''
    let err = ''
    running.stdout?.on('data', (chunk: Buffer) => {
      out += chunk.toString('utf8')
      const web = /Web:\s+(http:\/\/\S+?)\/?\s*$/m.exec(out)
      if (web?.[1] !== undefined) resolve(web[1])
    })
    running.stderr?.on('data', (chunk: Buffer) => {
      err += chunk.toString('utf8')
    })
    running.once('exit', (code) =>
      reject(new Error(`mindlink serve exited with ${code}:\n${out}${err}`)),
    )
  })
}, 30_000)

afterAll(async () => {
  if (child !== undefined && child.exitCode === null) {
    const exited = new Promise((resolve) => child?.once('exit', resolve))
    child.kill()
    await exited
  }
  await rm(directory, { recursive: true, force: true })
})

/** Every local file a page references by `src` or `href`, resolved against the page's path. */
function referencesOf(html: string, from: string): string[] {
  const found: string[] = []
  for (const match of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
    const reference = match[1]!
    if (/^[a-z]+:|^#|^\/\//i.test(reference)) continue
    found.push(posix.normalize(posix.join(posix.dirname(from), reference)))
  }
  return found
}

/** Every module a built script loads by a relative path, statically or not (Vite's chunks, minified). */
function modulesOf(script: string): string[] {
  return [...script.matchAll(/\b(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g)].map(
    (match) => match[1]!,
  )
}

describe('mindlink serve --local', () => {
  it('serves index.html at /, with the person’s session cookie', async () => {
    const response = await fetch(`${origin}/`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toMatch(/^text\/html/)
    expect(response.headers.get('set-cookie')).toMatch(/^episteme_session=/)
    const html = await response.text()
    expect(html).toContain('<div id="app">')
    expect(html).toMatch(/<script type="module" crossorigin src="\.\/assets\/index-[\w-]+\.js">/)
  })

  it('serves every file the page references and every module they load', async () => {
    const html = await (await fetch(`${origin}/`)).text()
    const pending = referencesOf(html, '/index.html')
    const seen = new Set<string>()
    while (pending.length > 0) {
      const path = pending.pop()!
      if (seen.has(path)) continue
      seen.add(path)
      const response = await fetch(`${origin}${path}`)
      expect(response.status, path).toBe(200)
      if (path.endsWith('.css')) {
        expect(response.headers.get('content-type'), path).toMatch(/^text\/css/)
      }
      if (!path.endsWith('.js')) continue
      expect(response.headers.get('content-type'), path).toMatch(/^text\/javascript/)
      for (const specifier of modulesOf(await response.text())) {
        pending.push(posix.normalize(posix.join(posix.dirname(path), specifier)))
      }
    }
    expect([...seen].some((path) => /^\/assets\/index-[\w-]+\.js$/.test(path))).toBe(true)
    expect([...seen].some((path) => /^\/assets\/index-[\w-]+\.css$/.test(path))).toBe(true)
  })

  it('serves no source, only what was built', async () => {
    expect((await fetch(`${origin}/src/main.ts`)).status).toBe(404)
  })

  it('answers the vocabulary the shell reads, in the shape it expects', async () => {
    const response = await fetch(`${origin}/api/v1/vocabulary`)
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      dimensions: { id: string; levels: { id: string; legacy: boolean }[] }[]
    }
    expect(body.dimensions.length).toBeGreaterThan(0)
    for (const dimension of body.dimensions) {
      expect(typeof dimension.id).toBe('string')
      for (const level of dimension.levels) expect(typeof level.legacy).toBe('boolean')
    }
  })
})
