/** The personal-data export as a file (GET /users/me/export.json): download-token auth only. */
export const EXPORT_LINK_PATH = '/users/me/export-link'

/**
 * Opened in the browser, which saves the attachment as a file. Sharing the
 * export as message text failed on Android past its ~1 MB binder limit and
 * never produced a file. The token is download-only and lives five minutes.
 */
export function exportDownloadPath(token: string): string {
  return `/users/me/export.json?token=${encodeURIComponent(token)}`
}
