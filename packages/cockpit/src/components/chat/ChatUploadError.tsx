import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

export function ChatUploadError({
  message,
  onDismiss,
}: {
  message: string | null
  onDismiss: () => void
}) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.15 }}
          className="flex items-center gap-2 rounded-lg border border-red-300/40 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
        >
          <span className="flex-1">{message}</span>
          <button
            type="button"
            onClick={onDismiss}
            className="text-red-400 hover:text-red-600 dark:hover:text-red-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
