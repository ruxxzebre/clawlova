import { Paperclip } from 'lucide-react'
import { ChatComposerIconButton } from './ChatComposerIconButton'

export function ChatAttachmentButton({
  disabled,
  onClick,
}: {
  disabled: boolean
  onClick: () => void
}) {
  return (
    <ChatComposerIconButton
      type="button"
      variant="neutral"
      title="Attach file"
      disabled={disabled}
      onClick={onClick}
    >
      <Paperclip className="h-4 w-4" />
    </ChatComposerIconButton>
  )
}
