import type { StreamChunk, TextAdapter, TextOptions } from '@tanstack/ai'

/**
 * Custom TanStack AI adapter for OpenClaw's OpenAI-compatible Chat Completions endpoint.
 *
 * Uses the same pattern as @tanstack/ai-openai / @tanstack/ai-anthropic — the chat()
 * function converts UIMessage[] → ModelMessage[] before calling chatStream(), so this
 * adapter only deals with the simple {role, content} format.
 *
 * Bonus-feature readiness:
 *  - Device auth: Authorization header placeholder (see TODO below)
 *  - Tool call display: emits TOOL_CALL_START/ARGS/END AG-UI events
 *  - Image attachments: convertContent() maps image parts to image_url format
 */

// ── Types ────────────────────────────────────────────────────────────────────

interface ContentPart {
  type: string
  content?: string
  source?: { type: string; value: string; mimeType?: string }
}

interface ToolCall {
  id: string
  type?: string
  function: { name: string; arguments: string | object }
}

interface ModelMessage {
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string | null | ContentPart[]
  toolCalls?: ToolCall[]
  toolCallId?: string
}

type OpenClawProviderOptions = Record<string, never>
type OpenClawMessageMetadataByModality = {
  text: Record<string, never>
  image: Record<string, never>
  audio: Record<string, never>
  video: Record<string, never>
  document: Record<string, never>
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Convert a message's content to OpenAI Chat Completions format.
 * Handles text strings, text parts, and image parts (bonus: image attachments).
 */
function convertContent(
  content: string | null | ContentPart[],
): string | null | Array<Record<string, unknown>> {
  if (content === null) return null
  if (typeof content === 'string') return content

  const parts = content
    .map((p): Record<string, unknown> | null => {
      if (p.type === 'text') return { type: 'text', text: p.content ?? '' }
      if (p.type === 'image' && p.source)
        return { type: 'image_url', image_url: { url: p.source.value } }
      return null
    })
    .filter((p): p is Record<string, unknown> => p !== null)

  if (parts.length === 1 && parts[0]['type'] === 'text') {
    return parts[0]['text'] as string
  }
  return parts
}

/**
 * Convert TanStack AI ModelMessage[] → OpenAI Chat Completions messages array.
 * ModelMessage is already {role, content} format — chat() does UIMessage→ModelMessage first.
 */
function toOpenAIMessages(
  messages: ModelMessage[],
  systemPrompts?: string[],
): unknown[] {
  const result: unknown[] = []

  if (systemPrompts?.length) {
    result.push({ role: 'system', content: systemPrompts.join('\n') })
  }

  for (const msg of messages) {
    if (msg.role === 'tool') {
      result.push({
        role: 'tool',
        tool_call_id: msg.toolCallId ?? '',
        content:
          typeof msg.content === 'string'
            ? msg.content
            : JSON.stringify(msg.content),
      })
      continue
    }

    const entry: Record<string, unknown> = {
      role: msg.role,
      content: convertContent(msg.content),
    }

    if (msg.toolCalls?.length) {
      entry['tool_calls'] = msg.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.function.name,
          arguments:
            typeof tc.function.arguments === 'string'
              ? tc.function.arguments
              : JSON.stringify(tc.function.arguments),
        },
      }))
    }

    result.push(entry)
  }

  return result
}

// ── Adapter class ────────────────────────────────────────────────────────────

export class OpenClawTextAdapter implements TextAdapter<
  'openclaw',
  OpenClawProviderOptions,
  readonly ['text'],
  OpenClawMessageMetadataByModality
> {
  readonly kind = 'text' as const
  readonly name = 'openclaw'
  readonly model = 'openclaw'
  private gatewayUrl: string

  declare '~types': {
    providerOptions: OpenClawProviderOptions
    inputModalities: readonly ['text']
    messageMetadataByModality: OpenClawMessageMetadataByModality
  }

  constructor(config?: { gatewayUrl?: string }) {
    this.gatewayUrl =
      config?.gatewayUrl ??
      (typeof process !== 'undefined'
        ? process.env['OPENCLAW_GATEWAY_URL']
        : undefined) ??
      'http://localhost:18789'
  }

  async *chatStream(
    options: TextOptions<OpenClawProviderOptions>,
  ): AsyncIterable<StreamChunk> {
    const { messages, systemPrompts, request } = options
    const timestamp = Date.now()
    const runId = genId('run')
    const messageId = genId('msg')

    let response: Response
    try {
      response = await fetch(`${this.gatewayUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // TODO: device auth — uncomment and set OPENCLAW_TOKEN when configured:
          // Authorization: `Bearer ${process.env['OPENCLAW_TOKEN']}`,
          Authorization: 'Bearer 84a282e900a37b9eeaaf3fc71416074da9e8de43021008cd',
        },
        body: JSON.stringify({
          model: 'openclaw',
          stream: true,
          messages: toOpenAIMessages(messages, systemPrompts),
        }),
        signal: request?.signal ?? undefined,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error'
      yield { type: 'RUN_ERROR', runId, timestamp: Date.now(), error: { message: msg } }
      return
    }

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText)
      yield {
        type: 'RUN_ERROR',
        runId,
        timestamp: Date.now(),
        error: { message: `OpenClaw ${response.status}: ${text}` },
      }
      return
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let hasEmittedRunStarted = false
    let hasEmittedTextStart = false
    let accumulatedContent = ''

    // Tool call accumulation: delta index → { id, name, args }
    const toolCallState = new Map<
      number,
      { id: string; name: string; args: string }
    >()

    try {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      outer: while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') break outer

          let chunk: Record<string, unknown>
          try {
            chunk = JSON.parse(data)
          } catch {
            continue
          }

          const choices = chunk['choices'] as Array<Record<string, unknown>> | undefined
          const choice = choices?.[0]
          if (!choice) continue

          const delta = (choice['delta'] ?? {}) as Record<string, unknown>
          const finishReason = choice['finish_reason'] as
            | 'stop'
            | 'length'
            | 'content_filter'
            | 'tool_calls'
            | string
            | null
            | undefined

          if (!hasEmittedRunStarted) {
            hasEmittedRunStarted = true
            yield { type: 'RUN_STARTED', runId, model: 'openclaw', timestamp }
          }

          // Text content delta
          const content = delta['content'] as string | undefined
          if (content) {
            if (!hasEmittedTextStart) {
              hasEmittedTextStart = true
              yield { type: 'TEXT_MESSAGE_START', messageId, role: 'assistant', timestamp }
            }
            accumulatedContent += content
            yield {
              type: 'TEXT_MESSAGE_CONTENT',
              messageId,
              delta: content,
              content: accumulatedContent,
              timestamp,
            }
          }

          // Tool call deltas (bonus: tool call display)
          const toolCallDeltas = delta['tool_calls'] as
            | Array<Record<string, unknown>>
            | undefined
          if (toolCallDeltas) {
            for (const tc of toolCallDeltas) {
              const idx = (tc['index'] as number | undefined) ?? 0
              const fn = tc['function'] as Record<string, string> | undefined

              if (tc['id']) {
                const entry = { id: tc['id'] as string, name: fn?.['name'] ?? '', args: '' }
                toolCallState.set(idx, entry)
                yield {
                  type: 'TOOL_CALL_START',
                  toolCallId: entry.id,
                  toolName: entry.name,
                  index: idx,
                  timestamp,
                }
              }

              if (fn?.['arguments']) {
                const entry = toolCallState.get(idx)
                if (entry) {
                  entry.args += fn['arguments']
                  yield { type: 'TOOL_CALL_ARGS', toolCallId: entry.id, delta: fn['arguments'], timestamp }
                }
              }
            }
          }

          // Stream finish
          if (finishReason === 'stop' || finishReason === 'length') {
            if (hasEmittedTextStart) {
              yield { type: 'TEXT_MESSAGE_END', messageId, timestamp }
            }
            yield { type: 'RUN_FINISHED', runId, model: 'openclaw', timestamp, finishReason }
          } else if (finishReason === 'tool_calls') {
            for (const [, tc] of toolCallState) {
              let input: Record<string, unknown> = {}
              try {
                input = JSON.parse(tc.args)
              } catch {
                // keep empty object
              }
              yield { type: 'TOOL_CALL_END', toolCallId: tc.id, toolName: tc.name, input, timestamp }
            }
            yield { type: 'RUN_FINISHED', runId, model: 'openclaw', timestamp, finishReason: 'tool_calls' }
          } else if (finishReason === 'content_filter') {
            if (hasEmittedTextStart) {
              yield { type: 'TEXT_MESSAGE_END', messageId, timestamp }
            }
            yield { type: 'RUN_FINISHED', runId, model: 'openclaw', timestamp, finishReason: 'content_filter' }
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Stream error'
      yield { type: 'RUN_ERROR', runId, timestamp: Date.now(), error: { message: msg } }
    } finally {
      reader.releaseLock()
    }
  }

  async structuredOutput(
    _options: { chatOptions: TextOptions<OpenClawProviderOptions>; outputSchema: unknown },
  ): Promise<{ data: unknown; rawText: string }> {
    throw new Error('OpenClaw adapter does not support structured output')
  }
}

export function openClawText(config?: { gatewayUrl?: string }): OpenClawTextAdapter {
  return new OpenClawTextAdapter(config)
}
