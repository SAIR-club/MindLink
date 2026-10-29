import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { REFUSAL_TEXT, refusalText } from '../../apps/mindlink/web/src/refusals.js'

/**
 * Every refusal code MindLink itself can answer with has Chinese text (MindLink#23).
 *
 * The codes are collected from MindLink's own source (`packages/<name>/src`, `apps/<name>/src`) rather than listed by hand, so
 * a refusal added here without its text fails this test. Episteme's codes are not collected: reading another
 * repository's internals would tie these tests to them. The texts for the ones a learner commonly meets are written
 * out, and any other gets `refusalText`'s general Chinese message.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

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

  it('says in Chinese that the service did not do it, for a code it has no text for', () => {
    expect(refusalText('brand_new')).toBe('服务没有完成这个操作（代码：brand_new）。')
    expect(refusalText('toString')).toBe('服务没有完成这个操作（代码：toString）。')
  })

  it('keeps the texts a learner commonly meets from Episteme', () => {
    for (const code of [
      'unauthenticated',
      'human_required',
      'invalid_request',
      'unknown_node',
      'unknown_suggestion',
      'sharing_disabled',
    ]) {
      expect(Object.hasOwn(REFUSAL_TEXT, code), code).toBe(true)
    }
  })
})
