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
        const message: string = body.message
        const sessionKey: string = body.sessionKey

        if (!message || !sessionKey) {
          return new Response(JSON.stringify({ error: 'message and sessionKey are required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const abortController = new AbortController()
        request.signal.addEventListener('abort', () => abortController.abort(), {
          once: true,
        })

        const stream = createOpenClawSessionStream({
          message,
          sessionKey,
          abortSignal: abortController.signal,
        })

        return toServerSentEventsResponse(stream, { abortController })
      },
    },
  },
})
