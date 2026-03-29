import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { MessageSquare, PanelLeftClose, PanelLeft, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'

interface ChatSessionSummary {
  sessionKey: string
  sessionId: string
  title: string
  updatedAt: number
  model?: string
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}

export default function ChatSidebar() {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('sidebar-collapsed') === 'true'
  })

  const navigate = useNavigate()
  const routerState = useRouterState()
  const currentSession =
    routerState.location.pathname === '/'
      ? new URLSearchParams(routerState.location.searchStr).get('session')
      : null

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('sidebar-collapsed', String(collapsed))
    }
  }, [collapsed])

  const { data: sessions = [], isLoading } = useQuery<ChatSessionSummary[]>({
    queryKey: ['sessions'],
    queryFn: () => fetch('/api/sessions').then((r) => r.json()),
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  })

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2 border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-2 py-3">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          title="Open sidebar"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => navigate({ to: '/', search: { new: Date.now() } })}
          className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          title="New chat"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <aside className="flex w-64 flex-shrink-0 flex-col border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-3 py-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Chats
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => navigate({ to: '/', search: { new: Date.now() } })}
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            title="New chat"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            title="Collapse sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Session list */}
      <nav className="flex-1 overflow-y-auto px-2 py-2">
        {isLoading && (
          <div className="px-2 py-4 text-center text-xs text-slate-400">
            Loading…
          </div>
        )}

        {!isLoading && sessions.length === 0 && (
          <div className="px-2 py-4 text-center text-xs text-slate-400">
            No chats yet
          </div>
        )}

        <ul className="space-y-0.5">
          {sessions.map((session) => {
            const isActive = currentSession === session.sessionKey
            return (
              <li key={session.sessionKey}>
                <Link
                  to="/"
                  search={{ session: session.sessionKey }}
                  className={`group flex items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
                    isActive
                      ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <MessageSquare className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-400 dark:text-slate-500" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium leading-snug">
                      {session.title}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>{formatRelativeTime(session.updatedAt)}</span>
                      {session.model && (
                        <>
                          <span className="text-slate-300 dark:text-slate-600">·</span>
                          <span className="truncate">{session.model}</span>
                        </>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}
