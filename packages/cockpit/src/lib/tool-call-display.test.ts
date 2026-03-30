import { describe, expect, it } from 'vitest'
import type { MessagePart } from '@tanstack/ai'
import {
  buildMessageDisplayParts,
  formatDisplayValue,
} from './tool-call-display'

describe('buildMessageDisplayParts', () => {
  it('keeps text parts and groups matching tool call output', () => {
    const parts = [
      { type: 'text', content: 'Before tool' },
      {
        type: 'tool-call',
        id: 'tool-1',
        name: 'web.search',
        arguments: '{"q":"openclaw"}',
        state: 'input-complete',
      },
      {
        type: 'tool-result',
        toolCallId: 'tool-1',
        content: '{"results":[1,2,3]}',
        state: 'complete',
      },
      { type: 'text', content: 'After tool' },
    ] satisfies MessagePart[]

    const displayParts = buildMessageDisplayParts(parts)

    expect(displayParts).toHaveLength(3)
    expect(displayParts[0]).toEqual({ type: 'text', content: 'Before tool' })
    expect(displayParts[2]).toEqual({ type: 'text', content: 'After tool' })

    const toolPart = displayParts[1]
    expect(toolPart.type).toBe('tool-call')
    if (toolPart.type !== 'tool-call') {
      throw new Error('expected tool call')
    }

    expect(toolPart.toolCall.name).toBe('web.search')
    expect(toolPart.toolCall.status).toBe('completed')
    expect(toolPart.toolCall.parsedArguments).toEqual({ q: 'openclaw' })
    expect(toolPart.toolCall.output).toEqual({ results: [1, 2, 3] })
  })

  it('marks errored tool results as error state', () => {
    const parts = [
      {
        type: 'tool-call',
        id: 'tool-2',
        name: 'read',
        arguments: '{"path":"missing"}',
        state: 'input-complete',
      },
      {
        type: 'tool-result',
        toolCallId: 'tool-2',
        content: 'File not found',
        state: 'error',
        error: 'ENOENT',
      },
    ] satisfies MessagePart[]

    const displayParts = buildMessageDisplayParts(parts)
    const toolPart = displayParts[0]

    expect(toolPart?.type).toBe('tool-call')
    if (!toolPart || toolPart.type !== 'tool-call') {
      throw new Error('expected tool call')
    }

    expect(toolPart.toolCall.status).toBe('error')
    expect(toolPart.toolCall.error).toBe('ENOENT')
    expect(toolPart.toolCall.output).toBe('File not found')
  })

  it('deduplicates text when post-tool text contains pre-tool prefix', () => {
    const parts = [
      { type: 'text', content: 'Hello there.' },
      {
        type: 'tool-call',
        id: 'tool-dup',
        name: 'save',
        arguments: '{}',
        state: 'input-complete',
      },
      {
        type: 'tool-result',
        toolCallId: 'tool-dup',
        content: '"ok"',
        state: 'complete',
      },
      { type: 'text', content: 'Hello there.Now continuing.' },
    ] satisfies MessagePart[]

    const displayParts = buildMessageDisplayParts(parts)

    expect(displayParts).toHaveLength(3)
    expect(displayParts[0]).toEqual({ type: 'text', content: 'Hello there.' })
    expect(displayParts[2]).toEqual({
      type: 'text',
      content: 'Now continuing.',
    })
  })

  it('keeps streaming tool input in running state', () => {
    const parts = [
      {
        type: 'tool-call',
        id: 'tool-3',
        name: 'exec',
        arguments: '{"cmd":"ls"',
        state: 'input-streaming',
      },
    ] satisfies MessagePart[]

    const displayParts = buildMessageDisplayParts(parts)
    const toolPart = displayParts[0]

    expect(toolPart?.type).toBe('tool-call')
    if (!toolPart || toolPart.type !== 'tool-call') {
      throw new Error('expected tool call')
    }

    expect(toolPart.toolCall.status).toBe('running')
    expect(toolPart.toolCall.parsedArguments).toBeUndefined()
  })
})

describe('formatDisplayValue', () => {
  it('pretty prints valid JSON strings', () => {
    expect(formatDisplayValue('{"ok":true}')).toBe('{\n  "ok": true\n}')
  })

  it('returns raw text for non-json strings', () => {
    expect(formatDisplayValue('plain text')).toBe('plain text')
  })
})
