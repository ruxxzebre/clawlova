import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { listSessions } from '#/server/functions'
import { MessageSquare, MoreHorizontal, PanelLeftClose, PanelLeft, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'

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

export default function ChatSidebar({
  onNavigate,
}: {
  onNavigate?: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)

  // Sync from localStorage after hydration
  useEffect(() => {
    const stored = window.localStorage.getItem('sidebar-collapsed')
    if (stored === 'true') setCollapsed(true)
  }, [])
  const [searchQuery, setSearchQuery] = useState('')
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

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

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  const { data: sessions = [], isLoading } = useQuery<ChatSessionSummary[]>({
    queryKey: ['sessions'],
    queryFn: () => listSessions(),
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  })

  const filteredSessions = searchQuery
    ? sessions.filter((s) => s.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : sessions

  const showSearch = sessions.length > 6

  function handleRename(_sessionKey: string) {
    // TODO: implement rename
    setMenuOpen(null)
  }

  function handleDelete(_sessionKey: string) {
    // TODO: implement delete
    setMenuOpen(null)
  }

  if (collapsed) {
    return (
      <div className="hidden md:flex h-full flex-col items-center gap-2 border-r border-sand-200 dark:border-sand-800 bg-sand-100 dark:bg-sand-900 px-2 py-3">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="rounded-lg p-2 text-sand-500 transition-colors hover:bg-sand-200 hover:text-sand-700 dark:text-sand-400 dark:hover:bg-sand-800 dark:hover:text-sand-200"
          title="Open sidebar"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            navigate({ to: '/', search: { new: Date.now() } })
            onNavigate?.()
          }}
          className="rounded-lg p-2 text-sand-500 transition-colors hover:bg-sand-200 hover:text-sand-700 dark:text-sand-400 dark:hover:bg-sand-800 dark:hover:text-sand-200"
          title="New chat (⌘N)"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <aside className="flex h-full w-64 flex-shrink-0 flex-col border-r border-sand-200 dark:border-sand-800 bg-sand-100 dark:bg-sand-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-sand-200 dark:border-sand-800 px-3 py-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-sand-500 dark:text-sand-400">
          Chats
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              navigate({ to: '/', search: { new: Date.now() } })
              onNavigate?.()
            }}
            className="rounded-lg p-1.5 text-sand-500 transition-colors hover:bg-sand-200 hover:text-sand-700 dark:text-sand-400 dark:hover:bg-sand-800 dark:hover:text-sand-200"
            title="New chat (⌘N)"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="hidden md:inline-flex rounded-lg p-1.5 text-sand-500 transition-colors hover:bg-sand-200 hover:text-sand-700 dark:text-sand-400 dark:hover:bg-sand-800 dark:hover:text-sand-200"
            title="Collapse sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Search */}
      {showSearch && (
        <div className="border-b border-sand-200 dark:border-sand-800 px-3 py-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-sand-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search chats…"
              className="w-full rounded-lg bg-sand-200/50 dark:bg-sand-800/50 py-1.5 pl-8 pr-3 text-xs text-sand-700 dark:text-sand-200 placeholder:text-sand-400 outline-none focus:bg-sand-200 dark:focus:bg-sand-800"
            />
          </div>
        </div>
      )}

      {/* Session list */}
      <nav className="flex-1 overflow-y-auto px-2 py-2">
        {isLoading && (
          <div className="px-2 py-4 text-center text-xs text-sand-400">
            Loading…
          </div>
        )}

        {!isLoading && sessions.length === 0 && (
          <div className="px-2 py-4 text-center text-xs text-sand-400">
            No chats yet
          </div>
        )}

        {!isLoading && searchQuery && filteredSessions.length === 0 && (
          <div className="px-2 py-4 text-center text-xs text-sand-400">
            No matches
          </div>
        )}

        <ul className="space-y-0.5">
          {filteredSessions.map((session) => {
            const isActive = currentSession === session.sessionKey
            return (
              <li key={session.sessionKey} className="relative">
                <Link
                  to="/"
                  search={{ session: session.sessionKey }}
                  onClick={() => onNavigate?.()}
                  className={`group flex items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
                    isActive
                      ? 'bg-sand-200 dark:bg-sand-800 text-sand-900 dark:text-sand-100'
                      : 'text-sand-700 dark:text-sand-300 hover:bg-sand-200/60 dark:hover:bg-sand-800/50'
                  }`}
                >
                  <MessageSquare className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-sand-400 dark:text-sand-500" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium leading-snug">
                      {session.title}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-sand-500 dark:text-sand-400">
                      <span>{formatRelativeTime(session.updatedAt)}</span>
                      {session.model && (
                        <>
                          <span className="text-sand-300 dark:text-sand-600">·</span>
                          <span className="truncate">{session.model}</span>
                        </>
                      )}
                    </div>
                  </div>
                  {/* Context menu trigger */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setMenuOpen(menuOpen === session.sessionKey ? null : session.sessionKey)
                    }}
                    className="mt-0.5 rounded p-1.5 -m-1 text-sand-400 opacity-100 md:opacity-0 transition-opacity group-hover:opacity-100 hover:text-sand-600 dark:text-sand-500 dark:hover:text-sand-300"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                </Link>

                {/* Context menu */}
                <AnimatePresence>
                  {menuOpen === session.sessionKey && (
                    <motion.div
                      ref={menuRef}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.12 }}
                      className="absolute right-1 top-full z-20 mt-0.5 w-36 overflow-hidden rounded-lg border border-sand-200 dark:border-sand-700 bg-sand-50 dark:bg-sand-800 shadow-lg"
                    >
                      <button
                        type="button"
                        onClick={() => handleRename(session.sessionKey)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-sand-700 dark:text-sand-200 hover:bg-sand-100 dark:hover:bg-sand-700 transition-colors"
                      >
                        <Pencil className="h-3 w-3" />
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(session.sessionKey)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}
