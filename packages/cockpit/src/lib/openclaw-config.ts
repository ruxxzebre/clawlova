import { promises as fs } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function getConfigPath(): string {
  const root = process.env['OPENCLAW_CONFIG_ROOT'] ?? '/home/node/.openclaw'
  return path.join(root, 'openclaw.json')
}

// ---------------------------------------------------------------------------
// Read / Write
// ---------------------------------------------------------------------------

export async function readConfig(): Promise<Record<string, unknown>> {
  const raw = await fs.readFile(getConfigPath(), 'utf8')
  return JSON.parse(raw)
}

export async function writeConfig(config: Record<string, unknown>): Promise<void> {
  await fs.writeFile(getConfigPath(), JSON.stringify(config, null, 2) + '\n', 'utf8')
}

// ---------------------------------------------------------------------------
// Secret masking
// ---------------------------------------------------------------------------

const SECRET_MASK = '••••••••'

export function sanitizeConfig(config: Record<string, unknown>): Record<string, unknown> {
  const out = structuredClone(config)

  // Mask gateway auth token
  const gw = out.gateway as Record<string, unknown> | undefined
  const gwAuth = gw?.auth as Record<string, unknown> | undefined
  if (gwAuth?.token) {
    gwAuth.token = SECRET_MASK
  }

  return out
}

// ---------------------------------------------------------------------------
// Zod schemas (editable sections only)
//
// OpenClaw auth profiles only accept { provider, mode } — no inline API keys.
// API keys come from env vars (e.g. OPENAI_API_KEY).
// ---------------------------------------------------------------------------

const AuthProfileSchema = z.object({
  provider: z.string().min(1),
  mode: z.enum(['api_key', 'oauth', 'token']),
}).passthrough()

const AuthSchema = z.object({
  profiles: z.record(z.string(), AuthProfileSchema),
}).passthrough()

const AgentsDefaultsSchema = z.object({
  model: z.object({
    primary: z.string().min(1),
  }).passthrough(),
  models: z.record(z.string(), z.object({ alias: z.string().optional() }).passthrough()).optional(),
  workspace: z.string().optional(),
}).passthrough()

const AgentsSchema = z.object({
  defaults: AgentsDefaultsSchema,
}).passthrough()

const ToolsSchema = z.object({
  profile: z.string(),
  web: z.object({
    search: z.object({
      enabled: z.boolean(),
      provider: z.string(),
    }).passthrough(),
  }).passthrough(),
}).passthrough()

const GatewaySchema = z.object({
  port: z.number().int().min(1).max(65535),
  bind: z.enum(['loopback', 'lan']),
  auth: z.object({
    mode: z.string().optional(),
    token: z.string().optional(),
  }).passthrough(),
  controlUi: z.object({
    allowedOrigins: z.array(z.string()).optional(),
  }).passthrough().optional(),
}).passthrough()

const PluginsSchema = z.object({
  entries: z.record(z.string(), z.object({ enabled: z.boolean() }).passthrough()),
}).passthrough()

const EditableSectionsSchema = z.object({
  auth: AuthSchema.optional(),
  agents: AgentsSchema.optional(),
  tools: ToolsSchema.optional(),
  gateway: GatewaySchema.optional(),
  plugins: PluginsSchema.optional(),
}).passthrough()

export function validateEditableSections(config: Record<string, unknown>): void {
  const partial: Record<string, unknown> = {}
  for (const key of ['auth', 'agents', 'tools', 'gateway', 'plugins']) {
    if (config[key] !== undefined) partial[key] = config[key]
  }
  EditableSectionsSchema.parse(partial)
}

// ---------------------------------------------------------------------------
// Sanitize config before writing — strip fields OpenClaw doesn't recognize
// ---------------------------------------------------------------------------

function stripUnknownAuthFields(config: Record<string, unknown>): void {
  const auth = config.auth as Record<string, unknown> | undefined
  if (!auth?.profiles) return
  const profiles = auth.profiles as Record<string, Record<string, unknown>>
  const ALLOWED_AUTH_FIELDS = new Set(['provider', 'mode'])
  for (const profile of Object.values(profiles)) {
    for (const key of Object.keys(profile)) {
      if (!ALLOWED_AUTH_FIELDS.has(key)) {
        delete profile[key]
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

const EDITABLE_KEYS = ['auth', 'agents', 'tools', 'gateway', 'plugins'] as const

function deepMerge(target: unknown, source: unknown): unknown {
  if (source === null || source === undefined) return target
  if (typeof source !== 'object' || Array.isArray(source)) return source
  if (typeof target !== 'object' || target === null || Array.isArray(target)) return source

  const tgt = target as Record<string, unknown>
  const src = source as Record<string, unknown>
  const result: Record<string, unknown> = { ...tgt }
  for (const key of Object.keys(src)) {
    result[key] = deepMerge(tgt[key], src[key])
  }
  return result
}

/** Fields whose changes require a gateway restart (not hot-applied). */
const RESTART_FIELDS = ['port', 'bind', 'auth'] as const

export function mergeConfig(
  current: Record<string, unknown>,
  updates: Record<string, unknown>,
): { merged: Record<string, unknown>; restartRequired: boolean } {
  const merged = structuredClone(current)
  let restartRequired = false

  for (const key of EDITABLE_KEYS) {
    if (updates[key] === undefined) continue
    merged[key] = deepMerge(merged[key] ?? {}, updates[key])
  }

  // Preserve masked secrets — gateway token
  const mergedGw = merged.gateway as Record<string, unknown> | undefined
  const mergedGwAuth = mergedGw?.auth as Record<string, unknown> | undefined
  if (mergedGwAuth?.token === SECRET_MASK) {
    const curGw = current.gateway as Record<string, unknown> | undefined
    const curGwAuth = curGw?.auth as Record<string, unknown> | undefined
    mergedGwAuth.token = curGwAuth?.token
  }

  // Strip fields that OpenClaw doesn't recognize in auth profiles
  stripUnknownAuthFields(merged)

  // Detect gateway restart-requiring changes
  if (updates.gateway) {
    const cur = (current.gateway ?? {}) as Record<string, unknown>
    const upd = (merged.gateway ?? {}) as Record<string, unknown>
    for (const field of RESTART_FIELDS) {
      if (JSON.stringify(cur[field]) !== JSON.stringify(upd[field])) {
        restartRequired = true
        break
      }
    }
  }

  return { merged, restartRequired }
}
