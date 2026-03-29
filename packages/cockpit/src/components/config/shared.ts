// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthProfile {
  provider: string
  type?: string
  mode?: string
  key?: string
  apiKey?: string
  [k: string]: string | undefined
}

export interface ConfigData {
  auth?: { profiles?: Record<string, AuthProfile> }
  agents?: {
    defaults?: {
      model?: { primary?: string; [k: string]: string | undefined }
      models?: Record<string, { alias?: string }>
      workspace?: string
      [k: string]: unknown
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
    [k: string]: unknown
  }
  plugins?: { entries?: Record<string, { enabled: boolean }> }
  [k: string]: unknown
}

export interface SectionProps {
  form: ConfigData
  setForm: React.Dispatch<React.SetStateAction<ConfigData | null>>
}

// ---------------------------------------------------------------------------
// Shared CSS classes
// ---------------------------------------------------------------------------

export const inputCls =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-teal-400 dark:focus:ring-teal-400'

export const selectCls = inputCls + ' appearance-none'

export const labelCls = 'block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1'

export const btnCls =
  'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function parseModelId(primary: string): { provider: string; modelName: string } {
  const idx = primary.indexOf('/')
  if (idx === -1) return { provider: '', modelName: primary }
  return { provider: primary.slice(0, idx), modelName: primary.slice(idx + 1) }
}
