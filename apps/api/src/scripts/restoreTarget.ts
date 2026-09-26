/**
 * The restored copy a restore script should work on: --mongo-uri=<uri> or
 * RESTORE_MONGO_URI, else null (the script then uses MONGO_URI, the live
 * database). Shared so every step of docs/compliance/backup-restore.md looks
 * at the same database.
 */
export function restoreTarget(argv: readonly string[] = process.argv, env: NodeJS.ProcessEnv = process.env): string | null {
  const flag = argv.find((arg) => arg.startsWith('--mongo-uri='))
  return flag?.slice('--mongo-uri='.length) || env.RESTORE_MONGO_URI || null
}
