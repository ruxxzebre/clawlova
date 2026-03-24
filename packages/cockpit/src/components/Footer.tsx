export default function Footer() {
  return (
    <footer className="border-t border-slate-200 dark:border-slate-700 px-4 py-3 text-center text-xs text-slate-500 dark:text-slate-400">
      Clawlova &mdash; powered by{' '}
      <a
        href="https://github.com/openclaw"
        target="_blank"
        rel="noreferrer"
        className="underline hover:text-slate-800 dark:hover:text-slate-100"
      >
        OpenClaw
      </a>
    </footer>
  )
}
