import { useState } from 'react'
import { Key, Plus, Trash2 } from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '#/components/ui/card'
import type { SectionProps } from './shared'
import { selectCls, labelCls, btnCls } from './shared'

const ENV_VAR_HINTS: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  ollama: '(no key needed)',
}

export function AuthSection({ form, setForm }: SectionProps) {
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
