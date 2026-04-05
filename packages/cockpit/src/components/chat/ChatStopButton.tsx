import { Square } from 'lucide-react'
import { ChatComposerIconButton } from './ChatComposerIconButton'

export function ChatStopButton({
  onClick,
}: {
  onClick: () => void
}) {
  return (
    <ChatComposerIconButton
      type="button"
      variant="danger"
      title="Stop generating (Esc)"
      onClick={onClick}
    >
      <Square className="h-3.5 w-3.5 fill-current" />
    </ChatComposerIconButton>
  )
}
