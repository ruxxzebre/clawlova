import type { StreamChunk, UIMessage } from '@tanstack/ai'
import type { GatewayState, TranslationResult } from './types'
import { asRecord, asString, genId, normalizeFinishReason, stringifyArgs, stringifyResult } from './utils'

export function translateGatewayEvent(
  payload: Record<string, unknown>,
  state: Pick<
    GatewayState,
    'messageId' | 'pendingToolCalls' | 'runId' | 'textContent' | 'textStarted'
  >,
): TranslationResult {
  const timestamp = Date.now()
  const chunks: StreamChunk[] = []
  const stream = asString(payload['stream'])
  const lifecycle = asString(payload['lifecycle'])
  const data = asRecord(payload['data'])

  // Handle "final" messages (e.g. /status, /thinking) — the gateway returns the
  // complete response in a single frame instead of streaming deltas.
  const payloadState = asString(payload['state'])
  const message = asRecord(payload['message'])
  if (payloadState === 'final' && message) {
    const fullText = extractMessageText(message)
    if (fullText) {
      if (!state.textStarted) {
        state.textStarted = true
        chunks.push({
          type: 'TEXT_MESSAGE_START',
          messageId: state.messageId,
          role: 'assistant',
          timestamp,
        })
      }

      state.textContent += fullText
      chunks.push({
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: state.messageId,
        delta: fullText,
        content: state.textContent,
        timestamp,
      })

      chunks.push({
        type: 'TEXT_MESSAGE_END',
        messageId: state.messageId,
        timestamp,
      })

      chunks.push({
        type: 'RUN_FINISHED',
        runId: state.runId,
        model: 'openclaw',
        timestamp,
        finishReason: 'stop',
      })

      return { chunks, finishReason: 'stop', done: true }
    }
  }

  const textDelta =
    asString(data?.['delta']) ??
    asString(data?.['content']) ??
    asString(data?.['text'])
  if (stream === 'assistant' && textDelta) {
    if (!state.textStarted) {
      state.textStarted = true
      chunks.push({
        type: 'TEXT_MESSAGE_START',
        messageId: state.messageId,
        role: 'assistant',
        timestamp,
      })
    }

    state.textContent += textDelta
    chunks.push({
      type: 'TEXT_MESSAGE_CONTENT',
      messageId: state.messageId,
      delta: textDelta,
      content: state.textContent,
      timestamp,
    })
  }

  if (stream === 'tool' && data) {
    const toolCallId =
      asString(data['toolCallId']) ?? asString(data['id']) ?? genId('tool')
    const toolName = asString(data['name']) ?? 'tool'
    const phase = asString(data['phase']) ?? 'unknown'

    if (phase === 'start') {
      const argsText = stringifyArgs(data['args'] ?? data['input'])
      state.pendingToolCalls.set(toolCallId, {
        name: toolName,
        argsText,
        input: data['args'] ?? data['input'],
      })

      chunks.push({
        type: 'TOOL_CALL_START',
        toolCallId,
        toolName,
        parentMessageId: state.messageId,
        timestamp,
      })

      if (argsText) {
        chunks.push({
          type: 'TOOL_CALL_ARGS',
          toolCallId,
          delta: argsText,
          args: argsText,
          timestamp,
        })
      }
    }

    if (phase === 'result' || phase === 'error') {
      const pending = state.pendingToolCalls.get(toolCallId)
      const resultValue =
        data['result'] ?? data['output'] ?? data['error'] ?? data['meta']

      chunks.push({
        type: 'TOOL_CALL_END',
        toolCallId,
        toolName: pending?.name ?? toolName,
        input: pending?.input,
        result: stringifyResult(resultValue),
        timestamp,
      })

      state.pendingToolCalls.delete(toolCallId)
    }
  }

  if (lifecycle === 'end' || asString(data?.['phase']) === 'end') {
    if (state.textStarted) {
      chunks.push({
        type: 'TEXT_MESSAGE_END',
        messageId: state.messageId,
        timestamp,
      })
    }

    const finishReason = normalizeFinishReason(
      asString(payload['finishReason']) ?? asString(data?.['finishReason']),
    )
    chunks.push({
      type: 'RUN_FINISHED',
      runId: state.runId,
      model: 'openclaw',
      timestamp,
      finishReason,
    })

    return {
      chunks,
      finishReason,
      done: true,
    }
  }

  return { chunks }
}

export function extractLatestUserMessageText(
  messages: (UIMessage | null)[],
): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!message || message.role !== 'user') {
      continue
    }

    const legacyContent = (message as { content?: unknown }).content
    if (typeof legacyContent === 'string' && legacyContent.trim()) {
      return legacyContent.trim()
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const text = (message.parts ?? [])
      .filter((part): part is { type: 'text'; content: string } => {
        return part.type === 'text' && typeof part.content === 'string'
      })
      .map((part) => part.content)
      .join('')
      .trim()

    if (text) {
      return text
    }
  }

  return null
}

/** Extract text from a gateway message object with `content: [{type:"text", text:"..."}]` */
function extractMessageText(message: Record<string, unknown>): string | null {
  const content = message['content']
  if (typeof content === 'string') {
    return content.trim() || null
  }
  if (Array.isArray(content)) {
    const text = content
      .filter(
        (part): part is { type: string; text: string } =>
          !!part &&
          typeof part === 'object' &&
          part.type === 'text' &&
          typeof part.text === 'string',
      )
      .map((part) => part.text)
      .join('')
      .trim()
    return text || null
  }
  return null
}
