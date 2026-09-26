import { v2 as cloudinary } from 'cloudinary'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

export interface UploadResult {
  url: string
  publicId: string
  format: string
  bytes: number
  width?: number
  height?: number
}

/**
 * Upload a file buffer to Cloudinary.
 * @param buffer - The file buffer from multer memoryStorage
 * @param options - folder, resource_type, etc.
 */
export function uploadToCloudinary(
  buffer: Buffer,
  options: {
    folder: string
    resourceType?: 'image' | 'video' | 'raw' | 'auto'
    publicId?: string
    /**
     * 'authenticated' files have no public URL: they are only reachable
     * through a signed, expiring link from signedDownloadUrl().
     */
    deliveryType?: 'upload' | 'authenticated'
  }
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder: `rentos/${options.folder}`,
          resource_type: options.resourceType ?? 'auto',
          public_id: options.publicId,
          ...(options.deliveryType ? { type: options.deliveryType } : {}),
        },
        (err, result) => {
          if (err || !result) {
            reject(err ?? new Error('Cloudinary upload failed'))
          } else {
            resolve({
              url: result.secure_url,
              publicId: result.public_id,
              format: result.format,
              bytes: result.bytes,
              width: result.width,
              height: result.height,
            })
          }
        }
      )
      .end(buffer)
  })
}

/**
 * Delete a file from Cloudinary by public ID, clearing CDN copies.
 */
export async function deleteFromCloudinary(publicId: string, resourceType: 'image' | 'video' | 'raw' = 'image', deliveryType: 'upload' | 'authenticated' = 'upload') {
  const result = await cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType,
    ...(deliveryType === 'authenticated' ? { type: deliveryType } : {}),
    invalidate: true,
  })
  if (result.result !== 'ok' && result.result !== 'not found') {
    throw new Error('Storage provider did not confirm asset deletion')
  }
  return result
}

/**
 * A short-lived download link for an 'authenticated' file. The link goes
 * through Cloudinary's API host and stops working after `expiresInSeconds`,
 * so a copied URL does not become a permanent public address.
 */
export function signedDownloadUrl(publicId: string, format: string, resourceType: 'image' | 'video' | 'raw', expiresInSeconds = 60): string {
  return cloudinary.utils.private_download_url(publicId, format, {
    resource_type: resourceType,
    type: 'authenticated',
    expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
  })
}

export { cloudinary }
