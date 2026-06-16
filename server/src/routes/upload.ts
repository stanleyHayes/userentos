import { Router } from 'express'
import multer from 'multer'
import { authenticate } from '../middleware/auth.js'
import { success, error } from '../utils/response.js'
import { uploadToCloudinary } from '../utils/cloudinary.js'

const router = Router()

const storage = multer.memoryStorage()

const fileFilter = (_req: unknown, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
  if (allowed.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error('File type not allowed'))
  }
}

const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } }) // 10MB

// Single file upload
router.post('/single', authenticate, upload.single('file'), async (req, res) => {
  if (!req.file) { error(res, 'No file uploaded'); return }

  const resourceType = req.file.mimetype.startsWith('image/') ? 'image' as const
    : req.file.mimetype.startsWith('video/') ? 'video' as const
    : 'raw' as const

  const result = await uploadToCloudinary(req.file.buffer, {
    folder: 'uploads',
    resourceType,
  })

  success(res, {
    filename: result.publicId,
    originalName: req.file.originalname,
    mimetype: req.file.mimetype,
    size: result.bytes,
    url: result.url,
  }, 'File uploaded')
})

// Multiple files (up to 5)
router.post('/multiple', authenticate, upload.array('files', 5), async (req, res) => {
  const files = req.files as Express.Multer.File[]
  if (!files?.length) { error(res, 'No files uploaded'); return }

  const results = await Promise.all(
    files.map(async (f) => {
      const resourceType = f.mimetype.startsWith('image/') ? 'image' as const
        : f.mimetype.startsWith('video/') ? 'video' as const
        : 'raw' as const

      const result = await uploadToCloudinary(f.buffer, {
        folder: 'uploads',
        resourceType,
      })

      return {
        filename: result.publicId,
        originalName: f.originalname,
        mimetype: f.mimetype,
        size: result.bytes,
        url: result.url,
      }
    })
  )

  success(res, results, `${results.length} files uploaded`)
})

export default router
