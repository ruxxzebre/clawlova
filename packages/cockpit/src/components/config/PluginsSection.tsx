import { useState } from 'react'
import { Plug, Plus, Trash2 } from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '#/components/ui/card'
import type { SectionProps } from './shared'
import { inputCls, labelCls, btnCls } from './shared'

export function PluginsSection({ form, setForm }: SectionProps) {
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
