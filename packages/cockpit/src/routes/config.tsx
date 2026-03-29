import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { Save, RotateCcw, ArrowLeft } from 'lucide-react'
import type { ConfigData } from '#/components/config/shared'
import { btnCls } from '#/components/config/shared'
import { Banner } from '#/components/config/Banner'
import { AuthSection } from '#/components/config/AuthSection'
import { ModelSection } from '#/components/config/ModelSection'
import { ToolsSection } from '#/components/config/ToolsSection'
import { GatewaySection } from '#/components/config/GatewaySection'
import { PluginsSection } from '#/components/config/PluginsSection'

export const Route = createFileRoute('/config')({
  component: ConfigPage,
})

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
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center gap-3">
          <Link
            to="/"
            search={{}}
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

        {banner && <Banner {...banner} onDismiss={() => setBanner(null)} />}

        <div className="space-y-5">
          <AuthSection form={form} setForm={setForm} />
          <ModelSection form={form} setForm={setForm} />
          <ToolsSection form={form} setForm={setForm} />
          <GatewaySection form={form} setForm={setForm} />
          <PluginsSection form={form} setForm={setForm} />
        </div>

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
    </div>
  )
}
