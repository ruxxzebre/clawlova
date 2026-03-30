import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getConfig, updateConfig, serialize } from '#/server/functions'
import { useState, useEffect } from 'react'
import { Save, RotateCcw, ArrowLeft, ChevronDown, Info } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
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
    queryFn: () => getConfig(),
  })

  const [form, setForm] = useState<ConfigData | null>(null)
  const [banner, setBanner] = useState<{
    type: 'success' | 'warning' | 'error'
    message: string
  } | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)

  useEffect(() => {
    if (data && !form) setForm(structuredClone(data))
  }, [data, form])

  const isDirty = form && data ? JSON.stringify(form) !== JSON.stringify(data) : false

  const mutation = useMutation({
    mutationFn: (updates: ConfigData) =>
      updateConfig({ data: serialize(updates) }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['openclaw-config'] })
      setForm(null)
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
        <p className="text-sm text-sand-500 dark:text-sand-400">
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
    <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-4 sm:py-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center gap-3">
          <Link
            to="/"
            search={{}}
            className="rounded-lg p-2 text-sand-500 transition-colors hover:bg-sand-100 hover:text-sand-700 dark:text-sand-400 dark:hover:bg-sand-800 dark:hover:text-sand-200"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="font-display text-lg font-bold text-sand-800 dark:text-sand-100">
              Configuration
            </h1>
            <p className="text-sm text-sand-500 dark:text-sand-400">
              Set up your provider and model to get started
            </p>
          </div>
        </div>

        {/* API key hint */}
        <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-sand-200 dark:border-sand-800 bg-sand-100 dark:bg-sand-900 px-4 py-3 text-sm text-sand-600 dark:text-sand-400">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-sand-400 dark:text-sand-500" />
          <p>
            API keys for your providers must be set as environment variables in{' '}
            <code className="rounded bg-sand-200 dark:bg-sand-800 px-1 py-0.5 font-mono text-xs">.env</code>{' '}
            before starting the container. This page configures which providers and models to use.
          </p>
        </div>

        <AnimatePresence>
          {banner && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <Banner {...banner} onDismiss={() => setBanner(null)} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Essential settings */}
        <div className="space-y-5">
          <AuthSection form={form} setForm={setForm} />
          <ModelSection form={form} setForm={setForm} />
          <ToolsSection form={form} setForm={setForm} />
        </div>

        {/* Advanced settings — collapsed by default */}
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex w-full items-center gap-2 rounded-lg py-2 text-sm font-medium text-sand-500 transition-colors hover:text-sand-700 dark:text-sand-400 dark:hover:text-sand-200"
          >
            <motion.div animate={{ rotate: showAdvanced ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown className="h-4 w-4" />
            </motion.div>
            Advanced settings
            <span className="flex-1 border-b border-sand-200 dark:border-sand-800" />
          </button>
          <AnimatePresence initial={false}>
            {showAdvanced && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <div className="mt-4 space-y-5">
                  <GatewaySection form={form} setForm={setForm} />
                  <PluginsSection form={form} setForm={setForm} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Sticky action bar — only shown when dirty */}
        <AnimatePresence>
          {isDirty && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="sticky bottom-0 mt-6 flex items-center justify-end gap-3 border-t border-sand-200 bg-sand-50 py-4 dark:border-sand-800 dark:bg-sand-950"
            >
              <button
                type="button"
                onClick={handleReset}
                className={`${btnCls} border border-sand-200 text-sand-600 hover:bg-sand-100 dark:border-sand-700 dark:text-sand-300 dark:hover:bg-sand-800`}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
              <motion.button
                type="button"
                onClick={handleSave}
                disabled={mutation.isPending}
                whileTap={{ scale: 0.97 }}
                className={`${btnCls} bg-terra-500 text-white hover:bg-terra-600 dark:bg-terra-600 dark:hover:bg-terra-500`}
              >
                <Save className="h-3.5 w-3.5" />
                {mutation.isPending ? 'Saving…' : 'Save Changes'}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
