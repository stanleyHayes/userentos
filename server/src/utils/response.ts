import type { Response } from 'express'
import type { ApiResponse } from '../types/index.js'

export function success<T>(res: Response, data: T, message?: string, status = 200) {
  const body: ApiResponse<T> = { success: true, data, message }
  res.status(status).json(body)
}

export function error(res: Response, message: string, status = 400) {
  const body: ApiResponse<never> = { success: false, error: message }
  res.status(status).json(body)
}
