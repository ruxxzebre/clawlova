import { X } from 'lucide-react'

export interface PendingAttachment {
  key: string
  originalName: string
  contentType: string
  sizeBytes: number
  previewUrl?: string
}

function PendingAttachmentChip({
  file,
  onRemove,
}: {
  file: PendingAttachment
  onRemove: (key: string) => void
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-sand-200 bg-sand-100 px-2.5 py-1.5 text-xs text-sand-600 dark:border-sand-700 dark:bg-sand-800 dark:text-sand-300">
      {file.previewUrl ? (
        <img
          src={file.previewUrl}
          alt={file.originalName}
          className="h-8 w-8 rounded object-cover"
        />
      ) : null}
      <span className="max-w-[120px] truncate">
        {file.originalName}
      </span>
      <button
        type="button"
        onClick={() => onRemove(file.key)}
        className="text-sand-400 hover:text-sand-600 dark:hover:text-sand-200"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export function PendingAttachmentList({
  files,
  onRemove,
}: {
  files: PendingAttachment[]
  onRemove: (key: string) => void
}) {
  if (files.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      {files.map((file) => (
        <PendingAttachmentChip
          key={file.key}
          file={file}
          onRemove={onRemove}
        />
      ))}
    </div>
  )
}
