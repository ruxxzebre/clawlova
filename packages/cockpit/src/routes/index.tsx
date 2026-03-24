import { createFileRoute } from '@tanstack/react-router'
import { useChat } from '@tanstack/ai-react'
import { fetchServerSentEvents } from '@tanstack/ai-client'
import { useEffect, useRef, useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  LoaderCircle,
  Send,
  Wrench,
} from 'lucide-react'
import type { UIMessage } from '@tanstack/ai'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  buildMessageDisplayParts,
  formatDisplayValue,
} from '#/lib/tool-call-display'
import type { ToolCallViewModel } from '#/lib/tool-call-display'

export const Route = createFileRoute('/')({
  component: ChatPage,
})

function ChatPage() {
  const { messages, sendMessage, isLoading, error } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })

  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
    <div className="flex flex-col" style={{ height: 'calc(100vh - 8rem)' }}>
      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
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

          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
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
      </div>

      {/* Input area */}
      <div className="border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3">
        <div className="mx-auto max-w-3xl">
          {isLoading && (
            <div className="mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-200">
              Waiting for response. Input is disabled until the current reply finishes.
            </div>
          )}
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
              className="flex-1 resize-none rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:border-slate-400 dark:focus:border-slate-500 disabled:cursor-not-allowed disabled:border-amber-500/40 disabled:bg-slate-200 disabled:text-slate-500 dark:disabled:bg-slate-800/80 dark:disabled:text-slate-400"
              style={{ maxHeight: '10rem', overflowY: 'auto' }}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              aria-disabled={!input.trim() || isLoading}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center self-end rounded-xl bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 transition hover:opacity-80 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user'
  const displayParts = buildMessageDisplayParts(message.parts)
  const toolCalls = displayParts
    .filter((part): part is { type: 'tool-call'; toolCall: ToolCallViewModel } => part.type === 'tool-call')
    .map((part) => part.toolCall)
  const hasActiveToolCalls = toolCalls.some(
    (toolCall) =>
      toolCall.status === 'running' || toolCall.status === 'waiting-for-output',
  )
  let hasRenderedCollapsedToolCalls = false

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
          isUser
            ? 'rounded-tr-sm bg-blue-600 text-white'
            : 'rounded-tl-sm bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100'
        }`}
      >
        {displayParts.map((part, i) => {
          if (part.type === 'tool-call' && !hasActiveToolCalls) {
            if (hasRenderedCollapsedToolCalls) {
              return null
            }
            hasRenderedCollapsedToolCalls = true
            return <ToolCallGroupCard key="tool-call-group" toolCalls={toolCalls} />
          }

          if (part.type === 'text') {
            if (isUser) {
              return (
                <p key={i} className="whitespace-pre-wrap leading-relaxed">
                  {part.content}
                </p>
              )
            }
            return (
              <div key={i} className="prose prose-sm dark:prose-invert max-w-none leading-snug [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-1 [&_li]:my-0">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {part.content}
                </ReactMarkdown>
              </div>
            )
          }

          return <ToolCallCard key={i} toolCall={part.toolCall} />
        })}
      </div>
    </div>
  )
}

function ToolCallCard({ toolCall }: { toolCall: ToolCallViewModel }) {
  const [isOpen, setIsOpen] = useState(false)

  const statusClasses =
    toolCall.status === 'completed'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
      : toolCall.status === 'error'
        ? 'border-red-500/30 bg-red-500/10 text-red-300'
        : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
  const StatusIcon =
    toolCall.status === 'completed'
      ? CheckCircle2
      : toolCall.status === 'error'
        ? CircleAlert
        : LoaderCircle

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-slate-300/70 bg-white/70 dark:border-slate-600 dark:bg-slate-800/60">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="rounded-md bg-slate-900/5 p-1.5 dark:bg-white/10">
            <Wrench className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <div className="truncate font-medium text-slate-900 dark:text-slate-100">
              {toolCall.name}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {toolCall.statusLabel}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusClasses}`}
          >
            <StatusIcon
              className={`h-3.5 w-3.5 ${toolCall.status === 'running' ? 'animate-spin' : ''}`}
            />
            {toolCall.statusLabel}
          </span>
          <ChevronDown
            className={`h-4 w-4 text-slate-500 transition-transform dark:text-slate-400 ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {isOpen && (
        <div className="space-y-3 border-t border-slate-200/80 px-3 py-3 dark:border-slate-700/80">
          <ToolSection
            title="Input"
            content={
              toolCall.rawArguments
                ? formatDisplayValue(
                    toolCall.parsedArguments ?? toolCall.rawArguments,
                  )
                : 'No input parameters'
            }
          />

          <ToolSection
            title={
              toolCall.status === 'error' && toolCall.error ? 'Error' : 'Output'
            }
            content={
              toolCall.error
                ? toolCall.error
                : toolCall.output !== undefined
                  ? formatDisplayValue(toolCall.output)
                  : 'Output unavailable'
            }
            tone={toolCall.status === 'error' ? 'error' : 'default'}
          />
        </div>
      )}
    </div>
  )
}

function ToolCallGroupCard({
  toolCalls,
}: {
  toolCalls: Array<ToolCallViewModel>
}) {
  const [isOpen, setIsOpen] = useState(false)
  const summaryLabel =
    toolCalls.length === 1 ? '1 tool call' : `${toolCalls.length} tool calls`
  const completedCount = toolCalls.filter(
    (toolCall) => toolCall.status === 'completed',
  ).length
  const errorCount = toolCalls.filter(
    (toolCall) => toolCall.status === 'error',
  ).length

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-slate-300/70 bg-white/70 dark:border-slate-600 dark:bg-slate-800/60">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="rounded-md bg-slate-900/5 p-1.5 dark:bg-white/10">
            <Wrench className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <div className="truncate font-medium text-slate-900 dark:text-slate-100">
              {summaryLabel}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {errorCount > 0
                ? `${completedCount} completed, ${errorCount} errors`
                : `${completedCount} completed`}
            </div>
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-slate-500 transition-transform dark:text-slate-400 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="border-t border-slate-200/80 px-3 py-3 dark:border-slate-700/80">
          {toolCalls.map((toolCall) => (
            <ToolCallCard key={toolCall.id} toolCall={toolCall} />
          ))}
        </div>
      )}
    </div>
  )
}

function ToolSection({
  title,
  content,
  tone = 'default',
}: {
  title: string
  content: string
  tone?: 'default' | 'error'
}) {
  return (
    <section>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
        {title}
      </div>
      <pre
        className={`overflow-x-auto rounded-lg px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
          tone === 'error'
            ? 'bg-red-500/10 text-red-200'
            : 'bg-slate-950 text-slate-100'
        }`}
      >
        {content}
      </pre>
    </section>
  )
}

function ThinkingDots() {
  return (
    <div className="flex gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-current"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  )
}
