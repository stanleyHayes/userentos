// Mirrors what GET /documents returns. This used to declare userId, url and
// category, none of which the server sends — so search crashed on
// undefined.toLowerCase(), and Download and Delete never showed.
export interface Document {
  id: string
  ownerId: string
  name: string
  /** One of the server enum values in categoryOptions. */
  type: string
  mimeType: string
  fileSize: number
  fileUrl: string
  /** 'dispute' for evidence filed on a dispute: part of that record, so never deletable here. */
  linkedEntityType?: string
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
