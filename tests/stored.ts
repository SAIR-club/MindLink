import Database from 'better-sqlite3'

/**
 * What a graph's file holds, read with a connection of the test's own: the graph's records, or with `log` one
 * companion log's (ADR 0018), as the JSON bodies they were written as, oldest first. The graph must not be open,
 * since its owner holds the file exclusively. A file that does not exist holds nothing.
 */
function storedRecords(graphPath: string, log?: string): string[] {
  let db: Database.Database
  try {
    db = new Database(graphPath, { readonly: true, fileMustExist: true })
  } catch (error) {
    if ((error as { code?: string }).code === 'SQLITE_CANTOPEN') return []
    throw error
  }
  try {
    const rows =
      log === undefined
        ? db.prepare('SELECT body FROM records ORDER BY seq').all()
        : db.prepare('SELECT body FROM companions WHERE name = ? ORDER BY seq').all(log)
    return (rows as { body: string }[]).map((row) => row.body)
  } finally {
    db.close()
  }
}

/** The same, as one string per log, for a test that only asks whether something is in it. */
export function storedText(graphPath: string, log?: string): string {
  return storedRecords(graphPath, log).join('\n')
}
