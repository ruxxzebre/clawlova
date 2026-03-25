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
        } catch (err: any) {
          return new Response(
            JSON.stringify({ error: err.message ?? 'Failed to read config' }),
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
        } catch (err: any) {
          const status = err.name === 'ZodError' ? 400 : 500
          return new Response(
            JSON.stringify({ error: err.message ?? 'Failed to write config' }),
            { status, headers: { 'Content-Type': 'application/json' } },
          )
        }
      },
    },
  },
})
