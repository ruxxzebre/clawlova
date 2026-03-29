import type { UIMessage } from '@tanstack/ai'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { buildMessageDisplayParts } from '#/lib/tool-call-display'
import type { ToolCallViewModel } from '#/lib/tool-call-display'
import { ThinkingBlock } from './ThinkingBlock'
import { ThinkingDots } from './ThinkingDots'
import { ToolCallGroupCard } from './ToolCallGroupCard'

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
                className="prose prose-sm dark:prose-invert max-w-none leading-snug [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-1 [&_li]:my-0"
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
      </div>
    </div>
  )
}
