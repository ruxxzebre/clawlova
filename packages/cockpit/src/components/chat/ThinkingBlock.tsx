import { useState } from 'react'
import { Brain, ChevronDown } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'

export function ThinkingBlock({ content }: { content: string }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="-mx-1.5 my-4 overflow-hidden rounded-xl border border-amber-300/40 bg-amber-50/50 dark:border-amber-500/20 dark:bg-amber-900/15">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-amber-100 p-1.5 dark:bg-amber-500/20">
            <Brain className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
          </span>
          <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
            Thinking
          </span>
        </div>
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="h-4 w-4 text-amber-500 dark:text-amber-400" />
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
            <div className="border-t border-amber-200/50 px-3 py-3 dark:border-amber-500/15">
              <pre className="whitespace-pre-wrap text-xs leading-relaxed text-sand-700 dark:text-sand-300">
                {content}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
