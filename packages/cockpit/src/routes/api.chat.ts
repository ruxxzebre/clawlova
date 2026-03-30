import { createFileRoute } from '@tanstack/react-router'
import { toServerSentEventsResponse } from '@tanstack/ai'
import { createOpenClawSessionStream } from '#/lib/openclaw-bridge'

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.signal.aborted) {
          return new Response(null, { status: 499 })
        }

        const body = await request.json()
        const messages = body.messages
        const sessionKey: string | undefined = body.data?.sessionKey

        const abortController = new AbortController()
        request.signal.addEventListener('abort', () => abortController.abort(), {
          once: true,
        })

        const stream = createOpenClawSessionStream({
          messages,
          sessionKey,
          abortSignal: abortController.signal,
        })

        return toServerSentEventsResponse(stream, { abortController })
      },
    },
  },
})
