export function ToolSection({
  title,
  content,
  tone = 'default',
}: {
  title: string
  content: string
  tone?: 'default' | 'error'
}) {
  return (
    <section>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-sand-500 dark:text-sand-400">
        {title}
      </div>
      <pre
        className={`overflow-x-auto rounded-lg px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
          tone === 'error'
            ? 'bg-red-500/10 text-red-200'
            : 'bg-sand-900 text-sand-100 dark:bg-sand-950 dark:text-sand-200'
        }`}
      >
        {content}
      </pre>
    </section>
  )
}
