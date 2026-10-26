import { parseServeArgs, wantsHelp } from '@mindlink/app/cli'
import { describe, expect, it } from 'vitest'

describe('mindlink serve', () => {
  it('defaults to local mode', () => {
    expect(parseServeArgs(['serve'])).toEqual({ mode: 'local' })
  })

  it('reads a local run’s graph, port and host', () => {
    expect(
      parseServeArgs([
        'serve',
        '--local',
        '--graph',
        'g.jsonl',
        '--port',
        '4400',
        '--host',
        '127.0.0.1',
      ]),
    ).toEqual({ mode: 'local', graph: 'g.jsonl', port: 4400, host: '127.0.0.1' })
  })

  it('reads a shared run', () => {
    expect(
      parseServeArgs([
        'serve',
        '--shared',
        '--users',
        'users.json',
        '--public-origin',
        'https://mindlink.example',
        '--sharing',
      ]),
    ).toEqual({
      mode: 'shared',
      users: 'users.json',
      publicOrigin: 'https://mindlink.example',
      sharing: true,
    })
  })

  it('refuses a shared run without its users file or origin', () => {
    expect(() => parseServeArgs(['serve', '--shared'])).toThrow(/needs --users and --public-origin/)
  })

  it('refuses shared-only flags in local mode', () => {
    expect(() => parseServeArgs(['serve', '--users', 'u.json'])).toThrow(/are for --shared/)
  })

  it('refuses both modes at once, an unknown flag, a bad port and a missing command', () => {
    expect(() => parseServeArgs(['serve', '--local', '--shared'])).toThrow(/cannot both be given/)
    expect(() => parseServeArgs(['serve', '--verbose'])).toThrow()
    expect(() => parseServeArgs(['serve', '--port', 'eighty'])).toThrow(/must be a port number/)
    expect(() => parseServeArgs([])).toThrow(/usage/)
  })

  it('recognises a request for the usage, before or after serve', () => {
    expect(wantsHelp(['--help'])).toBe(true)
    expect(wantsHelp(['-h'])).toBe(true)
    expect(wantsHelp(['help'])).toBe(true)
    expect(wantsHelp(['serve', '--help'])).toBe(true)
    expect(wantsHelp(['serve', '--port', '4400'])).toBe(false)
  })
})
