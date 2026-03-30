import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark.css'
import { motion } from 'motion/react'

// ---------------------------------------------------------------------------
// Smooth text reveal — buffers streaming tokens and reveals them at a
// steady, adaptive pace using requestAnimationFrame. Uses linear speed
// that scales with buffer depth (not exponential), word-boundary snapping,
// and smoothed acceleration so text flows word-by-word without jarring jumps.
//
// Works for both streaming AND non-streaming text: instant responses still
// get a quick word-by-word reveal instead of popping in all at once.
// ---------------------------------------------------------------------------

function useSmoothedText(
  text: string,
  isStreaming: boolean,
): {
  displayed: string
  isRevealing: boolean
  justFinished: boolean
} {
  // Historical messages (isStreaming=false at mount) start fully revealed.
  // New streaming messages start empty so the rAF loop can reveal them.
  const [displayed, setDisplayed] = useState(() =>
    isStreaming ? '' : text,
  )
  const [justFinished, setJustFinished] = useState(false)
  const [isRevealing, setIsRevealing] = useState(false)
  const targetRef = useRef(text)
  const displayedRef = useRef(isStreaming ? '' : text)
  const wasStreamingRef = useRef(isStreaming)
  const speedRef = useRef(4)

  targetRef.current = text

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

  // Core animation loop — runs whenever displayed is behind target.
  // Works for both streaming (text grows over time) and non-streaming
  // (text arrives fully formed but still gets a reveal animation).
  useEffect(() => {
    const behind = displayedRef.current.length < text.length

    // Nothing to reveal
    if (!behind && !isStreaming) return

    // Very short non-streaming text — just show it, animating 2-3 words
    // looks awkward rather than polished.
    if (!isStreaming && behind && text.length < 20) {
      displayedRef.current = text
      setDisplayed(text)
      return
    }

    let raf: number
    let lastTick = 0
    setIsRevealing(true)

    function tick(now: number) {
      // Throttle to ~30 fps — halves markdown re-parse cost while keeping
      // the visual flow smooth enough for comfortable reading.
      if (now - lastTick >= 32) {
        lastTick = now
        const target = targetRef.current
        const current = displayedRef.current

        if (current.length < target.length) {
          const remaining = target.length - current.length
          const streaming = wasStreamingRef.current

          // Adaptive speed that scales with buffered text.
          // Non-streaming uses faster tiers since all text is available.
          let ideal: number
          if (streaming) {
            if (remaining < 20) {
              ideal = Math.max(1, Math.ceil(remaining * 0.18))
            } else if (remaining < 80) {
              ideal = 3 + remaining / 20
            } else if (remaining < 300) {
              ideal = 6 + remaining / 40
            } else {
              ideal = Math.min(28, 12 + remaining / 60)
            }
          } else {
            // Non-streaming: faster reveal so it feels like a quick unfurl
            if (remaining < 30) {
              ideal = Math.max(2, Math.ceil(remaining * 0.25))
            } else if (remaining < 150) {
              ideal = 5 + remaining / 15
            } else {
              ideal = Math.min(35, 10 + remaining / 40)
            }
          }

          // Smooth speed transitions so acceleration feels natural
          speedRef.current += (ideal - speedRef.current) * 0.25
          const step = Math.max(1, Math.round(speedRef.current))

          let end = Math.min(current.length + step, target.length)

          // Snap to word boundary — look for whitespace in a small window
          // so text appears word-by-word rather than breaking mid-syllable.
          if (end < target.length && step > 1) {
            const ahead = target.slice(end, end + 8)
            const ws = ahead.search(/\s/)
            if (ws >= 0 && ws <= 5) {
              end += ws + 1
            }
          }

          displayedRef.current = target.slice(0, end)
          setDisplayed(displayedRef.current)
        } else if (!wasStreamingRef.current) {
          // Caught up and not streaming — reveal complete
          setIsRevealing(false)
          return
        }
      }

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      setIsRevealing(false)
    }
  }, [isStreaming, text])

  return { displayed, isRevealing, justFinished }
}

export function StreamingText({
  content,
  isStreaming,
}: {
  content: string
  isStreaming: boolean
}) {
  const { displayed, isRevealing, justFinished } = useSmoothedText(
    content,
    isStreaming,
  )
  const showCursor = isStreaming || isRevealing

  return (
    <motion.div
      animate={
        justFinished
          ? { opacity: [0.84, 1], y: [2.5, 0] }
          : { opacity: 1, y: 0 }
      }
      transition={
        justFinished
          ? { duration: 0.4, ease: [0.16, 1, 0.3, 1] }
          : { duration: 0 }
      }
      className={`prose prose-sm prose-chat dark:prose-invert max-w-none leading-snug${showCursor ? ' is-streaming' : ''}`}
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
