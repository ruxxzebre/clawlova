import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark.css'
import { motion } from 'motion/react'

// ---------------------------------------------------------------------------
// Smooth text reveal — buffers streaming tokens and reveals them at a
// consistent frame rate using requestAnimationFrame with exponential ease-out.
// Decelerates naturally for the final stretch so the stream "lands" softly.
// ---------------------------------------------------------------------------

function useSmoothedText(text: string, isStreaming: boolean): {
  displayed: string
  justFinished: boolean
} {
  const [displayed, setDisplayed] = useState(text)
  const [justFinished, setJustFinished] = useState(false)
  const targetRef = useRef(text)
  const displayedRef = useRef(text)
  const wasStreamingRef = useRef(isStreaming)

  targetRef.current = text

  // Sync immediately when not streaming
  if (!isStreaming && displayedRef.current !== text) {
    displayedRef.current = text
  }

  // Detect streaming → done transition
  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming) {
      setJustFinished(true)
      const timeout = setTimeout(() => setJustFinished(false), 400)
      wasStreamingRef.current = false
      return () => clearTimeout(timeout)
    }
    wasStreamingRef.current = isStreaming
  }, [isStreaming])

  useEffect(() => {
    if (!isStreaming) {
      setDisplayed(text)
      return
    }

    let raf: number

    function tick() {
      const target = targetRef.current
      const current = displayedRef.current
      if (current.length < target.length) {
        const remaining = target.length - current.length
        // Decelerate for the last ~60 chars: ease down to 15% per frame
        // instead of 35%, so the tail end flows rather than snapping
        const rate = remaining < 60 ? 0.15 : 0.35
        const step = Math.max(1, Math.ceil(remaining * rate))
        const next = target.slice(0, current.length + step)
        displayedRef.current = next
        setDisplayed(next)
      }
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isStreaming])

  return { displayed: isStreaming ? displayed : text, justFinished }
}

export function StreamingText({
  content,
  isStreaming,
}: {
  content: string
  isStreaming: boolean
}) {
  const { displayed, justFinished } = useSmoothedText(content, isStreaming)
  return (
    <motion.div
      animate={
        justFinished
          ? { opacity: [0.88, 1], y: [1.5, 0] }
          : { opacity: 1, y: 0 }
      }
      transition={
        justFinished
          ? { duration: 0.35, ease: [0.16, 1, 0.3, 1] }
          : { duration: 0 }
      }
      className="prose prose-sm prose-chat dark:prose-invert max-w-none leading-snug"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{ hr: () => null }}
      >
        {displayed}
      </ReactMarkdown>
    </motion.div>
  )
}
