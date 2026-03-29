import { useState, useEffect, useRef } from 'react'
import { ChevronDown, Wrench } from 'lucide-react'
import type { ToolCallViewModel } from '#/lib/tool-call-display'
import { ToolCallCard } from './ToolCallCard'

export function ToolCallGroupCard({
  toolCalls,
  forceOpen = false,
}: {
  toolCalls: Array<ToolCallViewModel>
  forceOpen?: boolean
}) {
  const [manualToggle, setManualToggle] = useState<boolean | null>(null)

  // Reset manual override when streaming ends so container collapses
  const prevForceOpen = useRef(forceOpen)
  useEffect(() => {
    if (prevForceOpen.current && !forceOpen) {
      setManualToggle(null)
    }
    prevForceOpen.current = forceOpen
  }, [forceOpen])

  const isOpen = manualToggle ?? forceOpen
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
        onClick={() => setManualToggle((prev) => !(prev ?? forceOpen))}
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
