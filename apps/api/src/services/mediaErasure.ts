/**
 * Files stored by folder rather than tracked one by one: everything an author
 * uploaded for their posts lives under rentos/posts/<userId>/, so closing the
 * account erases the folder in one call (with CDN invalidation).
 */
import { cloudinary } from '../utils/cloudinary.js'

export const postImagesPrefix = (userId: string) => `rentos/posts/${userId}/`

export async function eraseByPrefix(prefix: string): Promise<void> {
  if (!process.env.CLOUDINARY_API_KEY) return
  await cloudinary.api.delete_resources_by_prefix(prefix, { invalidate: true, resource_type: 'image' })
}
