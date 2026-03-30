import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Cpu } from 'lucide-react'
import { fetchModels } from '#/server/functions'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '#/components/ui/card'
import type { SectionProps } from './shared'
import { inputCls, selectCls, labelCls, parseModelId } from './shared'

export function ModelSection({ form, setForm }: SectionProps) {
  const primary = form.agents?.defaults?.model?.primary ?? ''
  const { provider, modelName } = parseModelId(primary)
  const models = form.agents?.defaults?.models ?? {}
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const alias = models[primary]?.alias ?? ''

  const { data: modelsData, isLoading: modelsLoading } = useQuery<{
    models: string[]
    source: string
  }>({
    queryKey: ['provider-models', provider],
    queryFn: () => fetchModels({ data: { provider } }),
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
          <Cpu className="h-4 w-4 text-terra-500 dark:text-terra-400" />
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
              <div className={inputCls + ' flex items-center text-sand-400'}>
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
