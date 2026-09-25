import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

/**
 * Local upload folder (dispute evidence), served at /uploads. One absolute
 * path for the writer and the static server: multer's relative 'uploads/'
 * resolved against the process cwd, so starting the API from the repo root
 * wrote files where /uploads never looked. UPLOADS_DIR overrides it.
 */
export const UPLOADS_DIR = process.env.UPLOADS_DIR || fileURLToPath(new URL('../../uploads', import.meta.url))

/** A fresh deploy has no uploads folder; create it before the first write. */
export async function ensureUploadsDir(): Promise<string> {
  await mkdir(UPLOADS_DIR, { recursive: true })
  return UPLOADS_DIR
}
