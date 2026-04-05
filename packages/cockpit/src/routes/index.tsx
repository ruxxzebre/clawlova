import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useChat } from '@tanstack/ai-react'
import { liteChatConnection } from '#/lib/lite-chat-connection'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { loadSession } from '#/server/functions'
import { useEffect, useRef, useState, useCallback } from 'react'
import { RefreshCw } from 'lucide-react'
import { useChatUIStore } from '#/lib/chat-store'
import { motion, AnimatePresence } from 'motion/react'
import type { UIMessage } from '@tanstack/ai'
import { ChatComposer } from '#/components/chat/ChatComposer'
import { ChatDropOverlay } from '#/components/chat/ChatDropOverlay'
import { ChatEmptyState } from '#/components/chat/ChatEmptyState'
import { MessageBubble } from '#/components/chat/MessageBubble'
import type { PendingAttachment } from '#/components/chat/PendingAttachmentList'
import { ScrollToBottomControl } from '#/components/chat/ScrollToBottomControl'
import { ThinkingDots } from '#/components/chat/ThinkingDots'

export const Route = createFileRoute('/')({
  component: ChatPage,
  validateSearch: (
    search: Record<string, unknown>,
  ): { session?: string; new?: number } => ({
    session: (search.session as string) || undefined,
    new: search.new ? Number(search.new) : undefined,
  }),
})

// ---------------------------------------------------------------------------
// Outer component: handles routing, data fetching, and keyed remounting
// ---------------------------------------------------------------------------

function ChatPage() {
  const search = Route.useSearch()
  const session = search.session
  const queryClient = useQueryClient()

  const chatKey = session ?? `new-${search.new ?? 0}`

  const { data: savedMessages, isLoading: isLoadingSession } = useQuery({
    queryKey: ['session', session],
    queryFn: () =>
      loadSession({ data: { key: session! } }).then((msgs) =>
        msgs.map((m) => ({
          ...m,
          createdAt: m.createdAt ? new Date(m.createdAt) : undefined,
        })),
      ),
    enabled: !!session,
  })

  if (session && isLoadingSession) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-sm text-sand-500 dark:text-sand-400">
          Loading conversation…
        </div>
      </div>
    )
  }

  return (
    <ChatView
      key={chatKey}
      sessionKey={session}
      initialMessages={session ? (savedMessages as UIMessage[]) : undefined}
      onChatFinish={() =>
        queryClient.invalidateQueries({ queryKey: ['sessions'] })
      }
    />
  )
}

// ---------------------------------------------------------------------------
// Inner component: owns useChat, fully remounts on chat switch via key prop
// ---------------------------------------------------------------------------

function ChatView({
  sessionKey,
  initialMessages,
  onChatFinish,
}: {
  sessionKey?: string
  initialMessages?: UIMessage[]
  onChatFinish: () => void
}) {
  const navigate = useNavigate()
  const [effectiveSessionKey] = useState(() => {
    if (sessionKey) return sessionKey
    const id = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')
    return `agent:main:chat-${id}`
  })
  const { messages, sendMessage, isLoading, error, stop } = useChat({
    connection: liteChatConnection('/api/chat'),
    initialMessages,
    body: { sessionKey: effectiveSessionKey },
    onFinish: onChatFinish,
  })

  const autoScroll = useChatUIStore((s) => s.autoScroll)
  const toggleAutoScroll = useChatUIStore((s) => s.toggleAutoScroll)

  const [input, setInput] = useState('')
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [lastInput, setLastInput] = useState('')
  const [pendingFiles, setPendingFiles] = useState<PendingAttachment[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragCounterRef = useRef(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const COMPOSER_INPUT_MIN_HEIGHT = 44

  const resizeTextarea = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = `${COMPOSER_INPUT_MIN_HEIGHT}px`
    el.style.height = `${Math.min(Math.max(el.scrollHeight, COMPOSER_INPUT_MIN_HEIGHT), 160)}px`
  }, [])

  async function uploadFiles(files: File[]) {
    if (files.length === 0) return
    setIsUploading(true)
    setUploadError(null)
    for (const file of files) {
      try {
        const formData = new FormData()
        formData.append('file', file)
        const res = await fetch('/api/upload', { method: 'POST', body: formData })
        if (!res.ok) {
          const body = await res.json().catch(() => null) as { error?: string } | null
          setUploadError(body?.error ?? `Upload failed for ${file.name}`)
          continue
        }
        const { key, originalName, contentType, sizeBytes } = await res.json() as {
          key: string; originalName: string; contentType: string; sizeBytes: number
        }
        const previewUrl = file.type.startsWith('image/')
          ? URL.createObjectURL(file)
          : undefined
        setPendingFiles((prev) => [
          ...prev,
          { key, originalName, contentType, sizeBytes, previewUrl },
        ])
      } catch {
        setUploadError(`Failed to upload ${file.name}`)
      }
    }
    setIsUploading(false)
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    void uploadFiles(Array.from(files))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current += 1
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true)
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current -= 1
    if (dragCounterRef.current === 0) {
      setIsDragging(false)
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current = 0
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      void uploadFiles(files)
    }
  }

  function removePendingFile(key: string) {
    setPendingFiles((prev) => {
      const removed = prev.find((f) => f.key === key)
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl)
      return prev.filter((f) => f.key !== key)
    })
  }

  useEffect(() => {
    const sentinel = messagesEndRef.current
    const container = scrollContainerRef.current
    if (!sentinel || !container) return
    const observer = new IntersectionObserver(
      ([entry]) => setIsAtBottom(entry.isIntersecting),
      { root: container, threshold: 0 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    // During streaming: scroll only when auto-scroll is enabled (regardless of position)
    // After streaming: scroll only if already at bottom
    const shouldScroll = isLoading ? autoScroll : isAtBottom
    if (shouldScroll) {
      messagesEndRef.current?.scrollIntoView({
        behavior: isLoading ? 'instant' : 'smooth',
      })
    }
  }, [messages, isAtBottom, isLoading, autoScroll])

  // Global keyboard shortcuts
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        navigate({ to: '/', search: { new: Date.now() } })
        return
      }
      if (e.key === 'Escape') {
        if (isLoading) {
          e.preventDefault()
          stop()
        } else if (document.activeElement === inputRef.current) {
          inputRef.current?.blur()
        }
        return
      }
      if (e.key === '/' && !isInputFocused()) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [isLoading, stop, navigate])

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    setIsAtBottom(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if ((!text && pendingFiles.length === 0) || isLoading) return
    setLastInput(text)
    setInput('')
    let messageText = text || 'See attached file(s)'
    if (pendingFiles.length > 0) {
      const markers = pendingFiles.map((f) => {
        const sizeKB = Math.round(f.sizeBytes / 1024)
        return `[Attached file: ${f.originalName} (${f.contentType}, ${sizeKB}KB) key:${f.key}]`
      })
      messageText += '\n\n' + markers.join('\n')
    }
    setPendingFiles([])
    if (inputRef.current) inputRef.current.style.height = 'auto'
    await sendMessage(messageText)
  }

  async function handleRetry() {
    if (!lastInput || isLoading) return
    await sendMessage(lastInput)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as unknown as React.FormEvent)
    }
  }

  function handleStarterClick(prompt: string) {
    setInput(prompt)
    inputRef.current?.focus()
    requestAnimationFrame(resizeTextarea)
  }

  return (
    <div
      className="relative flex flex-1 flex-col overflow-hidden"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <ChatDropOverlay isDragging={isDragging} />

      <div className="relative flex-1 overflow-y-auto px-3 py-4 sm:px-4 sm:py-6" ref={scrollContainerRef}>
        <div className="mx-auto max-w-3xl space-y-3 sm:space-y-4">
          <ChatEmptyState
            visible={messages.length === 0}
            onStarterClick={handleStarterClick}
          />

          <AnimatePresence initial={false}>
            {messages.map((message, index) => (
              <MessageBubble
                key={message.id}
                message={message}
                isStreaming={isLoading && index === messages.length - 1}
              />
            ))}
          </AnimatePresence>

          <AnimatePresence>
            {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
              <motion.div
                key="thinking-indicator"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4, transition: { duration: 0.15 } }}
                className="flex justify-start"
              >
                <div className="rounded-2xl rounded-tl-sm bg-sand-100 dark:bg-sand-800 px-4 py-3 text-sm text-sand-500 dark:text-sand-400">
                  <ThinkingDots />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.2 }}
                className="rounded-xl border border-red-300/40 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10 px-4 py-3 text-sm"
              >
                <p className="text-red-700 dark:text-red-300">
                  Something went wrong — {error.message}
                </p>
                {lastInput && (
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 transition-colors hover:bg-red-100 dark:hover:bg-red-500/20"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Try again
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={messagesEndRef} />
        </div>

        <ScrollToBottomControl
          visible={!isAtBottom}
          autoScroll={autoScroll}
          onScrollToBottom={scrollToBottom}
          onToggleAutoScroll={toggleAutoScroll}
        />
      </div>
      <ChatComposer
        input={input}
        pendingFiles={pendingFiles}
        isLoading={isLoading}
        isUploading={isUploading}
        uploadError={uploadError}
        textareaRef={inputRef}
        fileInputRef={fileInputRef}
        onSubmit={handleSubmit}
        onFileSelect={handleFileSelect}
        onInputChange={(value) => {
          setInput(value)
          resizeTextarea()
        }}
        onInputKeyDown={handleKeyDown}
        onRemovePendingFile={removePendingFile}
        onDismissUploadError={() => setUploadError(null)}
        onStop={stop}
      />
    </div>
  )
}

function isInputFocused(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || (el as HTMLElement).isContentEditable
}
