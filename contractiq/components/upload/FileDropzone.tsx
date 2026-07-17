'use client'

import { useState, useRef, DragEvent, ChangeEvent } from 'react'
import { validateFileUpload } from '@/lib/security/inputValidator'
import { Alert } from '@/components/ui/Alert'

export function FileDropzone({
  selectedFile,
  onFileSelect,
}: {
  selectedFile: File | null
  onFileSelect: (file: File) => void
}) {
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFile(file: File) {
    const result = validateFileUpload(file)
    if (!result.valid) {
      setError(result.error?.message ?? 'This file cannot be uploaded.')
      return
    }
    setError(null)
    onFileSelect(file)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  return (
    <div className="flex flex-col gap-sm">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragActive(true)
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        className={`flex cursor-pointer flex-col items-center justify-center gap-sm rounded-card border border-dashed p-3xl text-center transition-colors duration-150 ease-out ${
          dragActive ? 'border-brand bg-accent-light' : 'border-border-strong bg-surface-subtle'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handleInputChange}
        />
        {selectedFile ? (
          <p className="text-body-lg text-text-primary">{selectedFile.name}</p>
        ) : (
          <>
            <p className="text-body-lg text-text-primary">Drag and drop a PDF, or click to browse</p>
            <p className="text-small text-text-muted">PDF only, up to 10MB</p>
          </>
        )}
      </div>

      {error && <Alert variant="error">{error}</Alert>}
    </div>
  )
}
