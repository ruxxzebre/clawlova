import { AlertTriangle, CheckCircle2, CircleAlert } from 'lucide-react'

export function Banner({
  type,
  message,
  onDismiss,
}: {
  type: 'success' | 'warning' | 'error'
  message: string
  onDismiss: () => void
}) {
  const styles = {
    success:
      'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
    warning:
      'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    error:
      'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300',
  }
  const Icon =
    type === 'success'
      ? CheckCircle2
      : type === 'warning'
        ? AlertTriangle
        : CircleAlert

  return (
    <div
      className={`mb-5 flex items-start gap-3 rounded-xl border p-4 text-sm ${styles[type]}`}
    >
      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <span className="flex-1">{message}</span>
      <button
        onClick={onDismiss}
        className="ml-2 text-xs opacity-60 hover:opacity-100"
      >
        ✕
      </button>
    </div>
  )
}
