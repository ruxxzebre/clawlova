import { useState } from 'react'
import type { UIMessage } from '@tanstack/ai'
import { ChevronDown } from 'lucide-react'
import { motion } from 'motion/react'
import { buildMessageDisplayParts } from '#/lib/tool-call-display'
import type { ToolCallViewModel } from '#/lib/tool-call-display'
import { ThinkingBlock } from './ThinkingBlock'
import { ThinkingDots } from './ThinkingDots'
import { ToolCallGroupCard } from './ToolCallGroupCard'
import { StreamingText } from './StreamingText'

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
  const hasToolCalls = toolCalls.length > 0
  const lastPartType = displayParts.length > 0 ? displayParts[displayParts.length - 1].type : null
  const showDots = isStreaming && hasToolCalls && lastPartType !== 'text'

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
        <div className="mt-1 -mb-0.5 text-sand-500 dark:text-sand-400">
          <ThinkingDots />
        </div>
      )}
    </>
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
              {fullText.slice(0, PREVIEW_LENGTH).trimEnd() + '…'}
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
    <motion.div
      layout={isStreaming}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.25,
        ease: [0.16, 1, 0.3, 1],
        layout: { duration: 0.12, ease: 'easeOut' },
      }}
    >
      {bubbleContent}
    </motion.div>
  )
}
