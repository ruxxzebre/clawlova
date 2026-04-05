import type { ReactNode } from 'react'
import { motion } from 'motion/react'

const BASE_CLASS_NAME = 'inline-flex h-11 w-11 flex-shrink-0 self-end items-center justify-center rounded-xl border transition-colors disabled:cursor-not-allowed disabled:opacity-50'

const VARIANT_CLASS_NAMES = {
  neutral: 'border-sand-200 bg-sand-100 text-sand-500 hover:bg-sand-200 hover:text-sand-700 dark:border-sand-700 dark:bg-sand-800 dark:text-sand-400 dark:hover:bg-sand-700 dark:hover:text-sand-200',
  primary: 'border-transparent bg-terra-500 text-white hover:bg-terra-600 disabled:bg-sand-300 disabled:text-sand-500 dark:disabled:bg-sand-700 dark:disabled:text-sand-400',
  danger: 'border-transparent bg-red-600 text-white hover:bg-red-700',
} as const

export function ChatComposerIconButton({
  type,
  title,
  disabled = false,
  onClick,
  variant,
  children,
}: {
  type: 'button' | 'submit'
  title: string
  disabled?: boolean
  onClick?: () => void
  variant: keyof typeof VARIANT_CLASS_NAMES
  children: ReactNode
}) {
  return (
    <motion.button
      type={type}
      title={title}
      disabled={disabled}
      aria-disabled={disabled}
      onClick={onClick}
      whileTap={{ scale: disabled ? 1 : 0.92 }}
      className={`${BASE_CLASS_NAME} ${VARIANT_CLASS_NAMES[variant]}`}
    >
      {children}
    </motion.button>
  )
}
