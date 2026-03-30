import { useState } from 'react'
import { Eye, EyeOff, Globe } from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '#/components/ui/card'
import type { SectionProps, ConfigData } from './shared'
import { inputCls, selectCls, labelCls } from './shared'

export function GatewaySection({ form, setForm }: SectionProps) {
  const gw = form.gateway ?? {}
  const port = gw.port ?? 18789
  const bind = gw.bind ?? 'loopback'
  const token = gw.auth?.token ?? ''
  const origins = gw.controlUi?.allowedOrigins ?? []
  const [showToken, setShowToken] = useState(false)

  function updateGateway(updater: (gw: NonNullable<ConfigData['gateway']>) => void) {
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
          <Globe className="h-4 w-4 text-terra-500 dark:text-terra-400" />
          <CardTitle>Gateway</CardTitle>
        </div>
        <CardDescription>
          Network and auth settings — changes here require a container restart
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              className="rounded-lg border border-sand-200 p-2 text-sand-500 hover:bg-sand-100 dark:border-sand-700 dark:text-sand-400 dark:hover:bg-sand-800"
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
