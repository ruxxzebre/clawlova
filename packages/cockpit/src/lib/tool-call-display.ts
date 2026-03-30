import type {
  MessagePart,
  ToolCallPart,
  ToolCallState,
  ToolResultPart,
  ToolResultState,
} from '@tanstack/ai'

export type ToolDisplayStatus =
  | 'running'
  | 'waiting-for-output'
  | 'completed'
  | 'error'

export interface ToolCallViewModel {
  id: string
  name: string
  rawArguments: string
  parsedArguments?: unknown
  status: ToolDisplayStatus
  statusLabel: string
  inputState: ToolCallState
  outputState?: ToolResultState
  output?: unknown
  error?: string
}

export type MessageDisplayPart =
  | { type: 'text'; content: string }
  | { type: 'thinking'; content: string }
  | { type: 'tool-call'; toolCall: ToolCallViewModel }

export function buildMessageDisplayParts(
  parts: MessagePart[],
): MessageDisplayPart[] {
  const displayParts: MessageDisplayPart[] = []
  const toolCalls = new Map<string, ToolCallViewModel>()
  let accumulatedText = ''

  for (const part of parts) {
    if (part.type === 'text') {
      // During streaming, text parts after tool calls may contain the full
      // accumulated text (including text already rendered before the tool
      // calls). Strip the already-shown prefix to avoid duplication.
      let content = part.content
      if (accumulatedText && content.startsWith(accumulatedText)) {
        content = content.slice(accumulatedText.length)
      }
      accumulatedText = part.content
      if (content) {
        displayParts.push({ type: 'text', content })
      }
      continue
    }

    if (part.type === 'thinking') {
      if (part.content) {
        displayParts.push({ type: 'thinking', content: part.content })
      }
      continue
    }

    if (part.type === 'tool-call') {
      upsertToolCall(displayParts, toolCalls, part)
      continue
    }

    if (part.type === 'tool-result') {
      attachToolResult(displayParts, toolCalls, part)
    }
  }

  return displayParts
}

export function formatDisplayValue(value: unknown): string {
  if (value === undefined) return ''
  if (typeof value === 'string') {
    const parsed = safeParseJson(value)
    if (parsed !== undefined) {
      return JSON.stringify(parsed, null, 2)
    }
    return value
  }
  return JSON.stringify(value, null, 2)
}

function upsertToolCall(
  displayParts: MessageDisplayPart[],
  toolCalls: Map<string, ToolCallViewModel>,
  part: ToolCallPart,
): void {
  const existing = toolCalls.get(part.id)
  const next: ToolCallViewModel = {
    id: part.id,
    name: part.name,
    rawArguments: part.arguments,
    parsedArguments: safeParseJson(part.arguments),
    status: normalizeToolStatus(part.state, part.output, existing?.outputState),
    statusLabel: normalizeToolStatusLabel(
      part.state,
      part.output,
      existing?.outputState,
    ),
    inputState: part.state,
    outputState: existing?.outputState,
    output: part.output ?? existing?.output,
    error: existing?.error,
  }

  if (existing) {
    Object.assign(existing, next)
    return
  }

  toolCalls.set(part.id, next)
  displayParts.push({ type: 'tool-call', toolCall: next })
}

function attachToolResult(
  displayParts: MessageDisplayPart[],
  toolCalls: Map<string, ToolCallViewModel>,
  part: ToolResultPart,
): void {
  const existing = toolCalls.get(part.toolCallId)
  const output = safeParseJson(part.content) ?? part.content
  const status = normalizeToolStatus(
    existing?.inputState ?? 'input-complete',
    output,
    part.state,
    part.error,
  )
  const statusLabel = normalizeToolStatusLabel(
    existing?.inputState ?? 'input-complete',
    output,
    part.state,
    part.error,
  )

  if (existing) {
    existing.output = output
    existing.error = part.error
    existing.outputState = part.state
    existing.status = status
    existing.statusLabel = statusLabel
    return
  }

  const fallback: ToolCallViewModel = {
    id: part.toolCallId,
    name: 'tool',
    rawArguments: '',
    status,
    statusLabel,
    inputState: 'input-complete',
    outputState: part.state,
    output,
    error: part.error,
  }

  toolCalls.set(part.toolCallId, fallback)
  displayParts.push({ type: 'tool-call', toolCall: fallback })
}

function normalizeToolStatus(
  inputState: ToolCallState,
  output?: unknown,
  outputState?: ToolResultState,
  error?: string,
): ToolDisplayStatus {
  if (error || outputState === 'error') {
    return 'error'
  }
  if (output !== undefined || outputState === 'complete') {
    return 'completed'
  }
  if (inputState === 'awaiting-input' || inputState === 'input-streaming') {
    return 'running'
  }
  return 'waiting-for-output'
}

function normalizeToolStatusLabel(
  inputState: ToolCallState,
  output?: unknown,
  outputState?: ToolResultState,
  error?: string,
): string {
  const status = normalizeToolStatus(inputState, output, outputState, error)
  if (status === 'running') return 'Running'
  if (status === 'completed') return 'Completed'
  if (status === 'error') return 'Error'
  return 'Waiting for output'
}

function safeParseJson(value: string): unknown | undefined {
  if (!value.trim()) {
    return undefined
  }

  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}
