import type { StreamChunk, UIMessage, ModelMessage } from '@tanstack/ai'
import type { ConnectConnectionAdapter } from '@tanstack/ai-client'
import { extractLatestUserMessageText } from './openclaw-bridge/translate'

/**
 * Lightweight SSE connection adapter that sends only the latest user message
 * and sessionKey, instead of the full conversation history.
 */
export function liteChatConnection(url: string): ConnectConnectionAdapter {
  return {
    async *connect(
      messages: Array<UIMessage> | Array<ModelMessage>,
      data?: Record<string, any>,
      abortSignal?: AbortSignal,
    ): AsyncIterable<StreamChunk> {
      const message = extractLatestUserMessageText(messages as UIMessage[])
      if (!message) {
        throw new Error('No user message found')
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          sessionKey: data?.sessionKey,
        }),
        credentials: 'same-origin',
        signal: abortSignal,
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('Response body is not readable')
      }

      try {
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          if (abortSignal?.aborted) break
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed) continue
            const payload = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed
            if (payload === '[DONE]') continue
            try {
              yield JSON.parse(payload) as StreamChunk
            } catch {
              console.warn('Failed to parse SSE chunk:', payload)
            }
          }
        }

        if (buffer.trim()) {
          const payload = buffer.trim().startsWith('data: ')
            ? buffer.trim().slice(6)
            : buffer.trim()
          if (payload !== '[DONE]') {
            try {
              yield JSON.parse(payload) as StreamChunk
            } catch {
              // ignore trailing unparseable data
            }
          }
        }
      } finally {
        reader.releaseLock()
      }
    },
  }
}
