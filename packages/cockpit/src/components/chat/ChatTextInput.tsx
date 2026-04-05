import type { KeyboardEventHandler, RefObject } from 'react'

export function ChatTextInput({
  textareaRef,
  value,
  disabled,
  placeholder,
  onChange,
  onKeyDown,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>
  value: string
  disabled: boolean
  placeholder: string
  onChange: (value: string) => void
  onKeyDown: KeyboardEventHandler<HTMLTextAreaElement>
}) {
  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      disabled={disabled}
      aria-disabled={disabled}
      rows={1}
      className="box-border h-11 min-h-11 flex-1 resize-none overflow-y-auto rounded-xl border border-sand-200 bg-sand-100 px-3 py-[11px] text-base leading-5 text-sand-800 placeholder:text-sand-400 outline-none focus:border-terra-400 focus:ring-1 focus:ring-terra-400/30 disabled:cursor-not-allowed disabled:bg-sand-200 disabled:text-sand-500 disabled:opacity-60 dark:border-sand-700 dark:bg-sand-800 dark:text-sand-100 dark:focus:border-terra-500 dark:disabled:bg-sand-800/80 dark:disabled:text-sand-400 sm:px-4"
    />
  )
}
