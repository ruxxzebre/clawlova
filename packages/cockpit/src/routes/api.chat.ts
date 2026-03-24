import { createFileRoute } from '@tanstack/react-router'
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openClawText } from '#/lib/openclaw-adapter'

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.signal.aborted) {
          return new Response(null, { status: 499 })
        }

        const { messages } = await request.json()

        const abortController = new AbortController()
        request.signal.addEventListener('abort', () => abortController.abort(), {
          once: true,
        })

        const stream = chat({
          adapter: openClawText(),
          messages,
          abortController,
        })

        return toServerSentEventsResponse(stream, { abortController })
      },
    },
  },
})
