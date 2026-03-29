import { useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  LoaderCircle,
  Wrench,
} from 'lucide-react'
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
