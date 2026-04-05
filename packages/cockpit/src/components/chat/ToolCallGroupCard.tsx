import { useState } from 'react'
import { ChevronDown, Wrench } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import type { ToolCallViewModel } from '#/lib/tool-call-display'
import { ToolCallCard } from './ToolCallCard'

export function ToolCallGroupCard({
  toolCalls,
}: {
  toolCalls: ToolCallViewModel[]
}) {
  const [isOpen, setIsOpen] = useState(false)

  const summaryLabel =
    toolCalls.length === 1 ? '1 tool call' : `${toolCalls.length} tool calls`
  const completedCount = toolCalls.filter(
    (tc) => tc.status === 'completed',
  ).length
  const errorCount = toolCalls.filter((tc) => tc.status === 'error').length

  const activeTool = toolCalls.find(
    (tc) => tc.status === 'running' || tc.status === 'waiting-for-output',
  )

  return (
    <div className="-mx-1.5 overflow-hidden rounded-xl border border-sand-300/70 bg-sand-50/70 dark:border-sand-700 dark:bg-sand-800/60">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="rounded-md bg-sand-200/60 p-1.5 dark:bg-sand-700/60">
            <Wrench className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <div className="truncate font-medium text-sand-800 dark:text-sand-100">
              {activeTool ? (
                <>
                  {summaryLabel}
                  <span className="ml-1.5 font-normal text-amber-600 dark:text-amber-400">
                    — {activeTool.name}
                  </span>
                </>
              ) : (
                summaryLabel
              )}
            </div>
            <div className="text-xs text-sand-500 dark:text-sand-400">
              {errorCount > 0
                ? `${completedCount} completed, ${errorCount} errors`
                : `${completedCount} completed`}
            </div>
          </div>
        </div>
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="h-4 w-4 text-sand-500 dark:text-sand-400" />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-sand-200/80 px-3 py-3 dark:border-sand-700/80">
              {toolCalls.map((toolCall) => (
                <ToolCallCard key={toolCall.id} toolCall={toolCall} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
