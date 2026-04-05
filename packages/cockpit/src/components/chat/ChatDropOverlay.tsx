import { Paperclip } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

export function ChatDropOverlay({
  isDragging,
}: {
  isDragging: boolean
}) {
  return (
    <AnimatePresence>
      {isDragging && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="absolute inset-0 z-50 m-2 flex items-center justify-center rounded-xl border-2 border-dashed border-terra-400 bg-terra-500/10 backdrop-blur-sm dark:border-terra-500"
        >
          <div className="flex flex-col items-center gap-2 text-terra-600 dark:text-terra-400">
            <Paperclip className="h-8 w-8" />
            <p className="text-sm font-medium">Drop files to attach</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
