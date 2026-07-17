import { Request, Response } from 'express'
import type { Types } from 'mongoose'
import { Notification } from '../models/Notification.js'
import { success } from '../utils/response.js'
import { param } from '../utils/params.js'

export const notificationController = {
  list: async (req: Request, res: Response) => {
    const page = Math.max(1, Math.floor(Number(req.query.page) || 1))
    const pageSize = Math.min(100, Math.max(1, Math.floor(Number(req.query.pageSize) || 20)))
    const skip = (page - 1) * pageSize

    const [total, notifications] = await Promise.all([
      Notification.countDocuments({ userId: req.user!.userId }),
      Notification.find({ userId: req.user!.userId }).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(),
    ])
    const items = notifications.map((n) => ({ ...n, id: (n._id as Types.ObjectId).toString() }))
    success(res, { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) })
  },

  markRead: async (req: Request, res: Response) => {
    const notification = await Notification.findOneAndUpdate(
      { _id: param(req.params.id), userId: req.user!.userId },
      { read: true },
      { returnDocument: 'after' }
    ).lean()
    success(res, notification ? { ...notification, id: (notification._id as Types.ObjectId).toString() } : null)
  },

  markAllRead: async (req: Request, res: Response) => {
    const result = await Notification.updateMany({ userId: req.user!.userId, read: false }, { read: true })
    success(res, { updated: result.modifiedCount })
  },
}
