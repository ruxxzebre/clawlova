import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { UIMessage } from '@tanstack/ai'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatSessionSummary {
  sessionKey: string
  sessionId: string
  title: string
  updatedAt: number
  model?: string
}

interface SessionIndexEntry {
  sessionId: string
  updatedAt: number
  sessionFile: string
  status?: string
  model?: string
  modelProvider?: string
}

interface JsonlMessage {
  role: string
  content?: Array<{
    type: string
    text?: string
    id?: string
    name?: string
    arguments?: unknown
    partialJson?: string
  }>
  toolCallId?: string
  toolName?: string
  isError?: boolean
  timestamp?: number
}

interface JsonlEntry {
  type: string
  id: string
  timestamp: string
  message?: JsonlMessage
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function getConfigRoot(): string {
  return process.env['OPENCLAW_CONFIG_ROOT'] ?? '/openclaw-config'
}

function getSessionsDir(): string {
  return path.join(getConfigRoot(), 'agents', 'main', 'sessions')
}

/**
 * Remap the internal container path stored in sessions.json to the path
 * accessible by the cockpit container.
 *
 * sessions.json stores paths like `/home/node/.openclaw/agents/main/sessions/xxx.jsonl`
 * but in the cockpit container the volume is mounted at OPENCLAW_CONFIG_ROOT.
 */
function remapSessionFile(sessionFile: string): string {
  const suffix = sessionFile.replace(/^\/home\/node\/\.openclaw\//, '')
  return path.join(getConfigRoot(), suffix)
}

// ---------------------------------------------------------------------------
// Envelope / prefix stripping
// ---------------------------------------------------------------------------

const SENDER_ENVELOPE_RE =
  /^Sender \(untrusted metadata\):[\s\S]*?\n\n\[.*?\]\s*/

/**
 * Strip the OpenClaw sender envelope from user messages.
 * The format is:
 *   Sender (untrusted metadata):
 *   ```json
 *   { ... }
 *   ```
 *
 *   [Timestamp] actual message
 */
export function stripUserEnvelope(text: string): string {
  return text.replace(SENDER_ENVELOPE_RE, '')
}

/**
 * Strip the `[[reply_to_current]]` prefix from assistant messages.
 */
export function stripAssistantPrefix(text: string): string {
  return text.replace(/^\[\[reply_to_current\]\]\s*/, '')
}

// ---------------------------------------------------------------------------
// List chat sessions
// ---------------------------------------------------------------------------

export async function listChatSessions(): Promise<ChatSessionSummary[]> {
  const dir = getSessionsDir()
  const indexPath = path.join(dir, 'sessions.json')

  let raw: string
  try {
    raw = await fs.readFile(indexPath, 'utf8')
  } catch {
    return []
  }

  const index: Record<string, SessionIndexEntry> = JSON.parse(raw)
  const summaries: ChatSessionSummary[] = []

  for (const [key, entry] of Object.entries(index)) {
    if (!key.startsWith('agent:main:chat-')) continue

    const filePath = remapSessionFile(entry.sessionFile)
    const title = await getSessionTitle(filePath)

    summaries.push({
      sessionKey: key,
      sessionId: entry.sessionId,
      title,
      updatedAt: entry.updatedAt,
      model: entry.model,
    })
  }

  summaries.sort((a, b) => b.updatedAt - a.updatedAt)
  return summaries
}

// ---------------------------------------------------------------------------
// Get session title (first user message text)
// ---------------------------------------------------------------------------

async function getSessionTitle(filePath: string): Promise<string> {
  let raw: string
  try {
    raw = await fs.readFile(filePath, 'utf8')
  } catch {
    return 'Untitled chat'
  }

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      const entry: JsonlEntry = JSON.parse(line)
      if (entry.type !== 'message' || entry.message?.role !== 'user') continue

      const textPart = entry.message.content?.find((p) => p.type === 'text')
      if (!textPart?.text) continue

      const clean = stripUserEnvelope(textPart.text).trim()
      if (!clean) continue
      return clean.length > 80 ? clean.slice(0, 80) + '…' : clean
    } catch {
      continue
    }
  }

  return 'Untitled chat'
}

// ---------------------------------------------------------------------------
// Load full session messages
// ---------------------------------------------------------------------------

export async function loadSessionMessages(
  sessionKey: string,
): Promise<UIMessage[]> {
  const dir = getSessionsDir()
  const indexPath = path.join(dir, 'sessions.json')

  let raw: string
  try {
    raw = await fs.readFile(indexPath, 'utf8')
  } catch {
    return []
  }

  const index: Record<string, SessionIndexEntry> = JSON.parse(raw)
  const entry = index[sessionKey]
  if (!entry) return []

  const filePath = remapSessionFile(entry.sessionFile)
  let fileContent: string
  try {
    fileContent = await fs.readFile(filePath, 'utf8')
  } catch {
    return []
  }

  const lines = fileContent.split('\n').filter((l) => l.trim())
  return translateJsonlToUIMessages(lines)
}

// ---------------------------------------------------------------------------
// JSONL → UIMessage translation
// ---------------------------------------------------------------------------

export function translateJsonlToUIMessages(lines: string[]): UIMessage[] {
  const messages: UIMessage[] = []
  let currentAssistant: UIMessage | null = null

  for (const line of lines) {
    let entry: JsonlEntry
    try {
      entry = JSON.parse(line)
    } catch {
      // Skip malformed lines (e.g. partial writes)
      continue
    }

    if (entry.type !== 'message' || !entry.message) continue

    const msg = entry.message
    const timestamp = entry.timestamp
      ? new Date(entry.timestamp)
      : msg.timestamp
        ? new Date(msg.timestamp)
        : undefined

    if (msg.role === 'user') {
      // Flush any pending assistant message
      currentAssistant = null

      const parts: UIMessage['parts'] = []
      for (const part of msg.content ?? []) {
        if (part.type === 'text' && part.text) {
          parts.push({ type: 'text', content: stripUserEnvelope(part.text) })
        }
      }

      if (parts.length > 0) {
        messages.push({
          id: entry.id,
          role: 'user',
          parts,
          createdAt: timestamp,
        })
      }
    } else if (msg.role === 'assistant') {
      const parts: UIMessage['parts'] = []

      for (const part of msg.content ?? []) {
        if (part.type === 'text' && part.text) {
          const cleaned = stripAssistantPrefix(part.text)
          if (cleaned) {
            parts.push({ type: 'text', content: cleaned })
          }
        } else if (part.type === 'toolCall' && part.id && part.name) {
          parts.push({
            type: 'tool-call',
            id: part.id,
            name: part.name,
            arguments: typeof part.arguments === 'string'
              ? part.arguments
              : JSON.stringify(part.arguments ?? {}),
            state: 'input-complete' as const,
          } as UIMessage['parts'][number])
        }
      }

      if (parts.length > 0) {
        const newHasText = parts.some((p) => p.type === 'text')
        const newIsToolOnly = !newHasText
        const prevHasText = currentAssistant?.parts.some((p) => p.type === 'text')

        // Merge tool-call-only entries into the current assistant message,
        // and merge into a following text message if no text was emitted yet.
        // But keep sequential text messages as separate bubbles.
        if (currentAssistant && (newIsToolOnly || !prevHasText)) {
          currentAssistant.parts.push(...parts)
        } else {
          currentAssistant = {
            id: entry.id,
            role: 'assistant',
            parts,
            createdAt: timestamp,
          }
          messages.push(currentAssistant)
        }
      }
    } else if (msg.role === 'toolResult') {
      // Attach tool result to the most recent assistant message
      if (currentAssistant && msg.toolCallId) {
        const resultText =
          msg.content
            ?.filter(
              (p): p is { type: string; text: string } =>
                p.type === 'text' && typeof p.text === 'string',
            )
            .map((p) => p.text)
            .join('\n') ?? ''

        currentAssistant.parts.push({
          type: 'tool-result',
          toolCallId: msg.toolCallId,
          content: resultText,
          state: msg.isError ? ('error' as const) : ('complete' as const),
        } as UIMessage['parts'][number])
      }
    }
  }

  return messages
}
