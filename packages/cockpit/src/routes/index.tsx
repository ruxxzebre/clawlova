import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useChat } from '@tanstack/ai-react'
import { fetchServerSentEvents } from '@tanstack/ai-client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { loadSession } from '#/server/functions'
import { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowDown, Check, Code, Lightbulb, MessageCircle, RefreshCw, Send, Square, Wrench } from 'lucide-react'
import { useChatUIStore } from '#/lib/chat-store'
import { motion, AnimatePresence } from 'motion/react'
import type { UIMessage } from '@tanstack/ai'
import { MessageBubble } from '#/components/chat/MessageBubble'
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

const STARTER_PROMPTS = [
  { icon: Code, label: 'Write code', prompt: 'Help me write a ' },
  { icon: Lightbulb, label: 'Explain something', prompt: 'Explain how ' },
  { icon: Wrench, label: 'Debug an issue', prompt: 'Help me debug ' },
  { icon: MessageCircle, label: 'Brainstorm ideas', prompt: 'Brainstorm ideas for ' },
]

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
  const { messages, sendMessage, isLoading, error, stop } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    initialMessages,
    body: sessionKey ? { sessionKey } : undefined,
    onFinish: onChatFinish,
  })

  const autoScroll = useChatUIStore((s) => s.autoScroll)
  const toggleAutoScroll = useChatUIStore((s) => s.toggleAutoScroll)

  const [input, setInput] = useState('')
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [lastInput, setLastInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const resizeTextarea = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [])

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
    if (!text || isLoading) return
    setLastInput(text)
    setInput('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
    await sendMessage(text)
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
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Message list */}
      <div className="relative flex-1 overflow-y-auto px-3 py-4 sm:px-4 sm:py-6" ref={scrollContainerRef}>
        <div className="mx-auto max-w-3xl space-y-3 sm:space-y-4">
          <AnimatePresence mode="wait">
            {messages.length === 0 && (
              <motion.div
                key="empty"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="flex h-full flex-col items-center justify-center py-16 text-center"
              >
                <p className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-sand-800 dark:text-sand-100">
                  What can I help with?
                </p>
                <p className="mt-1.5 sm:mt-2 text-sm sm:text-base text-sand-500 dark:text-sand-400">
                  Ask anything — powered by OpenClaw
                </p>
                <div className="mt-6 sm:mt-8 grid grid-cols-2 gap-2 sm:gap-2.5 w-full max-w-md">
                  {STARTER_PROMPTS.map(({ icon: Icon, label, prompt }, i) => (
                    <motion.button
                      key={label}
                      type="button"
                      onClick={() => handleStarterClick(prompt)}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 + i * 0.05, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="group flex items-center gap-2 sm:gap-2.5 rounded-xl border border-sand-200 dark:border-sand-700 bg-sand-50 dark:bg-sand-900 px-3 py-2.5 sm:px-4 sm:py-3 text-left text-xs sm:text-sm text-sand-600 dark:text-sand-300 transition-colors hover:border-terra-300 hover:text-terra-600 dark:hover:border-terra-600 dark:hover:text-terra-400"
                    >
                      <Icon className="h-4 w-4 flex-shrink-0 text-sand-400 group-hover:text-terra-500 dark:text-sand-500 dark:group-hover:text-terra-400 transition-colors" />
                      {label}
                    </motion.button>
                  ))}
                </div>
                <p className="mt-6 hidden sm:block text-xs text-sand-400 dark:text-sand-500">
                  Press <kbd className="rounded border border-sand-300 dark:border-sand-600 bg-sand-100 dark:bg-sand-800 px-1.5 py-0.5 font-mono text-[11px]">/</kbd> to focus input &middot; <kbd className="rounded border border-sand-300 dark:border-sand-600 bg-sand-100 dark:bg-sand-800 px-1.5 py-0.5 font-mono text-[11px]">Esc</kbd> to stop
                </p>
              </motion.div>
            )}
          </AnimatePresence>

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
                <div className="rounded-2xl rounded-tl-sm bg-sand-100 dark:bg-sand-800 px-4 py-3 text-sand-500 dark:text-sand-400">
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

        {/* Scroll to bottom / auto-scroll split button */}
        <AnimatePresence>
          {!isAtBottom && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2 }}
              className="sticky bottom-4 mx-auto flex w-fit items-center gap-[3px]"
            >
              {/* Left side – scroll to bottom (80%) */}
              <button
                type="button"
                onClick={scrollToBottom}
                className="flex items-center gap-1.5 rounded-l-full rounded-r-sm border border-sand-200 dark:border-sand-700 bg-sand-50/90 dark:bg-sand-900/90 pl-3 pr-3 py-1.5 text-xs font-medium text-sand-600 dark:text-sand-300 shadow-lg transition-colors hover:bg-sand-100 dark:hover:bg-sand-800"
              >
                <ArrowDown className="h-3.5 w-3.5" />
                Scroll to bottom
              </button>

              {/* Right side – auto-scroll toggle (20%) */}
              <button
                type="button"
                onClick={toggleAutoScroll}
                title={autoScroll ? 'Auto-scroll on – click to disable' : 'Auto-scroll off – click to enable'}
                className="flex items-center justify-center rounded-l-sm rounded-r-[10px] border border-sand-200 dark:border-sand-700 bg-sand-50/90 dark:bg-sand-900/90 px-2 py-1.5 shadow-lg transition-colors hover:bg-sand-100 dark:hover:bg-sand-800"
              >
                <div className={`flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border transition-colors ${autoScroll ? 'border-terra-500 bg-terra-500' : 'border-sand-400 dark:border-sand-500'}`}>
                  {autoScroll && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                </div>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Input area */}
      <div className="border-t border-sand-200 dark:border-sand-800 bg-sand-50 dark:bg-sand-950 px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:px-4 sm:py-3">
        <div className="mx-auto max-w-3xl">
          <form onSubmit={handleSubmit} className="flex gap-2 sm:gap-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                resizeTextarea()
              }}
              onKeyDown={handleKeyDown}
              placeholder={
                isLoading
                  ? 'OpenClaw is responding...'
                  : 'Message OpenClaw…'
              }
              disabled={isLoading}
              aria-disabled={isLoading}
              rows={1}
              className="flex-1 resize-none rounded-xl border border-sand-200 dark:border-sand-700 bg-sand-100 dark:bg-sand-800 px-3 py-2.5 sm:px-4 text-sm sm:text-base text-sand-800 dark:text-sand-100 placeholder:text-sand-400 outline-none focus:border-terra-400 dark:focus:border-terra-500 focus:ring-1 focus:ring-terra-400/30 disabled:cursor-not-allowed disabled:bg-sand-200 disabled:text-sand-500 dark:disabled:bg-sand-800/80 dark:disabled:text-sand-400 disabled:opacity-60"
            />
            {isLoading ? (
              <motion.button
                type="button"
                onClick={stop}
                title="Stop generating (Esc)"
                whileTap={{ scale: 0.92 }}
                className="flex h-11 w-11 sm:h-10 sm:w-10 flex-shrink-0 items-center justify-center self-end rounded-xl bg-red-600 text-white transition-colors hover:bg-red-700"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </motion.button>
            ) : (
              <motion.button
                type="submit"
                disabled={!input.trim()}
                aria-disabled={!input.trim()}
                title="Send message (Enter)"
                whileTap={{ scale: 0.92 }}
                className="flex h-11 w-11 sm:h-10 sm:w-10 flex-shrink-0 items-center justify-center self-end rounded-xl bg-terra-500 text-white transition-colors hover:bg-terra-600 disabled:cursor-not-allowed disabled:bg-sand-300 disabled:text-sand-500 dark:disabled:bg-sand-700 dark:disabled:text-sand-400"
              >
                <Send className="h-4 w-4" />
              </motion.button>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}

function isInputFocused(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || (el as HTMLElement).isContentEditable
}
