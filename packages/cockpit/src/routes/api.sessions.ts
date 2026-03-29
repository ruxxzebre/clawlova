import { createFileRoute } from '@tanstack/react-router'
import { listChatSessions } from '#/lib/openclaw-sessions'

export const Route = createFileRoute('/api/sessions')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const sessions = await listChatSessions()
          return new Response(JSON.stringify(sessions), {
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (err: any) {
          return new Response(
            JSON.stringify({ error: err.message ?? 'Failed to list sessions' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
          )
        }
      },
    },
  },
})
