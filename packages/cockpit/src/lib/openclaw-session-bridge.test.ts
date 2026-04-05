import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { UIMessage } from '@tanstack/ai'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createOpenClawSessionStream,
  extractLatestUserMessageText,
  resolveAuthMode,
  translateGatewayEvent,
} from './openclaw-bridge'

function createState() {
  return {
    runId: 'run-1',
    messageId: 'msg-1',
    pendingToolCalls: new Map(),
    textStarted: false,
    textContent: '',
  }
}

class MockWebSocket {
  static instances: MockWebSocket[] = []
  static connectResponse:
    | Record<string, unknown>
    | ((frame: Record<string, unknown>) => Record<string, unknown>) = {
    type: 'res',
    ok: true,
    payload: {
      auth: {
        deviceToken: 'persisted-device-token',
      },
    },
  }

  private listeners = new Map<string, Set<(event: any) => void>>()
  sentFrames: Record<string, unknown>[] = []

  constructor(public readonly url: string) {
    MockWebSocket.instances.push(this)
    queueMicrotask(() => {
      this.emit('message', {
        data: JSON.stringify({
          type: 'event',
          event: 'connect.challenge',
          payload: { nonce: 'nonce-1', ts: 123 },
        }),
      })
    })
  }

  addEventListener(type: string, listener: (event: any) => void): void {
    let typeListeners = this.listeners.get(type)
    if (!typeListeners) {
      typeListeners = new Set()
      this.listeners.set(type, typeListeners)
    }
    typeListeners.add(listener)
  }

  removeEventListener(type: string, listener: (event: any) => void): void {
    this.listeners.get(type)?.delete(listener)
  }

  send(payload: string): void {
    const frame = JSON.parse(payload) as Record<string, unknown>
    this.sentFrames.push(frame)

    if (frame['method'] === 'connect') {
      const response =
        typeof MockWebSocket.connectResponse === 'function'
          ? MockWebSocket.connectResponse(frame)
          : MockWebSocket.connectResponse
      queueMicrotask(() => {
        this.emit('message', {
          data: JSON.stringify({
            ...response,
            id: frame['id'],
          }),
        })
      })
      return
    }

    if (frame['method'] === 'chat.send') {
      queueMicrotask(() => {
        this.emit('message', {
          data: JSON.stringify({
            type: 'res',
            id: frame['id'],
            ok: true,
          }),
        })
        this.emit('message', {
          data: JSON.stringify({
            type: 'event',
            event: 'chat',
            payload: {
              stream: 'assistant',
              data: { delta: 'Hello' },
            },
          }),
        })
        this.emit('message', {
          data: JSON.stringify({
            type: 'event',
            event: 'chat',
            payload: {
              stream: 'assistant',
              lifecycle: 'end',
              data: { finishReason: 'stop' },
            },
          }),
        })
      })
    }
  }

  close(code = 1000, reason = ''): void {
    this.emit('close', { code, reason })
  }

  private emit(type: string, event: any): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event)
    }
  }
}

async function collectStreamChunks(message: string, sessionKey = 'agent:main:chat-user-1') {
  const chunks = []
  for await (const chunk of createOpenClawSessionStream({ message, sessionKey })) {
    chunks.push(chunk)
  }
  return chunks
}

const originalEnv = { ...process.env }

beforeEach(() => {
  MockWebSocket.instances = []
  MockWebSocket.connectResponse = {
    type: 'res',
    ok: true,
    payload: {
      auth: {
        deviceToken: 'persisted-device-token',
      },
    },
  }
  vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket)
})

afterEach(async () => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  process.env = { ...originalEnv }
})

describe('extractLatestUserMessageText', () => {
  it('returns the latest user text content', () => {
    const messages = [
      {
        id: 'm1',
        role: 'user',
        parts: [{ type: 'text', content: 'first' }],
      },
      {
        id: 'm2',
        role: 'assistant',
        parts: [{ type: 'text', content: 'reply' }],
      },
      {
        id: 'm3',
        role: 'user',
        parts: [{ type: 'text', content: 'latest prompt' }],
      },
    ] as UIMessage[]

    expect(extractLatestUserMessageText(messages)).toBe('latest prompt')
  })
})

describe('resolveAuthMode', () => {
  it('prefers a cached device token', () => {
    expect(
      resolveAuthMode({
        cachedDeviceToken: 'cached-token',
        bootstrapGatewayToken: null,
      }),
    ).toBe('device-token')
  })

  it('falls back to explicit bootstrap auth when no device token exists', () => {
    expect(
      resolveAuthMode({
        cachedDeviceToken: null,
        bootstrapGatewayToken: 'gateway-token',
      }),
    ).toBe('bootstrap-token')
  })

  it('throws when neither cached auth nor bootstrap auth exists', () => {
    expect(() =>
      resolveAuthMode({
        cachedDeviceToken: null,
        bootstrapGatewayToken: null,
      }),
    ).toThrow(/OPENCLAW_GATEWAY_TOKEN|OPENCLAW_BOOTSTRAP_TOKEN_FILE/)
  })
})

describe('translateGatewayEvent', () => {
  it('maps assistant deltas into text chunks', () => {
    const state = createState()

    const translated = translateGatewayEvent(
      {
        stream: 'assistant',
        data: { delta: 'Hello' },
      },
      state,
    )

    expect(translated.done).toBeUndefined()
    expect(translated.chunks.map((chunk) => chunk.type)).toEqual([
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
    ])
  })

  it('maps tool start and result events into tool chunks', () => {
    const state = createState()

    const started = translateGatewayEvent(
      {
        stream: 'tool',
        data: {
          phase: 'start',
          toolCallId: 'tool-1',
          name: 'exec',
          args: { command: 'pwd && ls -la' },
        },
      },
      state,
    )

    expect(started.chunks.map((chunk) => chunk.type)).toEqual([
      'TOOL_CALL_START',
      'TOOL_CALL_ARGS',
    ])

    const finished = translateGatewayEvent(
      {
        stream: 'tool',
        data: {
          phase: 'result',
          toolCallId: 'tool-1',
          name: 'exec',
          result: 'file-a\nfile-b',
        },
      },
      state,
    )

    expect(finished.chunks).toHaveLength(1)
    expect(finished.chunks[0]).toMatchObject({
      type: 'TOOL_CALL_END',
      toolCallId: 'tool-1',
      toolName: 'exec',
      input: { command: 'pwd && ls -la' },
      result: 'file-a\nfile-b',
    })
  })

  it('handles final messages from slash commands like /status', () => {
    const state = createState()

    const translated = translateGatewayEvent(
      {
        state: 'final',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: '🦞 OpenClaw 2026.3.28\n🧠 Model: openai/gpt-5.4' },
          ],
        },
      },
      state,
    )

    expect(translated.done).toBe(true)
    expect(translated.chunks.map((chunk) => chunk.type)).toEqual([
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
      'RUN_FINISHED',
    ])

    const contentChunk = translated.chunks.find(
      (chunk) => chunk.type === 'TEXT_MESSAGE_CONTENT',
    )
    expect(contentChunk).toMatchObject({
      delta: '🦞 OpenClaw 2026.3.28\n🧠 Model: openai/gpt-5.4',
    })
  })

  it('handles final messages with string content', () => {
    const state = createState()

    const translated = translateGatewayEvent(
      {
        state: 'final',
        message: {
          role: 'assistant',
          content: 'Thinking mode enabled.',
        },
      },
      state,
    )

    expect(translated.done).toBe(true)
    expect(translated.chunks.map((chunk) => chunk.type)).toEqual([
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
      'RUN_FINISHED',
    ])
  })

  it('finishes the run on lifecycle end', () => {
    const state = createState()
    translateGatewayEvent(
      {
        stream: 'assistant',
        data: { delta: 'done' },
      },
      state,
    )

    const translated = translateGatewayEvent(
      {
        stream: 'assistant',
        lifecycle: 'end',
        data: { finishReason: 'stop' },
      },
      state,
    )

    expect(translated.done).toBe(true)
    expect(translated.chunks.map((chunk) => chunk.type)).toEqual([
      'TEXT_MESSAGE_END',
      'RUN_FINISHED',
    ])
  })
})

describe('createOpenClawSessionStream auth flow', () => {
  it('uses bootstrap auth on first pair and persists the returned device token', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cockpit-bridge-'))
    try {
      process.env['NODE_ENV'] = 'production'
      process.env['OPENCLAW_GATEWAY_TOKEN'] = 'gateway-token'
      process.env['OPENCLAW_DEVICE_FILE'] = path.join(tempDir, 'openclaw-device.json')
      process.env['OPENCLAW_DEVICE_TOKEN_FILE'] = path.join(
        tempDir,
        'openclaw-device-token',
      )

      const chunks = await collectStreamChunks('hello')

      const connectFrame = MockWebSocket.instances[0]?.sentFrames.find(
        (frame) => frame['method'] === 'connect',
      )
      expect(connectFrame?.['params']).toMatchObject({
        auth: { token: 'gateway-token' },
        client: { mode: 'cli' },
      })
      await expect(
        readFile(process.env['OPENCLAW_DEVICE_TOKEN_FILE'] as string, 'utf8'),
      ).resolves.toContain('persisted-device-token')
      expect(chunks.map((chunk) => chunk.type)).toContain('RUN_FINISHED')
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('prefers a cached device token and does not require bootstrap auth', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cockpit-bridge-'))
    const tokenFile = path.join(tempDir, 'openclaw-device-token')
    try {
      process.env['NODE_ENV'] = 'production'
      delete process.env['OPENCLAW_GATEWAY_TOKEN']
      process.env['OPENCLAW_DEVICE_FILE'] = path.join(tempDir, 'openclaw-device.json')
      process.env['OPENCLAW_DEVICE_TOKEN_FILE'] = tokenFile
      await writeFile(tokenFile, 'cached-device-token\n', 'utf8')

      await collectStreamChunks('hello')

      const connectFrame = MockWebSocket.instances[0]?.sentFrames.find(
        (frame) => frame['method'] === 'connect',
      )
      expect(connectFrame?.['params']).toMatchObject({
        auth: { token: 'cached-device-token' },
      })
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('returns a clear bootstrap error when first pair is still pending', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cockpit-bridge-'))
    try {
      process.env['NODE_ENV'] = 'production'
      process.env['OPENCLAW_GATEWAY_TOKEN'] = 'gateway-token'
      process.env['OPENCLAW_DEVICE_FILE'] = path.join(tempDir, 'openclaw-device.json')
      process.env['OPENCLAW_DEVICE_TOKEN_FILE'] = path.join(
        tempDir,
        'openclaw-device-token',
      )
      MockWebSocket.connectResponse = {
        type: 'res',
        ok: false,
        error: {
          message: 'pairing required',
          code: 'PAIRING_REQUIRED',
        },
      }

      const chunks = await collectStreamChunks('hello')

      expect(chunks).toHaveLength(1)
      expect(chunks[0]).toMatchObject({
        type: 'RUN_ERROR',
        error: {
          message: expect.stringMatching(/bootstrap did not finish/),
        },
      })
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('returns an explicit error when neither cached auth nor bootstrap auth exists', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cockpit-bridge-'))
    try {
      process.env['NODE_ENV'] = 'production'
      delete process.env['OPENCLAW_GATEWAY_TOKEN']
      delete process.env['OPENCLAW_DEVICE_TOKEN']
      process.env['OPENCLAW_DEVICE_FILE'] = path.join(tempDir, 'openclaw-device.json')
      process.env['OPENCLAW_DEVICE_TOKEN_FILE'] = path.join(
        tempDir,
        'openclaw-device-token',
      )

      const chunks = await collectStreamChunks('hello')

      expect(chunks).toHaveLength(1)
      expect(chunks[0]).toMatchObject({
        type: 'RUN_ERROR',
        error: {
          message: expect.stringMatching(
            /OPENCLAW_GATEWAY_TOKEN|OPENCLAW_BOOTSTRAP_TOKEN_FILE/,
          ),
        },
      })
      expect(MockWebSocket.instances).toHaveLength(0)
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('loads the bootstrap token from a shared token file', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cockpit-bridge-'))
    const tokenFile = path.join(tempDir, '.gateway-token')
    try {
      process.env['NODE_ENV'] = 'production'
      delete process.env['OPENCLAW_GATEWAY_TOKEN']
      process.env['OPENCLAW_BOOTSTRAP_TOKEN_FILE'] = tokenFile
      process.env['OPENCLAW_DEVICE_FILE'] = path.join(tempDir, 'openclaw-device.json')
      process.env['OPENCLAW_DEVICE_TOKEN_FILE'] = path.join(
        tempDir,
        'openclaw-device-token',
      )
      await writeFile(tokenFile, 'file-bootstrap-token\n', 'utf8')

      await collectStreamChunks('hello')

      const connectFrame = MockWebSocket.instances[0]?.sentFrames.find(
        (frame) => frame['method'] === 'connect',
      )
      expect(connectFrame?.['params']).toMatchObject({
        auth: { token: 'file-bootstrap-token' },
      })
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })
})
