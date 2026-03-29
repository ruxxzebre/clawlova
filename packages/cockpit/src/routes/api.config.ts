import { createFileRoute } from '@tanstack/react-router'
import {
  readConfig,
  writeConfig,
  sanitizeConfig,
  mergeConfig,
  validateEditableSections,
} from '#/lib/openclaw-config'

export const Route = createFileRoute('/api/config')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const config = await readConfig()
          return new Response(JSON.stringify(sanitizeConfig(config)), {
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Failed to read config'
          return new Response(
            JSON.stringify({ error: message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
          )
        }
      },

      PUT: async ({ request }) => {
        try {
          const updates = await request.json()
          const current = await readConfig()
          const { merged, restartRequired } = mergeConfig(current, updates)

          validateEditableSections(merged)
          await writeConfig(merged)

          return new Response(
            JSON.stringify({ ok: true, restartRequired }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        } catch (err: unknown) {
          const isValidation = err instanceof Error && err.name === 'ZodError'
          const message = err instanceof Error ? err.message : 'Failed to write config'
          return new Response(
            JSON.stringify({ error: message }),
            { status: isValidation ? 400 : 500, headers: { 'Content-Type': 'application/json' } },
          )
        }
      },
    },
  },
})
