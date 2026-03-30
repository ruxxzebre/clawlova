import { Link } from '@tanstack/react-router'
import { Menu, Settings } from 'lucide-react'
import ThemeToggle from './ThemeToggle'

export default function Header({
  onToggleSidebar,
}: {
  onToggleSidebar?: () => void
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-sand-200 dark:border-sand-800 bg-sand-50 dark:bg-sand-950 px-3 sm:px-4">
      <nav className="flex items-center gap-x-2 sm:gap-x-3 py-2.5 sm:py-3">
        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={onToggleSidebar}
          className="rounded-lg p-2 text-sand-500 transition-colors hover:bg-sand-100 hover:text-sand-700 dark:text-sand-400 dark:hover:bg-sand-800 dark:hover:text-sand-200 md:hidden"
          aria-label="Toggle sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>

        <h2 className="m-0 flex-shrink-0 text-base font-semibold tracking-tight">
          <Link
            to="/"
            search={{}}
            className="inline-flex items-center gap-2 px-1 text-sand-800 dark:text-sand-100 no-underline font-display text-lg font-bold tracking-tight"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-terra-500 text-[11px] font-bold text-white">
              C
            </span>
            <span className="hidden sm:inline">Clawlova</span>
          </Link>
        </h2>

        <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
          <Link
            to="/config"
            className="rounded-lg p-2 text-sand-500 transition-colors hover:bg-sand-100 hover:text-sand-700 dark:text-sand-400 dark:hover:bg-sand-800 dark:hover:text-sand-200"
            title="Configuration"
          >
            <Settings className="h-4 w-4" />
          </Link>
          <ThemeToggle />
        </div>
      </nav>
    </header>
  )
}
