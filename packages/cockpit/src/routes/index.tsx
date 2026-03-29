import { createFileRoute } from '@tanstack/react-router'
import { useChat } from '@tanstack/ai-react'
import { fetchServerSentEvents } from '@tanstack/ai-client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { ArrowDown, Send, Square } from 'lucide-react'
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

// ---------------------------------------------------------------------------
// Outer component: handles routing, data fetching, and keyed remounting
// ---------------------------------------------------------------------------

function ChatPage() {
  const search = Route.useSearch()
  const session = search.session
  const queryClient = useQueryClient()

  const chatKey = session ?? `new-${search.new ?? 0}`

  // Fetch saved messages when resuming a session
  const { data: savedMessages, isLoading: isLoadingSession } = useQuery({
    queryKey: ['session', session],
    queryFn: () =>
      fetch(`/api/session?key=${encodeURIComponent(session!)}`)
        .then((r) => r.json())
        .then((msgs: Array<UIMessage & { createdAt?: string }>) =>
          msgs.map((m) => ({
            ...m,
            createdAt: m.createdAt ? new Date(m.createdAt) : undefined,
          })),
        ),
    enabled: !!session,
  })

  // Wait for messages to load before mounting ChatView
  if (session && isLoadingSession) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-sm text-slate-500 dark:text-slate-400">
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
  const { messages, sendMessage, isLoading, error, stop } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    initialMessages,
    body: sessionKey ? { sessionKey } : undefined,
    onFinish: onChatFinish,
  })

  const [input, setInput] = useState('')
  const [isAtBottom, setIsAtBottom] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Track whether the bottom sentinel is visible via IntersectionObserver
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

  // Auto-scroll to bottom when messages change, only if already at bottom
  useEffect(() => {
    if (isAtBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isAtBottom])

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    setIsAtBottom(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || isLoading) return
    setInput('')
    await sendMessage(text)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as unknown as React.FormEvent)
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Message list */}
      <div className="relative flex-1 overflow-y-auto px-4 py-6" ref={scrollContainerRef}>
        <div className="mx-auto max-w-3xl space-y-4">
          {messages.length === 0 && (
            <div className="flex h-full items-center justify-center py-20 text-center">
              <div>
                <p className="text-lg font-medium text-slate-800 dark:text-slate-100">
                  OpenClaw Chat
                </p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Send a message to start the conversation
                </p>
              </div>
            </div>
          )}

          {messages.map((message, index) => (
            <MessageBubble
              key={message.id}
              message={message}
              isStreaming={isLoading && index === messages.length - 1}
            />
          ))}

          {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-tl-sm bg-slate-100 dark:bg-slate-700 px-4 py-3 text-slate-500 dark:text-slate-400">
                <ThinkingDots />
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              Error: {error.message}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Scroll to bottom button */}
        {!isAtBottom && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="sticky bottom-4 mx-auto flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-600 bg-white/90 dark:bg-slate-800/90 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 shadow-lg backdrop-blur-sm transition hover:bg-white dark:hover:bg-slate-700 hover:shadow-xl"
          >
            <ArrowDown className="h-3.5 w-3.5" />
            Scroll to bottom
          </button>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3">
        <div className="mx-auto max-w-3xl">
          <form onSubmit={handleSubmit} className="flex gap-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                isLoading
                  ? 'OpenClaw is responding...'
                  : 'Message OpenClaw… (Enter to send, Shift+Enter for newline)'
              }
              disabled={isLoading}
              aria-disabled={isLoading}
              rows={1}
              className="flex-1 resize-none rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:border-slate-400 dark:focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 dark:disabled:bg-slate-800/80 dark:disabled:text-slate-400 disabled:opacity-60"
              style={{ maxHeight: '10rem', overflowY: 'auto' }}
            />
            {isLoading ? (
              <button
                type="button"
                onClick={stop}
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center self-end rounded-xl bg-red-600 text-white transition hover:bg-red-700"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                aria-disabled={!input.trim()}
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center self-end rounded-xl bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 transition hover:opacity-80 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
              >
                <Send className="h-4 w-4" />
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}
