import { Wrench } from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '#/components/ui/card'
import type { SectionProps } from './shared'
import { selectCls, labelCls } from './shared'

export function ToolsSection({ form, setForm }: SectionProps) {
  const profile = form.tools?.profile ?? 'coding'
  const searchEnabled = form.tools?.web?.search?.enabled ?? true
  const searchProvider = form.tools?.web?.search?.provider ?? 'duckduckgo'

  function update(path: string[], value: string | boolean) {
    setForm((prev) => {
      if (!prev) return prev
      const next = structuredClone(prev)
      if (!next.tools) next.tools = { profile: 'coding', web: { search: { enabled: true, provider: 'duckduckgo' } } }
      let obj: Record<string, unknown> = next.tools as Record<string, unknown>
      for (let i = 0; i < path.length - 1; i++) {
        if (!obj[path[i]]) obj[path[i]] = {}
        obj = obj[path[i]] as Record<string, unknown>
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
