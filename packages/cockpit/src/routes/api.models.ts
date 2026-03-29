import { createFileRoute } from '@tanstack/react-router'
import { readConfig } from '#/lib/openclaw-config'

interface ModelEntry {
  id: string
  [key: string]: unknown
}

interface ModelsResponse {
  data?: ModelEntry[]
}

interface ProviderConfig {
  baseUrl: string
  headers: (apiKey: string) => Record<string, string>
  extractModels: (data: ModelsResponse) => string[]
}

const PROVIDERS: Record<string, ProviderConfig> = {
  openai: {
    baseUrl: 'https://api.openai.com/v1/models',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    extractModels: (data) =>
      (data?.data ?? [])
        .map((m) => m.id)
        .filter((id) => /^(gpt-|o[1-9]|chatgpt-)/.test(id))
        .sort(),
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1/models',
    headers: (key) => ({
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    }),
    extractModels: (data) =>
      (data?.data ?? []).map((m) => m.id).sort(),
  },
}

// Fallback models when no API key is available or fetch fails
const FALLBACK_MODELS: Record<string, string[]> = {
  openai: [
    'gpt-5.4',
    'gpt-5.2',
    'gpt-5.1-codex',
    'gpt-4.1',
    'gpt-4.1-mini',
    'gpt-4.1-nano',
    'gpt-4o',
    'gpt-4o-mini',
    'o3',
    'o3-mini',
    'o4-mini',
  ],
  anthropic: [
    'claude-opus-4-6',
    'claude-sonnet-4-6',
    'claude-sonnet-4-5-20250514',
    'claude-haiku-4-5-20251001',
    'claude-3-5-sonnet-20241022',
  ],
  google: [
    'gemini-3-pro-preview',
    'gemini-3-flash-preview',
    'gemini-2.5-pro',
    'gemini-2.5-flash',
  ],
  openrouter: ['auto'],
  ollama: ['llama3.3', 'llama3.1', 'codellama', 'mistral', 'deepseek-coder-v2'],
}

export const Route = createFileRoute('/api/models')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const provider = url.searchParams.get('provider') ?? ''

        if (!provider) {
          return new Response(
            JSON.stringify({ error: 'provider query param required' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          )
        }

        const providerConfig = PROVIDERS[provider]
        if (!providerConfig) {
          // No live fetch for this provider — return fallbacks
          return new Response(
            JSON.stringify({
              models: FALLBACK_MODELS[provider] ?? [],
              source: 'fallback',
            }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }

        // Try to get API key from config
        let apiKey: string | undefined
        try {
          const config = await readConfig() as { auth?: { profiles?: Record<string, { key?: string; apiKey?: string }> } }
          const profile = config.auth?.profiles?.[`${provider}:default`]
          apiKey = profile?.key ?? profile?.apiKey
        } catch { /* config unavailable — fall through to env vars */ }

        // Also check env vars as fallback
        if (!apiKey || apiKey === '••••••••') {
          const envKey =
            provider === 'openai'
              ? process.env['OPENAI_API_KEY']
              : provider === 'anthropic'
                ? process.env['ANTHROPIC_API_KEY']
                : undefined
          apiKey = envKey ?? apiKey
        }

        if (!apiKey || apiKey === '••••••••') {
          return new Response(
            JSON.stringify({
              models: FALLBACK_MODELS[provider] ?? [],
              source: 'fallback',
            }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }

        try {
          const res = await fetch(providerConfig.baseUrl, {
            headers: providerConfig.headers(apiKey),
            signal: AbortSignal.timeout(8000),
          })

          if (!res.ok) {
            return new Response(
              JSON.stringify({
                models: FALLBACK_MODELS[provider] ?? [],
                source: 'fallback',
              }),
              { headers: { 'Content-Type': 'application/json' } },
            )
          }

          const data = (await res.json()) as ModelsResponse
          const models = providerConfig.extractModels(data)

          return new Response(JSON.stringify({ models, source: 'live' }), {
            headers: { 'Content-Type': 'application/json' },
          })
        } catch { /* API unreachable — return fallbacks */
          return new Response(
            JSON.stringify({
              models: FALLBACK_MODELS[provider] ?? [],
              source: 'fallback',
            }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
      },
    },
  },
})
