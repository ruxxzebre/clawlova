import { useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  LoaderCircle,
  Wrench,
} from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { formatDisplayValue } from '#/lib/tool-call-display'
import type { ToolCallViewModel } from '#/lib/tool-call-display'
import { ToolSection } from './ToolSection'

export function ToolCallCard({ toolCall }: { toolCall: ToolCallViewModel }) {
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
    <div className="my-2 overflow-hidden rounded-xl border border-sand-300/70 bg-sand-50/70 dark:border-sand-700 dark:bg-sand-800/60">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="rounded-md bg-sand-200/60 p-1.5 dark:bg-sand-700/60">
            <Wrench className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <div className="truncate font-medium text-sand-800 dark:text-sand-100">
              {toolCall.name}
            </div>
            <div className="text-xs text-sand-500 dark:text-sand-400">
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
          <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="h-4 w-4 text-sand-500 dark:text-sand-400" />
          </motion.div>
        </div>
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
            <div className="space-y-3 border-t border-sand-200/80 px-3 py-3 dark:border-sand-700/80">
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
