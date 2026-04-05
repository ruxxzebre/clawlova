import type { ChangeEventHandler, FormEventHandler, KeyboardEventHandler, RefObject } from 'react'
import { ChatAttachmentButton } from './ChatAttachmentButton'
import { ChatStopButton } from './ChatStopButton'
import { ChatSubmitButton } from './ChatSubmitButton'
import { ChatTextInput } from './ChatTextInput'
import { ChatUploadError } from './ChatUploadError'
import { PendingAttachmentList } from './PendingAttachmentList'
import type { PendingAttachment } from './PendingAttachmentList'

export function ChatComposer({
  input,
  pendingFiles,
  isLoading,
  isUploading,
  uploadError,
  textareaRef,
  fileInputRef,
  onSubmit,
  onFileSelect,
  onInputChange,
  onInputKeyDown,
  onRemovePendingFile,
  onDismissUploadError,
  onStop,
}: {
  input: string
  pendingFiles: PendingAttachment[]
  isLoading: boolean
  isUploading: boolean
  uploadError: string | null
  textareaRef: RefObject<HTMLTextAreaElement | null>
  fileInputRef: RefObject<HTMLInputElement | null>
  onSubmit: FormEventHandler<HTMLFormElement>
  onFileSelect: ChangeEventHandler<HTMLInputElement>
  onInputChange: (value: string) => void
  onInputKeyDown: KeyboardEventHandler<HTMLTextAreaElement>
  onRemovePendingFile: (key: string) => void
  onDismissUploadError: () => void
  onStop: () => void
}) {
  const isInputDisabled = isLoading || isUploading
  const sendDisabled = !input.trim() && pendingFiles.length === 0
  const placeholder = isUploading
    ? 'Uploading file...'
    : isLoading
      ? 'OpenClaw is responding...'
      : 'Message OpenClaw…'

  return (
    <div className="border-t border-sand-200 bg-sand-50 px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] dark:border-sand-800 dark:bg-sand-950 sm:px-4 sm:py-3">
      <div className="mx-auto max-w-3xl">
        <form onSubmit={onSubmit} className="flex flex-col gap-2">
          <ChatUploadError
            message={uploadError}
            onDismiss={onDismissUploadError}
          />

          <PendingAttachmentList
            files={pendingFiles}
            onRemove={onRemovePendingFile}
          />

          <div className="flex items-end gap-2.5 sm:gap-3">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml,application/pdf,text/plain,text/csv,text/markdown,application/json,application/xml"
              onChange={onFileSelect}
              className="hidden"
            />
            <ChatAttachmentButton
              disabled={isInputDisabled}
              onClick={() => fileInputRef.current?.click()}
            />
            <ChatTextInput
              textareaRef={textareaRef}
              value={input}
              disabled={isInputDisabled}
              placeholder={placeholder}
              onChange={onInputChange}
              onKeyDown={onInputKeyDown}
            />
            {isLoading ? (
              <ChatStopButton onClick={onStop} />
            ) : (
              <ChatSubmitButton disabled={sendDisabled} />
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
