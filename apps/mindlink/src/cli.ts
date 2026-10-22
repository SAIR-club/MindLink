#!/usr/bin/env node
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { startMindLink, type StartOptions } from './app.js'

/**
 * `mindlink serve`: starts the one process that owns the graph.
 *
 *   mindlink serve [--local] [--graph <file>] [--port <n>] [--host <h>]
 *   mindlink serve --shared --users <file> --public-origin <url> [--sharing] [--graph <file>] [--port <n>] [--host <h>]
 *
 * `--local` (the default) serves one person on loopback with no sign-in; `--shared` serves the people in the user
 * file, each with their own token. People and tokens are managed with Episteme's service CLI until MindLink#24.
 */

export const USAGE = `usage:
  mindlink serve [--local] [--graph <file>] [--port <n>] [--host <h>]
  mindlink serve --shared --users <file> --public-origin <url> [--sharing] [--graph <file>] [--port <n>] [--host <h>]`

/** Reads `serve`'s flags into start options. Throws with the usage on anything it does not understand. */
export function parseServeArgs(argv: readonly string[]): StartOptions {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: true,
    options: {
      local: { type: 'boolean' },
      shared: { type: 'boolean' },
      graph: { type: 'string' },
      port: { type: 'string' },
      host: { type: 'string' },
      users: { type: 'string' },
      'public-origin': { type: 'string' },
      sharing: { type: 'boolean' },
    },
  })
  if (positionals.length !== 1 || positionals[0] !== 'serve') throw new Error(USAGE)
  if (values.local === true && values.shared === true) {
    throw new Error(`--local and --shared cannot both be given\n${USAGE}`)
  }
  const mode = values.shared === true ? 'shared' : 'local'
  if (mode === 'local' && (values.users !== undefined || values['public-origin'] !== undefined)) {
    throw new Error(`--users and --public-origin are for --shared\n${USAGE}`)
  }
  if (mode === 'shared' && (values.users === undefined || values['public-origin'] === undefined)) {
    throw new Error(`--shared needs --users and --public-origin\n${USAGE}`)
  }
  let port: number | undefined
  if (values.port !== undefined) {
    port = Number(values.port)
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      throw new Error(`--port must be a port number, not "${values.port}"`)
    }
  }
  return {
    mode,
    ...(values.graph === undefined ? {} : { graph: values.graph }),
    ...(port === undefined ? {} : { port }),
    ...(values.host === undefined ? {} : { host: values.host }),
    ...(values.users === undefined ? {} : { users: values.users }),
    ...(values['public-origin'] === undefined ? {} : { publicOrigin: values['public-origin'] }),
    ...(values.sharing === undefined ? {} : { sharing: values.sharing }),
  }
}

async function main(argv: readonly string[]): Promise<void> {
  let options: StartOptions
  try {
    options = parseServeArgs(argv)
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`)
    process.exitCode = 2
    return
  }
  const service = await startMindLink(options)
  const lines = [
    `MindLink is serving ${service.graph} (${service.mode} mode)`,
    `  MCP for agents: ${service.mcpUrl}`,
    `  REST:           ${service.apiUrl}`,
  ]
  if (service.webUrl !== undefined) lines.push(`  Web:            ${service.webUrl}`)
  // The person's token decides in their name: printed for them, on their terminal, and never logged elsewhere.
  if (service.humanToken !== undefined) lines.push(`  Your token:     ${service.humanToken}`)
  process.stdout.write(`${lines.join('\n')}\n`)
  const stop = (): void => {
    void service.close().then(() => process.exit(0))
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2))
}
