import { Code, Lightbulb, MessageCircle, Wrench } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

const STARTER_PROMPTS = [
  { icon: Code, label: 'Write code', prompt: 'Help me write a ' },
  { icon: Lightbulb, label: 'Explain something', prompt: 'Explain how ' },
  { icon: Wrench, label: 'Debug an issue', prompt: 'Help me debug ' },
  { icon: MessageCircle, label: 'Brainstorm ideas', prompt: 'Brainstorm ideas for ' },
]

export function ChatEmptyState({
  visible,
  onStarterClick,
}: {
  visible: boolean
  onStarterClick: (prompt: string) => void
}) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="empty"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="flex h-full flex-col items-center justify-center py-16 text-center"
        >
          <p className="font-display text-2xl font-bold tracking-tight text-sand-800 dark:text-sand-100 sm:text-3xl">
            What can I help with?
          </p>
          <p className="mt-1.5 text-sm text-sand-500 dark:text-sand-400 sm:mt-2 sm:text-base">
            Ask anything — powered by OpenClaw
          </p>
          <div className="mt-6 grid w-full max-w-md grid-cols-2 gap-2 sm:mt-8 sm:gap-2.5">
            {STARTER_PROMPTS.map(({ icon: Icon, label, prompt }, i) => (
              <motion.button
                key={label}
                type="button"
                onClick={() => onStarterClick(prompt)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: 0.1 + i * 0.05,
                  duration: 0.3,
                  ease: [0.16, 1, 0.3, 1],
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="group flex items-center gap-2 rounded-xl border border-sand-200 bg-sand-50 px-3 py-2.5 text-left text-xs text-sand-600 transition-colors hover:border-terra-300 hover:text-terra-600 dark:border-sand-700 dark:bg-sand-900 dark:text-sand-300 dark:hover:border-terra-600 dark:hover:text-terra-400 sm:gap-2.5 sm:px-4 sm:py-3 sm:text-sm"
              >
                <Icon className="h-4 w-4 flex-shrink-0 text-sand-400 transition-colors group-hover:text-terra-500 dark:text-sand-500 dark:group-hover:text-terra-400" />
                {label}
              </motion.button>
            ))}
          </div>
          <p className="mt-6 hidden text-xs text-sand-400 dark:text-sand-500 md:block">
            Press <kbd className="rounded border border-sand-300 bg-sand-100 px-1.5 py-0.5 font-mono text-[11px] dark:border-sand-600 dark:bg-sand-800">/</kbd> to focus input
            {' '}·{' '}
            <kbd className="rounded border border-sand-300 bg-sand-100 px-1.5 py-0.5 font-mono text-[11px] dark:border-sand-600 dark:bg-sand-800">Esc</kbd> to stop
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
