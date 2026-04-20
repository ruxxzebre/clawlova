import { ArrowDown, Check } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

export function ScrollToBottomControl({
  visible,
  autoScroll,
  onScrollToBottom,
  onToggleAutoScroll,
}: {
  visible: boolean
  autoScroll: boolean
  onScrollToBottom: () => void
  onToggleAutoScroll: () => void
}) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.2 }}
          className="absolute inset-x-0 bottom-4 z-10 mx-auto flex w-fit items-center gap-[3px]"
        >
          <button
            type="button"
            onClick={onScrollToBottom}
            className="flex items-center gap-1.5 rounded-l-full rounded-r-sm border border-sand-200 bg-sand-50/90 py-1.5 pl-3 pr-3 text-xs font-medium text-sand-600 shadow-lg transition-colors hover:bg-sand-100 dark:border-sand-700 dark:bg-sand-900/90 dark:text-sand-300 dark:hover:bg-sand-800"
          >
            <ArrowDown className="h-3.5 w-3.5" />
            Scroll to bottom
          </button>
          <button
            type="button"
            onClick={onToggleAutoScroll}
            title={autoScroll ? 'Auto-scroll on – click to disable' : 'Auto-scroll off – click to enable'}
            className="flex items-center justify-center rounded-l-sm rounded-r-[10px] border border-sand-200 bg-sand-50/90 px-2 py-1.5 shadow-lg transition-colors hover:bg-sand-100 dark:border-sand-700 dark:bg-sand-900/90 dark:hover:bg-sand-800"
          >
            <div className={`flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border transition-colors ${autoScroll ? 'border-terra-500 bg-terra-500' : 'border-sand-400 dark:border-sand-500'}`}>
              {autoScroll && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
            </div>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
