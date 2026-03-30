export function ThinkingDots() {
  return (
    <div className="flex gap-1.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current"
          style={{ animationDelay: `${i * 200}ms`, animationDuration: '1.2s' }}
        />
      ))}
    </div>
  )
}
