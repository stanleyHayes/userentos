import { Router } from 'express'
import type { Types } from 'mongoose'
import multer from 'multer'
import { authenticate } from '../middleware/auth.js'
import { DocumentModel, type IDocument } from '../models/Document.js'
import { AuditLog } from '../models/AuditLog.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'
import { eraseDocumentFile } from '../services/documentErasure.js'
import { uploadToCloudinary } from '../utils/cloudinary.js'
import { isAdminStaff } from '../utils/accessControl.js'

const router = Router()

// Only document-safe types — arbitrary executables/HTML must never be uploaded
// and shared through document URLs.
const ALLOWED_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf', 'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

// The model's type enum. A Record over the union, so a type added to the model
// without being listed here is a compile error rather than a rejected upload.
const DOCUMENT_TYPES: Record<IDocument['type'], true> = {
  rental_agreement: true, receipt: true, legal_notice: true, evidence: true, identity: true, other: true,
}
const isDocumentType = (value: unknown): value is IDocument['type'] => typeof value === 'string' && Object.hasOwn(DOCUMENT_TYPES, value)

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.has(file.mimetype)) {
      cb(null, true)
    } else {
      // Tagged 400 so the error handler reports the reason, not a 500.
      cb(Object.assign(new Error('Only images, PDF, text and Office documents are allowed'), { status: 400 }))
    }
  },
})

// List documents for current user
router.get('/', authenticate, async (req, res) => {
  // Administrators only. Government used to get every user's documents here,
  // Ghana Card scans included — Act 843 keeps national IDs from regulators.
  const isAdmin = isAdminStaff(req.user!.roles)
  const filter: Record<string, unknown> = isAdmin ? {} : {
    $or: [{ ownerId: req.user!.userId }, { accessControl: req.user!.userId }],
  }
  if (req.query.type) filter.type = req.query.type
  if (req.query.linkedEntityId) filter.linkedEntityId = req.query.linkedEntityId

  const docs = await DocumentModel.find(filter).sort({ createdAt: -1 }).lean()
  const items = docs.map((d) => ({ ...d, id: (d._id as Types.ObjectId).toString() }))
  success(res, { items, total: items.length, page: 1, pageSize: 50, totalPages: 1 })
})

// Upload new document
router.post('/', authenticate, upload.single('file'), async (req, res) => {
  if (!req.file) { error(res, 'No file uploaded'); return }

  const { name, type, linkedEntityId, linkedEntityType } = req.body

  // Check the type before the file goes to Cloudinary: a Mongoose enum failure
  // after the upload left an orphaned file with no record pointing at it.
  const docType: unknown = type || 'other'
  if (!isDocumentType(docType)) { error(res, 'Invalid document type', 400); return }

  const resourceType = req.file.mimetype.startsWith('image/') ? 'image' as const
    : req.file.mimetype.startsWith('video/') ? 'video' as const
    : 'raw' as const

  const uploaded = await uploadToCloudinary(req.file.buffer, {
    folder: 'documents',
    resourceType,
  })

  const doc = await DocumentModel.create({
    ownerId: req.user!.userId,
    name: name || req.file.originalname,
    type: docType,
    mimeType: req.file.mimetype,
    fileUrl: uploaded.url,
    storagePublicId: uploaded.publicId,
    storageResourceType: resourceType,
    fileSize: uploaded.bytes,
    version: 1,
    linkedEntityId,
    linkedEntityType,
    // Never taken from the request: a client-supplied list let anyone drop a
    // file into any other user's Documents page. No client sends it; sharing
    // needs its own endpoint that checks who the counterparties are.
    accessControl: [req.user!.userId],
  })

  await AuditLog.create({
    userId: req.user!.userId,
    action: 'upload',
    entityType: 'document',
    entityId: doc._id.toString(),
    details: `Uploaded ${req.file.originalname} (${uploaded.bytes} bytes)`,
  })

  success(res, { ...doc.toObject(), id: doc._id.toString() }, 'Document uploaded', 201)
})

// Upload new version of existing document
router.post('/:id/version', authenticate, upload.single('file'), async (req, res) => {
  if (!req.file) { error(res, 'No file uploaded'); return }

  const existing = await DocumentModel.findById(param(req.params.id))
  if (!existing) { error(res, 'Document not found', 404); return }
  if (existing.ownerId !== req.user!.userId) { error(res, 'Not authorized', 403); return }

  const resourceType = req.file.mimetype.startsWith('image/') ? 'image' as const
    : req.file.mimetype.startsWith('video/') ? 'video' as const
    : 'raw' as const

  const uploaded = await uploadToCloudinary(req.file.buffer, {
    folder: 'documents',
    resourceType,
  })

  const newDoc = await DocumentModel.create({
    ownerId: req.user!.userId,
    name: existing.name,
    type: existing.type,
    mimeType: req.file.mimetype,
    fileUrl: uploaded.url,
    storagePublicId: uploaded.publicId,
    storageResourceType: resourceType,
    fileSize: uploaded.bytes,
    version: existing.version + 1,
    parentId: existing._id.toString(),
    linkedEntityId: existing.linkedEntityId,
    linkedEntityType: existing.linkedEntityType,
    accessControl: existing.accessControl,
  })

  await AuditLog.create({
    userId: req.user!.userId,
    action: 'update',
    entityType: 'document',
    entityId: newDoc._id.toString(),
    details: `New version ${newDoc.version} of ${existing.name}`,
  })

  success(res, { ...newDoc.toObject(), id: newDoc._id.toString() }, 'New version uploaded', 201)
})

// Get document versions
router.get('/:id/versions', authenticate, async (req, res) => {
  const doc = await DocumentModel.findById(param(req.params.id)).lean()
  if (!doc) { error(res, 'Document not found', 404); return }

  const isAdmin = isAdminStaff(req.user!.roles)
  const userId = req.user!.userId
  if (!isAdmin && doc.ownerId !== userId && !(doc.accessControl ?? []).includes(userId)) {
    error(res, 'Not authorized to view this document', 403); return
  }

  const rootId = doc.parentId || (doc._id as Types.ObjectId).toString()
  const versions = await DocumentModel.find({
    $or: [{ _id: rootId }, { parentId: rootId }],
  }).sort({ version: -1 }).lean()

  success(res, versions.map((v) => ({ ...v, id: (v._id as Types.ObjectId).toString() })))
})

// Delete document
router.delete('/:id', authenticate, async (req, res) => {
  const doc = await DocumentModel.findById(param(req.params.id))
  if (!doc) { error(res, 'Document not found', 404); return }
  if (doc.ownerId !== req.user!.userId) { error(res, 'Not authorized', 403); return }

  await eraseDocumentFile(doc)
  await doc.deleteOne()
  await AuditLog.create({
    userId: req.user!.userId,
    action: 'delete',
    entityType: 'document',
    entityId: param(req.params.id),
    details: `Deleted ${doc.name}`,
  })

  success(res, null, 'Document deleted')
})

// Audit log for a document
router.get('/:id/audit', authenticate, async (req, res) => {
  const doc = await DocumentModel.findById(param(req.params.id)).lean()
  if (!doc) { error(res, 'Document not found', 404); return }

  const isAdmin = isAdminStaff(req.user!.roles)
  const userId = req.user!.userId
  if (!isAdmin && doc.ownerId !== userId && !(doc.accessControl ?? []).includes(userId)) {
    error(res, 'Not authorized to view this document', 403); return
  }

  const logs = await AuditLog.find({ entityType: 'document', entityId: param(req.params.id) }).sort({ createdAt: -1 }).lean()
  success(res, logs.map((l) => ({ ...l, id: (l._id as Types.ObjectId).toString() })))
})

export default router
