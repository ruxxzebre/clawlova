import { useState } from 'react'
import type { UIMessage } from '@tanstack/ai'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ChevronDown } from 'lucide-react'
import { buildMessageDisplayParts } from '#/lib/tool-call-display'
import type { ToolCallViewModel } from '#/lib/tool-call-display'
import { ThinkingBlock } from './ThinkingBlock'
import { ThinkingDots } from './ThinkingDots'
import { ToolCallGroupCard } from './ToolCallGroupCard'

const LONG_MESSAGE_THRESHOLD = 1000
const PREVIEW_LENGTH = 120

export function MessageBubble({
  message,
  isStreaming = false,
}: {
  message: UIMessage
  isStreaming?: boolean
}) {
  const isUser = message.role === 'user'
  const displayParts = buildMessageDisplayParts(message.parts)
  const toolCalls = displayParts
    .filter(
      (part): part is { type: 'tool-call'; toolCall: ToolCallViewModel } =>
        part.type === 'tool-call',
    )
    .map((part) => part.toolCall)
  let hasRenderedToolCallGroup = false
  const hasText = displayParts.some((p) => p.type === 'text')
  const hasToolCalls = toolCalls.length > 0
  const showDots = isStreaming && !hasText && hasToolCalls

  const fullText = displayParts
    .filter((p): p is { type: 'text'; content: string } => p.type === 'text')
    .map((p) => p.content)
    .join('')
  const isLongAssistant = !isUser && fullText.length > LONG_MESSAGE_THRESHOLD
  const [isExpanded, setIsExpanded] = useState(!isLongAssistant)

  const renderContent = () => (
    <>
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
            return (
              <p key={i} className="whitespace-pre-wrap leading-relaxed">
                {part.content}
              </p>
            )
          }
          return (
            <div
              key={i}
              className="prose prose-sm prose-chat dark:prose-invert max-w-none leading-snug"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ hr: () => null }}>
                {part.content}
              </ReactMarkdown>
            </div>
          )
        }

        return null
      })}
      {showDots && (
        <div className="mt-1 -mb-0.5 text-slate-500 dark:text-slate-400">
          <ThinkingDots />
        </div>
      )}
    </>
  )

  if (isLongAssistant) {
    const preview = fullText.slice(0, PREVIEW_LENGTH).trimEnd() + '…'
    return (
      <div className="flex justify-start">
        <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-slate-100 dark:bg-slate-700 text-sm text-slate-800 dark:text-slate-100">
          {isExpanded ? (
            <div className="px-4 py-2.5">
              {renderContent()}
            </div>
          ) : (
            <div className="px-4 py-2.5">
              <p className="leading-snug text-slate-600 dark:text-slate-300">
                {preview}
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={() => setIsExpanded((v) => !v)}
            className="flex w-full items-center justify-center gap-1.5 border-t border-slate-200/60 dark:border-slate-600/60 px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            {isExpanded ? 'Show less' : 'Show more'}
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
          isUser
            ? 'rounded-tr-sm bg-blue-600 text-white'
            : 'rounded-tl-sm bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100'
        }`}
      >
        {renderContent()}
      </div>
    </div>
  )
}
