import { createServerFn } from '@tanstack/react-start'
import { listChatSessions, loadSessionMessages } from '#/lib/openclaw-sessions'
import {
  readConfig,
  writeConfig,
  sanitizeConfig,
  mergeConfig,
  validateEditableSections,
} from '#/lib/openclaw-config'

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

type JsonPrimitive = string | number | boolean | null | undefined
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

/** Recursively replace `unknown` with `JsonValue` so TanStack Start accepts it. */
type Serializable<T> =
  T extends JsonPrimitive ? T :
  T extends Date ? string :
  T extends (infer U)[] ? Serializable<U>[] :
  T extends object ? { [K in keyof T]: unknown extends T[K] ? JsonValue : Serializable<T[K]> } :
  JsonValue

/**
 * Type-level narrowing: the data is already JSON-serializable at runtime,
 * but library types use `unknown` which TanStack Start's type checker rejects.
 * This identity function simply narrows the type without any runtime cost.
 */
export function serialize<T>(value: T): Serializable<T> {
  return value as Serializable<T>
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export const listSessions = createServerFn({ method: 'GET' }).handler(
  async () => {
    return listChatSessions()
  },
)

export const loadSession = createServerFn({ method: 'GET' })
  .inputValidator((data: { key: string }) => data)
  .handler(async ({ data }) => {
    return serialize(await loadSessionMessages(data.key))
  })

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const getConfig = createServerFn({ method: 'GET' }).handler(
  async () => {
    const config = await readConfig()
    return serialize(sanitizeConfig(config))
  },
)

export const updateConfig = createServerFn({ method: 'POST' })
  .inputValidator((data: Record<string, JsonValue>) => data)
  .handler(async ({ data }) => {
    const current = await readConfig()
    const { merged, restartRequired } = mergeConfig(current, data)
    validateEditableSections(merged)
    await writeConfig(merged)
    return { ok: true, restartRequired }
  })

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

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

const PROVIDERS: Partial<Record<string, ProviderConfig>> = {
  openai: {
    baseUrl: 'https://api.openai.com/v1/models',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    extractModels: (data) =>
      (data.data ?? [])
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
      (data.data ?? []).map((m) => m.id).sort(),
  },
}

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

export const fetchModels = createServerFn({ method: 'GET' })
  .inputValidator((data: { provider: string }) => data)
  .handler(async ({ data: { provider } }) => {
    const fallback = { models: FALLBACK_MODELS[provider] ?? [], source: 'fallback' as const }

    const providerConfig = PROVIDERS[provider]
    if (!providerConfig) return fallback

    // Try to get API key from config
    let apiKey: string | undefined
    try {
      const config = await readConfig() as { auth?: { profiles?: Record<string, { key?: string; apiKey?: string }> } }
      const profile = config.auth?.profiles?.[`${provider}:default`]
      apiKey = profile?.key ?? profile?.apiKey
    } catch { /* config unavailable */ }

    // Check env vars as fallback
    if (!apiKey || apiKey === '••••••••') {
      const envKey =
        provider === 'openai'
          ? process.env['OPENAI_API_KEY']
          : provider === 'anthropic'
            ? process.env['ANTHROPIC_API_KEY']
            : undefined
      apiKey = envKey ?? apiKey
    }

    if (!apiKey || apiKey === '••••••••') return fallback

    try {
      const res = await fetch(providerConfig.baseUrl, {
        headers: providerConfig.headers(apiKey),
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) return fallback

      const data = (await res.json()) as ModelsResponse
      const models = providerConfig.extractModels(data)
      return { models, source: 'live' as const }
    } catch {
      return fallback
    }
  })

