import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { REFUSAL_TEXT, refusalText } from '../../apps/mindlink/web/refusals.js'

/**
 * Every refusal code a person can meet has Chinese text (MindLink#23).
 *
 * The codes are collected from source rather than listed by hand: Episteme's checkout beside this repository (the
 * one the build links, at the pinned commit in CI) and MindLink's own packages. A refusal added on either side
 * without text here fails this test.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const EPISTEME = join(ROOT, '..', 'Episteme')

/** Every non-test TypeScript source file under `<root>/{packages,apps}/<name>/src`. */
async function sources(root: string): Promise<string[]> {
  const walk = async (dir: string): Promise<string[]> => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    const found: string[] = []
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) found.push(...(await walk(path)))
      else if (/\.ts$/.test(entry.name) && !/\.(test|d)\.ts$/.test(entry.name)) found.push(path)
    }
    return found
  }
  const files: string[] = []
  for (const group of ['packages', 'apps']) {
    const dirs = await readdir(join(root, group), { withFileTypes: true }).catch(() => [])
    for (const dir of dirs.filter((entry) => entry.isDirectory())) {
      files.push(...(await walk(join(root, group, dir.name, 'src'))))
    }
  }
  return files
}

/**
 * The refusal codes a source text names: the first argument of a refusal or error constructor or helper
 * (`new SessionRefusal('code', …)`, `refuse('code', …)`, `sendRefusal(response, 422, 'code', …)`), and every code
 * a `code:` property or type is written with, unions included.
 */
function refusalCodesIn(text: string): readonly string[] {
  const codes: string[] = []
  const call =
    /\b(?:refuse|refused|\w*Refusal|\w*Error|\w*Rejection)\(\s*(?:\w+,\s*\d+,\s*)?'([a-z][a-z0-9_]*)'/g
  for (const match of text.matchAll(call)) codes.push(match[1]!)
  const property = /\bcode:\s*('[a-z][a-z0-9_]*'(?:\s*\|\s*'[a-z][a-z0-9_]*')*)/g
  for (const match of text.matchAll(property)) {
    for (const literal of match[1]!.matchAll(/'([a-z0-9_]+)'/g)) codes.push(literal[1]!)
  }
  const union = /\btype\s+\w*Code\s*=\s*((?:\s*\|?\s*'[a-z][a-z0-9_]*')+)/g
  for (const match of text.matchAll(union)) {
    for (const literal of match[1]!.matchAll(/'([a-z0-9_]+)'/g)) codes.push(literal[1]!)
  }
  return codes
}

async function codesUnder(root: string): Promise<Set<string>> {
  const codes = new Set<string>()
  for (const file of await sources(root)) {
    for (const code of refusalCodesIn(await readFile(file, 'utf8'))) codes.add(code)
  }
  return codes
}

describe('refusal texts', () => {
  it('reads every way a refusal code is written', () => {
    expect(
      refusalCodesIn(`
        throw new SessionRefusal(
          'not_live',
          'gone',
        )
        refuse('invalid_record_id', 'x')
        sendRefusal(response, 404, 'unknown_token', 'no')
        sendJson(response, 401, { error: 'no', code: 'unauthenticated' })
        readonly code: 'unauthenticated' | 'human_required'
        export type CoreErrorCode =
          | 'unregistered_node_type'
          | 'guard_rejected'
      `),
    ).toEqual([
      'not_live',
      'invalid_record_id',
      'unknown_token',
      'unauthenticated',
      'unauthenticated',
      'human_required',
      'unregistered_node_type',
      'guard_rejected',
    ])
  })

  it('has Chinese text for every code Episteme can refuse with', async () => {
    const codes = await codesUnder(EPISTEME)
    // The scan itself working: Episteme refuses with dozens of codes, these among them.
    expect(codes.size).toBeGreaterThan(50)
    for (const known of [
      'unauthenticated',
      'unknown_node',
      'invalid_request',
      'sharing_disabled',
    ]) {
      expect(codes).toContain(known)
    }
    expect([...codes].filter((code) => !Object.hasOwn(REFUSAL_TEXT, code)).sort()).toEqual([])
  })

  it('has Chinese text for every code MindLink itself refuses with', async () => {
    const codes = await codesUnder(ROOT)
    expect(codes).toContain('invalid_record_id')
    expect([...codes].filter((code) => !Object.hasOwn(REFUSAL_TEXT, code)).sort()).toEqual([])
  })

  it('writes every text in Chinese', () => {
    for (const [code, text] of Object.entries(REFUSAL_TEXT)) {
      expect(text, code).toMatch(/[一-鿿]/)
      expect(refusalText(code)).toBe(text)
    }
  })

  it('still says nothing was done for a code it does not know', () => {
    expect(refusalText('brand_new')).toBe('操作没有完成（brand_new）。')
    expect(refusalText('toString')).toBe('操作没有完成（toString）。')
  })
})
