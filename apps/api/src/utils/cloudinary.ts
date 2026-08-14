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
  }
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder: `rentos/${options.folder}`,
          resource_type: options.resourceType ?? 'auto',
          public_id: options.publicId,
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
 * Delete a file from Cloudinary by public ID.
 */
export async function deleteFromCloudinary(publicId: string, resourceType: 'image' | 'video' | 'raw' = 'image') {
  return cloudinary.uploader.destroy(publicId, { resource_type: resourceType })
}

export { cloudinary }
