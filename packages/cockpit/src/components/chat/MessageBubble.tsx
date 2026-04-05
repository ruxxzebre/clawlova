import { useState } from 'react'
import type { UIMessage } from '@tanstack/ai'
import { ChevronDown, FileText, X } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { markdownToPreviewText } from '#/lib/message-preview'
import { buildMessageDisplayParts } from '#/lib/tool-call-display'
import type { ToolCallViewModel } from '#/lib/tool-call-display'
import { ThinkingBlock } from './ThinkingBlock'
import { ThinkingDots } from './ThinkingDots'
import { ToolCallGroupCard } from './ToolCallGroupCard'
import { StreamingText } from './StreamingText'

const LONG_MESSAGE_THRESHOLD = 1000
const PREVIEW_LENGTH = 120

// Matches both client-side markers (with key:) and server-enriched markers (with File path:)
const ATTACHMENT_REGEX = /\[Attached file: (.+?) \((.+?), (\d+)KB\)(?: key:(.+?))?\](?:\nFile path: (.+))?/g

interface ParsedAttachment {
  originalName: string
  contentType: string
  sizeKB: number
  key?: string
}

function parseAttachments(text: string): ParsedAttachment[] {
  const matches: ParsedAttachment[] = []
  let match: RegExpExecArray | null
  const regex = new RegExp(ATTACHMENT_REGEX.source, 'g')
  while ((match = regex.exec(text)) !== null) {
    // Derive key from either the key: field or the File path: field
    let key = match[4]
    if (!key && match[5]) {
      // Extract key from agent path like /home/node/.openclaw/workspace/uploads/uuid_name
      const pathMatch = match[5].match(/uploads\/(.+)$/)
      if (pathMatch) key = `uploads/${pathMatch[1]}`
    }
    matches.push({
      originalName: match[1],
      contentType: match[2],
      sizeKB: parseInt(match[3], 10),
      key,
    })
  }
  return matches
}

function stripAttachments(text: string): string {
  // Strip attachment markers (with key: or File path: variants)
  let cleaned = text.replace(ATTACHMENT_REGEX, '')
  // Also strip any standalone "File path: ..." lines that may remain
  cleaned = cleaned.replace(/\nFile path: .+/g, '')
  return cleaned.trim()
}

function isImageType(contentType: string): boolean {
  return contentType.startsWith('image/')
}

function AttachmentChip({
  originalName,
  contentType,
  sizeKB,
  fileKey,
  onPreview,
}: {
  originalName: string
  contentType: string
  sizeKB: number
  fileKey?: string
  onPreview?: (url: string, name: string) => void
}) {
  const isImage = isImageType(contentType)
  const previewUrl = isImage && fileKey ? `/api/file?key=${encodeURIComponent(fileKey)}` : null

  return (
    <button
      type="button"
      onClick={() => {
        if (previewUrl && onPreview) onPreview(previewUrl, originalName)
      }}
      disabled={!previewUrl}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-xs transition-colors ${
        previewUrl ? 'cursor-pointer hover:bg-white/20' : 'cursor-default'
      }`}
    >
      {previewUrl ? (
        <img
          src={previewUrl}
          alt={originalName}
          className="h-5 w-5 rounded object-cover"
        />
      ) : (
        <FileText className="h-3.5 w-3.5 flex-shrink-0" />
      )}
      <span className="max-w-[150px] truncate">{originalName}</span>
      <span className="opacity-60">{sizeKB}KB</span>
    </button>
  )
}

function ImagePreviewOverlay({
  src,
  alt,
  onClose,
}: {
  src: string
  alt: string
  onClose: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
      >
        <X className="h-5 w-5" />
      </button>
      <motion.img
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        src={src}
        alt={alt}
        className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </motion.div>
  )
}

export function MessageBubble({
  message,
  isStreaming = false,
}: {
  message: UIMessage
  isStreaming?: boolean
}) {
  const isUser = message.role === 'user'
  const [preview, setPreview] = useState<{ src: string; alt: string } | null>(null)
  const displayParts = buildMessageDisplayParts(message.parts)
  const toolCalls = displayParts
    .filter(
      (part): part is { type: 'tool-call'; toolCall: ToolCallViewModel } =>
        part.type === 'tool-call',
    )
    .map((part) => part.toolCall)

  let hasRenderedToolCallGroup = false
  const hasToolCalls = toolCalls.length > 0
  const lastPartType = displayParts.length > 0 ? displayParts[displayParts.length - 1].type : null
  const showDots = isStreaming && hasToolCalls && lastPartType !== 'text'

  const fullText = displayParts
    .filter((p): p is { type: 'text'; content: string } => p.type === 'text')
    .map((p) => p.content)
    .join('')
  const collapsedPreviewText = markdownToPreviewText(fullText)
  const isLongAssistant =
    !isUser && collapsedPreviewText.length > LONG_MESSAGE_THRESHOLD
  const [isExpanded, setIsExpanded] = useState(!isLongAssistant)

  const renderContent = () => (
    <div className="flex flex-col gap-2">
      {displayParts.map((part, i) => {
        if (part.type === 'thinking') {
          return <ThinkingBlock key={i} content={part.content} />
        }

        if (part.type === 'tool-call') {
          if (hasRenderedToolCallGroup) return null
          hasRenderedToolCallGroup = true
          return (
            <ToolCallGroupCard
              key="tool-call-group"
              toolCalls={toolCalls}
            />
          )
        }

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (part.type === 'text') {
          if (isUser) {
            const attachments = parseAttachments(part.content)
            const cleanText = stripAttachments(part.content)
            return (
              <div key={i}>
                {cleanText && (
                  <p className="whitespace-pre-wrap leading-relaxed">
                    {cleanText}
                  </p>
                )}
                {attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {attachments.map((att, j) => (
                      <AttachmentChip
                        key={j}
                        originalName={att.originalName}
                        contentType={att.contentType}
                        sizeKB={att.sizeKB}
                        fileKey={att.key}
                        onPreview={(src, alt) => setPreview({ src, alt })}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          }
          return (
            <StreamingText
              key={i}
              content={part.content}
              isStreaming={isStreaming}
            />
          )
        }

        return null
      })}
      {showDots && (
        <div className="text-sand-500 dark:text-sand-400">
          <ThinkingDots />
        </div>
      )}
    </div>
  )

  const bubbleContent = isLongAssistant ? (
    <div className="flex justify-start">
      <div className="max-w-[92%] sm:max-w-[80%] rounded-2xl rounded-tl-sm bg-sand-100 dark:bg-sand-800 text-sm text-sand-800 dark:text-sand-100">
        {isExpanded ? (
          <div className="px-4 py-3">
            {renderContent()}
          </div>
        ) : (
          <div className="px-4 py-2.5">
            <p className="leading-snug text-sand-600 dark:text-sand-300">
              {collapsedPreviewText.slice(0, PREVIEW_LENGTH).trimEnd() + '…'}
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={() => setIsExpanded((v) => !v)}
          className="flex w-full items-center justify-center gap-1.5 border-t border-sand-200/60 dark:border-sand-700/60 px-3 py-1.5 text-xs font-medium text-sand-500 dark:text-sand-400 hover:text-sand-700 dark:hover:text-sand-200 transition-colors"
        >
          {isExpanded ? 'Show less' : 'Show more'}
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          />
        </button>
      </div>
    </div>
  ) : (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <motion.div
        layout={isStreaming ? 'position' : false}
        transition={isStreaming ? { layout: { duration: 0.15, ease: [0.25, 0.1, 0.25, 1] } } : undefined}
        className={`max-w-[92%] sm:max-w-[80%] rounded-2xl px-4 py-3 text-sm ${isUser
            ? 'rounded-tr-sm bg-terra-500 text-white'
            : 'rounded-tl-sm bg-sand-100 dark:bg-sand-800 text-sand-800 dark:text-sand-100'
          }`}
      >
        {renderContent()}
      </motion.div>
    </div>
  )

  return (
    <>
      <motion.div
        layout={isStreaming}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{
          duration: 0.25,
          ease: [0.16, 1, 0.3, 1],
          layout: { duration: 0.12, ease: 'easeOut' },
        }}
      >
        {bubbleContent}
      </motion.div>
      <AnimatePresence>
        {preview && (
          <ImagePreviewOverlay
            src={preview.src}
            alt={preview.alt}
            onClose={() => setPreview(null)}
          />
        )}
      </AnimatePresence>
    </>
  )
}
