import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import {
  Key,
  Cpu,
  Wrench,
  Globe,
  Plug,
  Save,
  RotateCcw,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  ArrowLeft,
  Eye,
  EyeOff,
} from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '#/components/ui/card'

export const Route = createFileRoute('/config')({
  component: ConfigPage,
})

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuthProfile {
  provider: string
  type?: string
  mode?: string
  key?: string
  apiKey?: string
  [k: string]: any
}

interface ConfigData {
  auth?: { profiles?: Record<string, AuthProfile> }
  agents?: {
    defaults?: {
      model?: { primary?: string; [k: string]: any }
      models?: Record<string, { alias?: string }>
      workspace?: string
      [k: string]: any
    }
  }
  tools?: {
    profile?: string
    web?: { search?: { enabled?: boolean; provider?: string } }
  }
  gateway?: {
    port?: number
    bind?: string
    auth?: { mode?: string; token?: string }
    controlUi?: { allowedOrigins?: string[] }
    [k: string]: any
  }
  plugins?: { entries?: Record<string, { enabled: boolean }> }
  [k: string]: any
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SECRET_MASK = '••••••••'

function parseModelId(primary: string): { provider: string; modelName: string } {
  const idx = primary.indexOf('/')
  if (idx === -1) return { provider: '', modelName: primary }
  return { provider: primary.slice(0, idx), modelName: primary.slice(idx + 1) }
}

// Common input classes
const inputCls =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-teal-400 dark:focus:ring-teal-400'

const selectCls = inputCls + ' appearance-none'

const labelCls = 'block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1'

const btnCls =
  'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function ConfigPage() {
  const queryClient = useQueryClient()

  const { data, isLoading, error: fetchError } = useQuery<ConfigData>({
    queryKey: ['openclaw-config'],
    queryFn: () => fetch('/api/config').then((r) => r.json()),
  })

  const [form, setForm] = useState<ConfigData | null>(null)
  const [banner, setBanner] = useState<{
    type: 'success' | 'warning' | 'error'
    message: string
  } | null>(null)

  // Seed form from fetched data
  useEffect(() => {
    if (data && !form) setForm(structuredClone(data))
  }, [data, form])

  const mutation = useMutation({
    mutationFn: async (updates: ConfigData) => {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      return res.json() as Promise<{ ok: boolean; restartRequired: boolean }>
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['openclaw-config'] })
      setForm(null) // re-seed from fresh fetch
      if (result.restartRequired) {
        setBanner({
          type: 'warning',
          message:
            'Gateway settings changed — restart the OpenClaw container to apply.',
        })
      } else {
        setBanner({
          type: 'success',
          message: 'Configuration saved — changes applied automatically.',
        })
      }
    },
    onError: (err: Error) => {
      setBanner({ type: 'error', message: err.message })
    },
  })

  function handleSave() {
    if (!form) return
    // Only send the editable sections
    const updates: ConfigData = {}
    if (form.auth) updates.auth = form.auth
    if (form.agents) updates.agents = form.agents
    if (form.tools) updates.tools = form.tools
    if (form.gateway) updates.gateway = form.gateway
    if (form.plugins) updates.plugins = form.plugins
    mutation.mutate(updates)
  }

  function handleReset() {
    setForm(data ? structuredClone(data) : null)
    setBanner(null)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Loading configuration…
        </p>
      </div>
    )
  }

  if (fetchError || !form) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-red-500">
          Failed to load configuration: {fetchError?.message ?? 'Unknown error'}
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-6 flex items-center gap-3">
        <Link
          to="/"
          className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            OpenClaw Configuration
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Manage your gateway, model, and plugin settings
          </p>
        </div>
      </div>

      {/* Banner */}
      {banner && <Banner {...banner} onDismiss={() => setBanner(null)} />}

      <div className="space-y-5">
        <AuthSection form={form} setForm={setForm} />
        <ModelSection form={form} setForm={setForm} />
        <ToolsSection form={form} setForm={setForm} />
        <GatewaySection form={form} setForm={setForm} />
        <PluginsSection form={form} setForm={setForm} />
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 mt-6 flex items-center justify-end gap-3 border-t border-slate-200 bg-white/80 py-4 backdrop-blur-lg dark:border-slate-700 dark:bg-slate-900/80">
        <button
          type="button"
          onClick={handleReset}
          className={`${btnCls} border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800`}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={mutation.isPending}
          className={`${btnCls} bg-teal-600 text-white hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600`}
        >
          <Save className="h-3.5 w-3.5" />
          {mutation.isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------

function Banner({
  type,
  message,
  onDismiss,
}: {
  type: 'success' | 'warning' | 'error'
  message: string
  onDismiss: () => void
}) {
  const styles = {
    success:
      'border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
    warning:
      'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    error:
      'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300',
  }
  const Icon =
    type === 'success'
      ? CheckCircle2
      : type === 'warning'
        ? AlertTriangle
        : CircleAlert

  return (
    <div
      className={`mb-5 flex items-start gap-3 rounded-xl border p-4 text-sm ${styles[type]}`}
    >
      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <span className="flex-1">{message}</span>
      <button
        onClick={onDismiss}
        className="ml-2 text-xs opacity-60 hover:opacity-100"
      >
        ✕
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared props
// ---------------------------------------------------------------------------

interface SectionProps {
  form: ConfigData
  setForm: React.Dispatch<React.SetStateAction<ConfigData | null>>
}

// ---------------------------------------------------------------------------
// 1. Auth / API Keys
// ---------------------------------------------------------------------------

const ENV_VAR_HINTS: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  ollama: '(no key needed)',
}

function AuthSection({ form, setForm }: SectionProps) {
  const profiles = form.auth?.profiles ?? {}
  const profileEntries = Object.entries(profiles)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newProvider, setNewProvider] = useState('anthropic')
  const [newMode, setNewMode] = useState<string>('api_key')

  function updateProfileMode(id: string, mode: string) {
    setForm((prev) => {
      if (!prev) return prev
      const next = structuredClone(prev)
      if (next.auth?.profiles?.[id]) {
        next.auth.profiles[id].mode = mode
      }
      return next
    })
  }

  function removeProfile(id: string) {
    setForm((prev) => {
      if (!prev) return prev
      const next = structuredClone(prev)
      if (next.auth?.profiles) delete next.auth.profiles[id]
      return next
    })
  }

  function addProfile() {
    const id = `${newProvider}:default`
    setForm((prev) => {
      if (!prev) return prev
      const next = structuredClone(prev)
      if (!next.auth) next.auth = { profiles: {} }
      if (!next.auth.profiles) next.auth.profiles = {}
      next.auth.profiles[id] = {
        provider: newProvider,
        mode: newMode,
      }
      return next
    })
    setNewProvider('anthropic')
    setNewMode('api_key')
    setShowAddForm(false)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Key className="h-4 w-4 text-teal-600 dark:text-teal-400" />
          <CardTitle>Auth Profiles</CardTitle>
        </div>
        <CardDescription>
          Provider auth configuration. API keys are set via environment variables
          in docker-compose.yml.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {profileEntries.length === 0 && !showAddForm && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No auth profiles configured.
          </p>
        )}

        {profileEntries.map(([id, profile]) => (
          <div
            key={id}
            className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50"
          >
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-3">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {id}
                </p>
                <select
                  value={profile.mode ?? 'api_key'}
                  onChange={(e) => updateProfileMode(id, e.target.value)}
                  className={selectCls + ' w-auto text-xs'}
                >
                  <option value="api_key">API Key</option>
                  <option value="oauth">OAuth</option>
                  <option value="token">Token</option>
                </select>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Set key via env var:{' '}
                <code className="rounded bg-slate-200 px-1 py-0.5 font-mono dark:bg-slate-700">
                  {ENV_VAR_HINTS[profile.provider] ?? `${profile.provider.toUpperCase()}_API_KEY`}
                </code>
              </p>
            </div>
            <button
              type="button"
              onClick={() => removeProfile(id)}
              className="rounded-lg p-2 text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}

        {showAddForm ? (
          <div className="space-y-3 rounded-lg border border-dashed border-teal-300 bg-teal-50/50 p-3 dark:border-teal-700 dark:bg-teal-900/10">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Provider</label>
                <select
                  value={newProvider}
                  onChange={(e) => setNewProvider(e.target.value)}
                  className={selectCls}
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="google">Google</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="ollama">Ollama</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Auth Mode</label>
                <select
                  value={newMode}
                  onChange={(e) => setNewMode(e.target.value)}
                  className={selectCls}
                >
                  <option value="api_key">API Key</option>
                  <option value="oauth">OAuth</option>
                  <option value="token">Token</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={addProfile}
                className={`${btnCls} bg-teal-600 text-white hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600`}
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className={`${btnCls} text-slate-500 hover:text-slate-700 dark:text-slate-400`}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className={`${btnCls} border border-dashed border-slate-300 text-slate-500 hover:border-teal-400 hover:text-teal-600 dark:border-slate-600 dark:text-slate-400 dark:hover:border-teal-500 dark:hover:text-teal-400`}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Provider
          </button>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// 2. Model
// ---------------------------------------------------------------------------

function ModelSection({ form, setForm }: SectionProps) {
  const primary = form.agents?.defaults?.model?.primary ?? ''
  const { provider, modelName } = parseModelId(primary)
  const models = form.agents?.defaults?.models ?? {}
  const alias = models[primary]?.alias ?? ''

  const { data: modelsData, isLoading: modelsLoading } = useQuery<{
    models: string[]
    source: string
  }>({
    queryKey: ['provider-models', provider],
    queryFn: () =>
      fetch(`/api/models?provider=${encodeURIComponent(provider)}`).then((r) =>
        r.json(),
      ),
    enabled: !!provider,
    staleTime: 5 * 60 * 1000,
  })

  const availableModels = modelsData?.models ?? []
  const isLive = modelsData?.source === 'live'

  // Auto-select first model whenever the loaded list doesn't contain the current model
  useEffect(() => {
    if (availableModels.length > 0 && !availableModels.includes(modelName)) {
      updateModel('modelName', availableModels[0])
    }
  }, [availableModels])

  function updateModel(
    field: 'provider' | 'modelName' | 'alias',
    value: string,
  ) {
    setForm((prev) => {
      if (!prev) return prev
      const next = structuredClone(prev)
      if (!next.agents) next.agents = { defaults: { model: { primary: '' } } }
      if (!next.agents.defaults)
        next.agents.defaults = { model: { primary: '' } }
      if (!next.agents.defaults.model)
        next.agents.defaults.model = { primary: '' }

      const cur = parseModelId(next.agents.defaults.model.primary ?? '')
      let p = cur.provider
      let m = cur.modelName
      let a = alias

      if (field === 'provider') {
        p = value
      } else if (field === 'modelName') {
        m = value
      } else {
        a = value
      }

      const newId = p ? `${p}/${m}` : m
      next.agents.defaults.model.primary = newId

      if (!next.agents.defaults.models) next.agents.defaults.models = {}
      const oldId = prev.agents?.defaults?.model?.primary
      if (oldId && oldId !== newId) delete next.agents.defaults.models[oldId]
      next.agents.defaults.models[newId] = { alias: a }

      return next
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-teal-600 dark:text-teal-400" />
          <CardTitle>Model</CardTitle>
        </div>
        <CardDescription>
          Default model for the agent
          {modelsData && (
            <span className="ml-2 text-xs">
              ({isLive ? 'live from provider' : 'fallback list'})
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Provider</label>
            <select
              value={provider}
              onChange={(e) => updateModel('provider', e.target.value)}
              className={selectCls}
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="google">Google</option>
              <option value="openrouter">OpenRouter</option>
              <option value="ollama">Ollama</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Model</label>
            {modelsLoading ? (
              <div className={inputCls + ' flex items-center text-slate-400'}>
                Loading models…
              </div>
            ) : (
              <select
                value={modelName}
                onChange={(e) => updateModel('modelName', e.target.value)}
                className={selectCls}
              >
                {availableModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
                {availableModels.length > 0 && !availableModels.includes(modelName) && (
                  <option value={modelName}>
                    {modelName}
                  </option>
                )}
              </select>
            )}
          </div>
          <div>
            <label className={labelCls}>Alias</label>
            <input
              type="text"
              value={alias}
              onChange={(e) => updateModel('alias', e.target.value)}
              placeholder="GPT"
              className={inputCls}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// 3. Tools
// ---------------------------------------------------------------------------

function ToolsSection({ form, setForm }: SectionProps) {
  const profile = form.tools?.profile ?? 'coding'
  const searchEnabled = form.tools?.web?.search?.enabled ?? true
  const searchProvider = form.tools?.web?.search?.provider ?? 'duckduckgo'

  function update(path: string[], value: any) {
    setForm((prev) => {
      if (!prev) return prev
      const next = structuredClone(prev)
      let obj: any = next
      if (!obj.tools) obj.tools = { profile: 'coding', web: { search: { enabled: true, provider: 'duckduckgo' } } }
      obj = next.tools
      for (let i = 0; i < path.length - 1; i++) {
        if (!obj[path[i]]) obj[path[i]] = {}
        obj = obj[path[i]]
      }
      obj[path[path.length - 1]] = value
      return next
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-teal-600 dark:text-teal-400" />
          <CardTitle>Tools</CardTitle>
        </div>
        <CardDescription>Agent tool profile and web search</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Profile</label>
            <select
              value={profile}
              onChange={(e) => update(['profile'], e.target.value)}
              className={selectCls}
            >
              <option value="coding">Coding</option>
              <option value="general">General</option>
              <option value="minimal">Minimal</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Web Search</label>
            <div className="flex h-[38px] items-center">
              <label className="relative inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={searchEnabled}
                  onChange={(e) =>
                    update(['web', 'search', 'enabled'], e.target.checked)
                  }
                  className="peer sr-only"
                />
                <div className="h-5 w-9 rounded-full bg-slate-300 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:bg-teal-500 peer-checked:after:translate-x-full dark:bg-slate-600 dark:peer-checked:bg-teal-400" />
                <span className="text-sm text-slate-600 dark:text-slate-300">
                  {searchEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </label>
            </div>
          </div>
          <div>
            <label className={labelCls}>Search Provider</label>
            <select
              value={searchProvider}
              onChange={(e) =>
                update(['web', 'search', 'provider'], e.target.value)
              }
              disabled={!searchEnabled}
              className={selectCls}
            >
              <option value="duckduckgo">DuckDuckGo</option>
              <option value="google">Google</option>
              <option value="bing">Bing</option>
            </select>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// 4. Gateway
// ---------------------------------------------------------------------------

function GatewaySection({ form, setForm }: SectionProps) {
  const gw = form.gateway ?? {}
  const port = gw.port ?? 18789
  const bind = gw.bind ?? 'loopback'
  const token = gw.auth?.token ?? ''
  const origins = gw.controlUi?.allowedOrigins ?? []
  const [showToken, setShowToken] = useState(false)

  function updateGateway(updater: (gw: any) => void) {
    setForm((prev) => {
      if (!prev) return prev
      const next = structuredClone(prev)
      if (!next.gateway) next.gateway = {}
      updater(next.gateway)
      return next
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-teal-600 dark:text-teal-400" />
          <CardTitle>Gateway</CardTitle>
        </div>
        <CardDescription>
          Network and auth settings — changes here require a container restart
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Port</label>
            <input
              type="number"
              value={port}
              onChange={(e) =>
                updateGateway((g) => {
                  g.port = Number(e.target.value)
                })
              }
              min={1}
              max={65535}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Bind</label>
            <select
              value={bind}
              onChange={(e) =>
                updateGateway((g) => {
                  g.bind = e.target.value
                })
              }
              className={selectCls}
            >
              <option value="loopback">Loopback (localhost only)</option>
              <option value="lan">LAN (all interfaces)</option>
            </select>
          </div>
        </div>

        <div>
          <label className={labelCls}>Auth Token</label>
          <div className="flex gap-2">
            <input
              type={showToken ? 'text' : 'password'}
              value={token}
              onChange={(e) =>
                updateGateway((g) => {
                  if (!g.auth) g.auth = {}
                  g.auth.token = e.target.value
                })
              }
              placeholder="Gateway authentication token"
              className={inputCls + ' flex-1'}
            />
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"
            >
              {showToken ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        <div>
          <label className={labelCls}>Allowed Origins (one per line)</label>
          <textarea
            value={origins.join('\n')}
            onChange={(e) =>
              updateGateway((g) => {
                if (!g.controlUi) g.controlUi = {}
                g.controlUi.allowedOrigins = e.target.value
                  .split('\n')
                  .map((s: string) => s.trim())
                  .filter(Boolean)
              })
            }
            rows={3}
            placeholder="http://localhost:18789"
            className={inputCls + ' resize-y'}
          />
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// 5. Plugins
// ---------------------------------------------------------------------------

function PluginsSection({ form, setForm }: SectionProps) {
  const entries = form.plugins?.entries ?? {}
  const pluginList = Object.entries(entries)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')

  function togglePlugin(name: string, enabled: boolean) {
    setForm((prev) => {
      if (!prev) return prev
      const next = structuredClone(prev)
      if (!next.plugins) next.plugins = { entries: {} }
      if (!next.plugins.entries) next.plugins.entries = {}
      next.plugins.entries[name] = { ...next.plugins.entries[name], enabled }
      return next
    })
  }

  function removePlugin(name: string) {
    setForm((prev) => {
      if (!prev) return prev
      const next = structuredClone(prev)
      if (next.plugins?.entries) delete next.plugins.entries[name]
      return next
    })
  }

  function addPlugin() {
    const name = newName.trim()
    if (!name) return
    setForm((prev) => {
      if (!prev) return prev
      const next = structuredClone(prev)
      if (!next.plugins) next.plugins = { entries: {} }
      if (!next.plugins.entries) next.plugins.entries = {}
      next.plugins.entries[name] = { enabled: true }
      return next
    })
    setNewName('')
    setShowAddForm(false)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Plug className="h-4 w-4 text-teal-600 dark:text-teal-400" />
          <CardTitle>Plugins</CardTitle>
        </div>
        <CardDescription>Enable or disable gateway plugins</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {pluginList.length === 0 && !showAddForm && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No plugins configured.
          </p>
        )}

        {pluginList.map(([name, entry]) => (
          <div
            key={name}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/50"
          >
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {name}
            </span>
            <div className="flex items-center gap-2">
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={entry.enabled}
                  onChange={(e) => togglePlugin(name, e.target.checked)}
                  className="peer sr-only"
                />
                <div className="h-5 w-9 rounded-full bg-slate-300 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:bg-teal-500 peer-checked:after:translate-x-full dark:bg-slate-600 dark:peer-checked:bg-teal-400" />
              </label>
              <button
                type="button"
                onClick={() => removePlugin(name)}
                className="rounded-lg p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}

        {showAddForm ? (
          <div className="flex items-end gap-3 rounded-lg border border-dashed border-teal-300 bg-teal-50/50 p-3 dark:border-teal-700 dark:bg-teal-900/10">
            <div className="flex-1">
              <label className={labelCls}>Plugin Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. duckduckgo"
                className={inputCls}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addPlugin()
                }}
              />
            </div>
            <button
              type="button"
              onClick={addPlugin}
              disabled={!newName.trim()}
              className={`${btnCls} bg-teal-600 text-white hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600`}
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className={`${btnCls} text-slate-500 hover:text-slate-700 dark:text-slate-400`}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className={`${btnCls} border border-dashed border-slate-300 text-slate-500 hover:border-teal-400 hover:text-teal-600 dark:border-slate-600 dark:text-slate-400 dark:hover:border-teal-500 dark:hover:text-teal-400`}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Plugin
          </button>
        )}
      </CardContent>
    </Card>
  )
}
