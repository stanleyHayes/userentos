import { useState, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Upload } from 'lucide-react'
import { api } from '@/lib/api'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Document } from '../types'
import { categoryOptions, getFileIcon, formatFileSize } from '../documentConfig'

interface UploadModalProps {
  open: boolean
  onClose: () => void
}

export function UploadModal({ open, onClose }: UploadModalProps) {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [category, setCategory] = useState('other')
  const [name, setName] = useState('')
  const [dragActive, setDragActive] = useState(false)

  const uploadMutation = useMutation({
    mutationFn: async (payload: { file: File; name: string; category: string }) => {
      // Server route uses multer (upload.single('file')) and reads `type` from the
      // body — sending JSON made req.file undefined ("No file uploaded"). Use multipart.
      const formData = new FormData()
      formData.append('file', payload.file)
      formData.append('name', payload.name)
      formData.append('type', payload.category)
      return api.upload<Document>('/documents', formData)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] })
      resetAndClose()
    },
  })

  function resetAndClose() {
    setFile(null)
    setCategory('other')
    setName('')
    setDragActive(false)
    onClose()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) {
      setFile(f)
      if (!name) setName(f.name)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragActive(false)
    const f = e.dataTransfer.files?.[0]
    if (f) {
      setFile(f)
      if (!name) setName(f.name)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    uploadMutation.mutate({ file, name: name || file.name, category })
  }

  return (
    <Modal open={open} onClose={resetAndClose} title="Upload Document">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* Drop zone */}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileChange}
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.xls,.xlsx,.csv,.zip"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={`w-full flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 transition-all cursor-pointer ${
              dragActive
                ? 'border-primary dark:border-blue-500 bg-primary/5 dark:bg-blue-500/10 scale-[1.01]'
                : file
                  ? 'border-emerald-500/40 dark:border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-500/5'
                  : 'border-border dark:border-[#252a3a] bg-surface dark:bg-[#0c0e1a] hover:border-primary/50 dark:hover:border-blue-500/50'
            }`}
          >
            {file ? (
              <>
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-500/10">
                  {getFileIcon(file.type, 24)}
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-primary-dark dark:text-white">{file.name}</p>
                  <p className="text-xs text-muted dark:text-gray-400 mt-0.5">{formatFileSize(file.size)}</p>
                </div>
                <span className="text-[10px] text-primary dark:text-blue-400 font-medium">Click to change file</span>
              </>
            ) : (
              <>
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 dark:bg-blue-500/15">
                  <Upload size={24} className="text-primary dark:text-blue-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-primary-dark dark:text-white">
                    {dragActive ? 'Drop your file here' : 'Drag & drop or click to browse'}
                  </p>
                  <p className="text-xs text-muted dark:text-gray-400 mt-0.5">PDF, images, documents, spreadsheets up to 10MB</p>
                </div>
              </>
            )}
          </button>
        </div>

        <div className="space-y-4">
          <Input
            id="doc-name"
            label="Document Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Lease Agreement - January 2026"
            required
          />

          <Select
            id="doc-category"
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={categoryOptions}
          />
        </div>

        {uploadMutation.isError && (
          <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
            {(uploadMutation.error as Error).message}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={resetAndClose}>Cancel</Button>
          <Button type="submit" disabled={!file || uploadMutation.isPending}>
            <Upload size={14} />
            {uploadMutation.isPending ? 'Uploading...' : 'Upload Document'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
