import { Router } from 'express'
import type { Types } from 'mongoose'
import multer from 'multer'
import { authenticate } from '../middleware/auth.js'
import { DocumentModel } from '../models/Document.js'
import { AuditLog } from '../models/AuditLog.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'
import { uploadToCloudinary } from '../utils/cloudinary.js'

const router = Router()

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

// List documents for current user
router.get('/', authenticate, async (req, res) => {
  const roles = req.user!.roles
  const isAdmin = roles.includes('admin') || roles.includes('super_admin') || roles.includes('government')
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

  const { name, type, linkedEntityId, linkedEntityType, accessControl } = req.body

  let parsedAccessControl: string[]
  try {
    parsedAccessControl = accessControl ? JSON.parse(accessControl) : [req.user!.userId]
    if (!Array.isArray(parsedAccessControl)) parsedAccessControl = [req.user!.userId]
  } catch {
    error(res, 'Invalid accessControl JSON', 400)
    return
  }

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
    type: type || 'other',
    mimeType: req.file.mimetype,
    fileUrl: uploaded.url,
    fileSize: uploaded.bytes,
    version: 1,
    linkedEntityId,
    linkedEntityType,
    accessControl: parsedAccessControl,
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

  const roles = req.user!.roles
  const isAdmin = roles.includes('admin') || roles.includes('super_admin') || roles.includes('government')
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

  const roles = req.user!.roles
  const isAdmin = roles.includes('admin') || roles.includes('super_admin') || roles.includes('government')
  const userId = req.user!.userId
  if (!isAdmin && doc.ownerId !== userId && !(doc.accessControl ?? []).includes(userId)) {
    error(res, 'Not authorized to view this document', 403); return
  }

  const logs = await AuditLog.find({ entityType: 'document', entityId: param(req.params.id) }).sort({ createdAt: -1 }).lean()
  success(res, logs.map((l) => ({ ...l, id: (l._id as Types.ObjectId).toString() })))
})

export default router
