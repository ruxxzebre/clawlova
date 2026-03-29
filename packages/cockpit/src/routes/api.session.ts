import { createFileRoute } from '@tanstack/react-router'
import { loadSessionMessages } from '#/lib/openclaw-sessions'

export const Route = createFileRoute('/api/session')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url)
          const key = url.searchParams.get('key')
          if (!key) {
            return new Response(
              JSON.stringify({ error: 'Missing "key" query parameter' }),
              { status: 400, headers: { 'Content-Type': 'application/json' } },
            )
          }

          const messages = await loadSessionMessages(key)
          return new Response(JSON.stringify(messages), {
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Failed to load session'
          return new Response(
            JSON.stringify({ error: message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
          )
        }
      },
    },
  },
})
