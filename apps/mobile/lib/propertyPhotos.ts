/** Per photo. Phone photos over mobile data are large; one stalled upload must not hang the screen. */
export const PHOTO_UPLOAD_TIMEOUT_MS = 90_000

/** The multipart part for one picked photo. */
export function photoPart(uri: string): { uri: string; name: string; type: string } {
  const name = uri.split('/').pop() || 'photo.jpg'
  const ext = name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const type = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
  return { uri, name, type }
}

/**
 * One key per picked photo, the same on every retry. The time limit only
 * stops the phone: the server can still finish a slow upload, so a retry
 * sends the photo again, and the server stores a key once (uploadKey).
 */
export function createPhotoUploadKeys(randomId: () => string): (uri: string) => string {
  const keys = new Map<string, string>()
  return (uri) => {
    let key = keys.get(uri)
    if (!key) { key = randomId(); keys.set(uri, key) }
    return key
  }
}

/** What "Retry photos" sends: every photo on the screen not yet uploaded, including ones added after the failure. */
export function photosToUpload(images: readonly string[], uploaded: ReadonlySet<string>): string[] {
  return images.filter((uri) => !uploaded.has(uri))
}

export interface ListingSubmission { propertyId: string; failed: string[] }

/**
 * Saves a new listing, then uploads its photos one per request, each with its
 * own time limit, so a slow connection loses at most the photo in flight.
 *
 * Creating the listing and uploading photos fail separately: once the
 * listing exists, a photo failure is reported as `failed` with the saved id,
 * never as "failed to create", which invited a retry that created a
 * duplicate. Pass `savedId` to retry only the photos for that listing.
 */
export async function submitListing(dependencies: {
  savedId: string | null
  create: () => Promise<{ id?: unknown } | null | undefined>
  photos: readonly string[]
  uploadPhoto: (propertyId: string, uri: string, signal: AbortSignal) => Promise<unknown>
  timeoutMs?: number
  onProgress?: (done: number, total: number) => void
}): Promise<ListingSubmission> {
  const { photos, uploadPhoto, timeoutMs = PHOTO_UPLOAD_TIMEOUT_MS, onProgress } = dependencies
  let propertyId = dependencies.savedId
  if (!propertyId) {
    const created = await dependencies.create()
    if (typeof created?.id !== 'string' || !created.id) throw new Error('The listing was not saved. Please try again.')
    propertyId = created.id
  }
  const failed: string[] = []
  for (const [index, uri] of photos.entries()) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    // Also settle on the time limit when an upload ignores its abort signal.
    const timedOut = new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('Photo upload timed out'))))
    try {
      await Promise.race([uploadPhoto(propertyId, uri, controller.signal), timedOut])
    } catch {
      failed.push(uri)
    } finally {
      clearTimeout(timer)
      onProgress?.(index + 1, photos.length)
    }
  }
  return { propertyId, failed }
}
