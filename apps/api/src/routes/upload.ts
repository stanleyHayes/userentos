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

/**
 * Magic-byte sniffing: the mimetype comes from the client and can't be
 * trusted, so verify the buffer's actual signature before accepting it.
 * doc/docx (OLE/zip containers) and mp4 stay on the mimetype+extension check —
 * their signatures are container-level and less discriminating.
 */
function matchesMagicBytes(buf: Buffer, mimetype: string): boolean {
  switch (mimetype) {
    case 'image/jpeg':
      return buf.length > 2 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
    case 'image/png':
      return buf.length > 3 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
    case 'image/gif':
      return buf.length > 3 && buf.toString('ascii', 0, 4) === 'GIF8'
    case 'image/webp':
      return buf.length > 11 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP'
    case 'application/pdf':
      return buf.length > 3 && buf.toString('ascii', 0, 4) === '%PDF'
    default:
      return true
  }
}

function hasValidContent(files: Express.Multer.File[]): boolean {
  return files.every((f) => matchesMagicBytes(f.buffer, f.mimetype))
}

// Single file upload
router.post('/single', authenticate, upload.single('file'), async (req, res) => {
  if (!req.file) { error(res, 'No file uploaded'); return }
  if (!matchesMagicBytes(req.file.buffer, req.file.mimetype)) {
    error(res, 'File content does not match its declared type', 400)
    return
  }

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
  if (!hasValidContent(files)) {
    error(res, 'File content does not match its declared type', 400)
    return
  }

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
