import { useState } from 'react'
import { Brain, ChevronDown } from 'lucide-react'

export function ThinkingBlock({ content }: { content: string }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-violet-300/50 bg-violet-50/50 dark:border-violet-500/30 dark:bg-violet-900/20">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-violet-100 p-1.5 dark:bg-violet-500/20">
            <Brain className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
          </span>
          <span className="text-xs font-medium text-violet-700 dark:text-violet-300">
            Thinking
          </span>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-violet-500 transition-transform dark:text-violet-400 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="border-t border-violet-200/60 px-3 py-3 dark:border-violet-500/20">
          <pre className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700 dark:text-slate-300">
            {content}
          </pre>
        </div>
      )}
    </div>
  )
}
