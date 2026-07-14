export interface Document {
  id: string
  userId: string
  name: string
  type: string
  mimeType: string
  fileSize: number
  url: string
  category: string
  createdAt: string
}

export interface DocumentsResponse {
  items: Document[]
  total: number
}

export interface DocumentVersion {
  id: string
  version?: number
  createdAt: string
  fileUrl?: string
}

export interface AuditLog {
  id: string
  action: string
  createdAt: string
  details?: string
}
