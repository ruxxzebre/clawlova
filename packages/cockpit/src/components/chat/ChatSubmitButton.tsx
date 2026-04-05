import { Send } from 'lucide-react'
import { ChatComposerIconButton } from './ChatComposerIconButton'

export function ChatSubmitButton({
  disabled,
}: {
  disabled: boolean
}) {
  return (
    <ChatComposerIconButton
      type="submit"
      variant="primary"
      title="Send message (Enter)"
      disabled={disabled}
    >
      <Send className="h-4 w-4" />
    </ChatComposerIconButton>
  )
}
