import { describe, it, expect } from 'vitest'
import {
  stripUserEnvelope,
  stripAssistantPrefix,
  translateJsonlToUIMessages,
} from './openclaw-sessions'

// ---------------------------------------------------------------------------
// stripUserEnvelope
// ---------------------------------------------------------------------------

describe('stripUserEnvelope', () => {
  it('strips a full sender envelope', () => {
    const text = [
      'Sender (untrusted metadata):',
      '```json',
      '{ "name": "cockpit" }',
      '```',
      '',
      '[2026-03-29T10:00:00Z] hello world',
    ].join('\n')

    expect(stripUserEnvelope(text)).toBe('hello world')
  })

  it('returns text unchanged when there is no envelope', () => {
    expect(stripUserEnvelope('just a message')).toBe('just a message')
  })

  it('returns empty string for envelope-only input', () => {
    const text = [
      'Sender (untrusted metadata):',
      '```json',
      '{}',
      '```',
      '',
      '[2026-03-29T10:00:00Z] ',
    ].join('\n')

    expect(stripUserEnvelope(text).trim()).toBe('')
  })
})

// ---------------------------------------------------------------------------
// stripAssistantPrefix
// ---------------------------------------------------------------------------

describe('stripAssistantPrefix', () => {
  it('strips [[reply_to_current]] prefix', () => {
    expect(stripAssistantPrefix('[[reply_to_current]] Hello!')).toBe('Hello!')
  })

  it('strips prefix with extra whitespace', () => {
    expect(stripAssistantPrefix('[[reply_to_current]]  Hello!')).toBe('Hello!')
  })

  it('returns text unchanged without the prefix', () => {
    expect(stripAssistantPrefix('No prefix here')).toBe('No prefix here')
  })

  it('handles empty string', () => {
    expect(stripAssistantPrefix('')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// translateJsonlToUIMessages
// ---------------------------------------------------------------------------

function jsonl(...entries: object[]): string[] {
  return entries.map((e) => JSON.stringify(e))
}

describe('translateJsonlToUIMessages', () => {
  it('skips session metadata lines', () => {
    const lines = jsonl(
      { type: 'session', id: 's1', timestamp: '2026-03-29T10:00:00Z' },
    )
    expect(translateJsonlToUIMessages(lines)).toEqual([])
  })

  it('translates a user message', () => {
    const lines = jsonl({
      type: 'message',
      id: 'msg1',
      timestamp: '2026-03-29T10:00:00Z',
      message: {
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
      },
    })

    const result = translateJsonlToUIMessages(lines)
    expect(result).toHaveLength(1)
    expect(result[0].role).toBe('user')
    expect(result[0].parts).toEqual([{ type: 'text', content: 'Hello' }])
  })

  it('strips sender envelope from user messages', () => {
    const wrappedText = [
      'Sender (untrusted metadata):',
      '```json',
      '{ "name": "cockpit" }',
      '```',
      '',
      '[2026-03-29T10:00:00Z] What is the weather?',
    ].join('\n')

    const lines = jsonl({
      type: 'message',
      id: 'msg1',
      timestamp: '2026-03-29T10:00:00Z',
      message: {
        role: 'user',
        content: [{ type: 'text', text: wrappedText }],
      },
    })

    const result = translateJsonlToUIMessages(lines)
    expect(result[0].parts[0]).toEqual({
      type: 'text',
      content: 'What is the weather?',
    })
  })

  it('translates an assistant message and strips prefix', () => {
    const lines = jsonl({
      type: 'message',
      id: 'msg2',
      timestamp: '2026-03-29T10:01:00Z',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: '[[reply_to_current]] The weather is sunny.' }],
      },
    })

    const result = translateJsonlToUIMessages(lines)
    expect(result).toHaveLength(1)
    expect(result[0].role).toBe('assistant')
    expect(result[0].parts[0]).toEqual({
      type: 'text',
      content: 'The weather is sunny.',
    })
  })

  it('handles a tool call and tool result pair', () => {
    const lines = jsonl(
      {
        type: 'message',
        id: 'msg3',
        timestamp: '2026-03-29T10:02:00Z',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'toolCall',
              id: 'tc1',
              name: 'get_weather',
              arguments: '{"city":"NYC"}',
            },
          ],
        },
      },
      {
        type: 'message',
        id: 'msg4',
        timestamp: '2026-03-29T10:02:01Z',
        message: {
          role: 'toolResult',
          toolCallId: 'tc1',
          content: [{ type: 'text', text: 'Sunny, 72°F' }],
        },
      },
    )

    const result = translateJsonlToUIMessages(lines)
    expect(result).toHaveLength(1) // tool result attaches to assistant msg

    const assistantParts = result[0].parts
    expect(assistantParts).toHaveLength(2)
    expect(assistantParts[0]).toMatchObject({
      type: 'tool-call',
      id: 'tc1',
      name: 'get_weather',
    })
    expect(assistantParts[1]).toMatchObject({
      type: 'tool-result',
      toolCallId: 'tc1',
      content: 'Sunny, 72°F',
    })
  })

  it('handles a full conversation with multiple turns', () => {
    const lines = jsonl(
      { type: 'session', id: 's1', timestamp: '2026-03-29T10:00:00Z' },
      {
        type: 'message',
        id: 'msg1',
        timestamp: '2026-03-29T10:00:00Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
      },
      {
        type: 'message',
        id: 'msg2',
        timestamp: '2026-03-29T10:00:01Z',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: '[[reply_to_current]] Hello!' }],
        },
      },
      {
        type: 'message',
        id: 'msg3',
        timestamp: '2026-03-29T10:01:00Z',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'How are you?' }],
        },
      },
      {
        type: 'message',
        id: 'msg4',
        timestamp: '2026-03-29T10:01:01Z',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: '[[reply_to_current]] I am doing well!' }],
        },
      },
    )

    const result = translateJsonlToUIMessages(lines)
    expect(result).toHaveLength(4)
    expect(result.map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
    ])
  })

  it('skips malformed JSON lines gracefully', () => {
    const lines = [
      'this is not json',
      JSON.stringify({
        type: 'message',
        id: 'msg1',
        timestamp: '2026-03-29T10:00:00Z',
        message: { role: 'user', content: [{ type: 'text', text: 'hello' }] },
      }),
      '{broken json',
    ]

    const result = translateJsonlToUIMessages(lines)
    expect(result).toHaveLength(1)
    expect(result[0].parts[0]).toEqual({ type: 'text', content: 'hello' })
  })

  it('marks tool result errors', () => {
    const lines = jsonl(
      {
        type: 'message',
        id: 'msg1',
        timestamp: '2026-03-29T10:00:00Z',
        message: {
          role: 'assistant',
          content: [{ type: 'toolCall', id: 'tc1', name: 'failing_tool', arguments: '{}' }],
        },
      },
      {
        type: 'message',
        id: 'msg2',
        timestamp: '2026-03-29T10:00:01Z',
        message: {
          role: 'toolResult',
          toolCallId: 'tc1',
          isError: true,
          content: [{ type: 'text', text: 'Permission denied' }],
        },
      },
    )

    const result = translateJsonlToUIMessages(lines)
    const toolResult = result[0].parts[1]
    expect(toolResult).toMatchObject({
      type: 'tool-result',
      state: 'error',
      content: 'Permission denied',
    })
  })
})
