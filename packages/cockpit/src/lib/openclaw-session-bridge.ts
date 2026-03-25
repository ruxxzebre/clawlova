import type { StreamChunk, UIMessage } from '@tanstack/ai'
import {
  createHash,
  createPrivateKey,
  generateKeyPairSync,
  randomUUID,
  sign as signMessage,
} from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const DEFAULT_GATEWAY_URL = 'http://localhost:18789'
const DEFAULT_DEVICE_FILE = '/var/lib/cockpit/openclaw-device.json'
const DEFAULT_DEVICE_TOKEN_FILE = '/var/lib/cockpit/openclaw-device-token'
const DEFAULT_SCOPES = ['operator.read', 'operator.write']
const PAIRING_REQUIRED_CODE = 'PAIRING_REQUIRED'

interface SessionBridgeOptions {
  messages: Array<UIMessage>
  abortSignal?: AbortSignal
  sessionKey?: string
}

interface DeviceIdentity {
  id: string
  publicKey: string
  privateKey: string
}

interface PendingToolCall {
  name: string
  argsText: string
  input?: unknown
}

interface BridgeConfig {
  gatewayUrl: string
  deviceFile: string
  deviceTokenFile: string
  bootstrapGatewayToken: string | null
  bootstrapTokenFile: string | null
}

interface BridgeAuthState {
  deviceIdentity: DeviceIdentity
  cachedDeviceToken: string | null
  connectToken: string
  mode: 'device-token' | 'bootstrap-token'
}

interface GatewayState {
  runId: string
  messageId: string
  startedAt: number
  sessionKey: string
  prompt: string
  auth: BridgeAuthState
  deviceTokenFile: string
  pendingToolCalls: Map<string, PendingToolCall>
  textStarted: boolean
  textContent: string
}

interface GatewayResponseFrame {
  type: 'res'
  id: string
  ok: boolean
  payload?: Record<string, unknown>
  error?: {
    message?: string
    code?: string
    details?: {
      code?: string
    }
  }
}

interface GatewayEventFrame {
  type: 'event'
  event: string
  payload?: Record<string, unknown>
}

type GatewayFrame = GatewayResponseFrame | GatewayEventFrame

interface TranslationResult {
  chunks: Array<StreamChunk>
  finishReason?: 'stop' | 'length' | 'content_filter' | 'tool_calls' | null
  done?: boolean
}

export function createOpenClawSessionStream(
  options: SessionBridgeOptions,
): AsyncIterable<StreamChunk> {
  const queue = new AsyncQueue<StreamChunk>()
  const abortController = new AbortController()

  if (options.abortSignal) {
    options.abortSignal.addEventListener('abort', () => abortController.abort(), {
      once: true,
    })
  }

  void runSessionBridge(options, queue, abortController)

  return queue.iterate(abortController.signal)
}

async function runSessionBridge(
  options: SessionBridgeOptions,
  queue: AsyncQueue<StreamChunk>,
  abortController: AbortController,
): Promise<void> {
  const runId = genId('run')

  try {
    const prompt = extractLatestUserMessageText(options.messages)
    if (!prompt) {
      throw new Error('No user message found to send to OpenClaw')
    }

    const config = getBridgeConfig()
    const auth = await loadBridgeAuthState(config)
    const sessionKey = options.sessionKey ?? deriveSessionKey(options.messages)
    const state: GatewayState = {
      runId,
      messageId: genId('msg'),
      startedAt: Date.now(),
      sessionKey,
      prompt,
      auth,
      deviceTokenFile: config.deviceTokenFile,
      pendingToolCalls: new Map(),
      textStarted: false,
      textContent: '',
    }

    await streamViaGatewayWebSocket({
      queue,
      signal: abortController.signal,
      state,
      gatewayUrl: config.gatewayUrl,
    })
  } catch (error: unknown) {
    if (!abortController.signal.aborted) {
      queue.push(toRunError(runId, error))
    }
  } finally {
    queue.close()
  }
}

async function loadBridgeAuthState(config: BridgeConfig): Promise<BridgeAuthState> {
  const deviceIdentity = await loadOrCreateDeviceIdentity(config.deviceFile)
  const cachedDeviceToken = await loadDeviceToken(config.deviceTokenFile)
  const bootstrapGatewayToken =
    config.bootstrapGatewayToken ??
    (config.bootstrapTokenFile
      ? await loadOptionalToken(config.bootstrapTokenFile)
      : null)
  const mode = resolveAuthMode({
    cachedDeviceToken,
    bootstrapGatewayToken,
  })

  return {
    deviceIdentity,
    cachedDeviceToken,
    connectToken:
      mode === 'device-token'
        ? (cachedDeviceToken as string)
        : (bootstrapGatewayToken as string),
    mode,
  }
}

async function streamViaGatewayWebSocket(options: {
  queue: AsyncQueue<StreamChunk>
  signal: AbortSignal
  state: GatewayState
  gatewayUrl: string
}): Promise<void> {
  const wsUrl = toWebSocketUrl(options.gatewayUrl)
  const socket = new WebSocket(wsUrl)
  const connectRequestId = randomUUID()
  const chatRequestId = randomUUID()

  await new Promise<void>((resolve, reject) => {
    let settled = false
    let chatSent = false

    const cleanup = () => {
      options.signal.removeEventListener('abort', onAbort)
      socket.removeEventListener('message', onMessage)
      socket.removeEventListener('close', onClose)
      socket.removeEventListener('error', onError)
    }

    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      cleanup()
      callback()
    }

    const onAbort = () => {
      finish(() => {
        socket.close(1000, 'aborted')
        resolve()
      })
    }

    const onError = () => {
      if (settled) return
      reject(new Error('WebSocket error while talking to OpenClaw'))
    }

    const onClose = (event: CloseEvent) => {
      if (settled) return
      reject(
        new Error(
          event.reason
            ? `OpenClaw socket closed (${event.code}): ${event.reason}`
            : `OpenClaw socket closed (${event.code})`,
        ),
      )
    }

    const onMessage = async (event: MessageEvent) => {
      try {
        const frame = JSON.parse(String(event.data)) as GatewayFrame

        if (frame.type === 'event' && frame.event === 'connect.challenge') {
          const payload = frame.payload ?? {}
          const nonce = asString(payload['nonce'])
          const ts = asNumber(payload['ts'])
          if (!nonce || ts === undefined) {
            throw new Error('connect.challenge did not include nonce/ts')
          }

          socket.send(
            JSON.stringify({
              type: 'req',
              id: connectRequestId,
              method: 'connect',
              params: buildConnectParams({
                deviceIdentity: options.state.auth.deviceIdentity,
                nonce,
                ts,
                token: options.state.auth.connectToken,
              }),
            }),
          )
          return
        }

        if (frame.type === 'res' && frame.id === connectRequestId) {
          if (!frame.ok) {
            handleConnectError(frame.error, options.state.auth.mode)
          }

          const deviceToken = asString(
            frame.payload?.['auth'] as Record<string, unknown> | undefined,
            'deviceToken',
          )
          if (deviceToken && deviceToken !== options.state.auth.cachedDeviceToken) {
            options.state.auth.cachedDeviceToken = deviceToken
            await persistDeviceToken(options.state.deviceTokenFile, deviceToken)
          }

          options.queue.push({
            type: 'RUN_STARTED',
            runId: options.state.runId,
            model: 'openclaw',
            timestamp: options.state.startedAt,
          })

          if (!chatSent) {
            chatSent = true
            socket.send(
              JSON.stringify({
                type: 'req',
                id: chatRequestId,
                method: 'chat.send',
                params: {
                  sessionKey: options.state.sessionKey,
                  message: options.state.prompt,
                  idempotencyKey: `msg-${randomUUID()}`,
                },
              }),
            )
          }
          return
        }

        if (frame.type === 'res' && frame.id === chatRequestId) {
          if (!frame.ok) {
            throwGatewayError('chat.send', frame.error)
          }
          return
        }

        if (
          frame.type === 'event' &&
          (frame.event === 'chat' || frame.event === 'agent')
        ) {
          const translation = translateGatewayEvent(frame.payload ?? {}, options.state)
          for (const chunk of translation.chunks) {
            options.queue.push(chunk)
          }

          if (translation.done) {
            finish(() => {
              socket.close(1000, 'completed')
              resolve()
            })
          }
        }
      } catch (error) {
        finish(() => reject(error))
      }
    }

    options.signal.addEventListener('abort', onAbort, { once: true })
    socket.addEventListener('message', onMessage)
    socket.addEventListener('close', onClose)
    socket.addEventListener('error', onError)
  })
}

function buildConnectParams(options: {
  deviceIdentity: DeviceIdentity
  nonce: string
  ts: number
  token: string
}): Record<string, unknown> {
  const client = {
    id: 'cli',
    version: '0.0.1',
    platform: process.platform,
    mode: 'cli',
  }

  return {
    minProtocol: 3,
    maxProtocol: 3,
    client,
    role: 'operator',
    scopes: DEFAULT_SCOPES,
    caps: ['agent-events', 'tool-events'],
    commands: [],
    permissions: {},
    auth: { token: options.token },
    locale: 'en-US',
    userAgent: 'clawlova/cockpit',
    device: signChallenge({
      deviceIdentity: options.deviceIdentity,
      nonce: options.nonce,
      ts: options.ts,
      clientId: client.id,
      clientMode: client.mode,
      role: 'operator',
      scopes: DEFAULT_SCOPES,
      token: options.token,
    }),
  }
}

function handleConnectError(
  error: GatewayResponseFrame['error'],
  mode: BridgeAuthState['mode'],
): never {
  const code = error?.details?.code ?? error?.code
  if (code === PAIRING_REQUIRED_CODE && mode === 'bootstrap-token') {
    throw new Error(
      'Cockpit device bootstrap did not finish before chat traffic started. Check `docker compose logs openclaw-init cockpit-bootstrap openclaw-gateway` and retry once initialization completes.',
    )
  }

  throwGatewayError('connect', error)
}

export function translateGatewayEvent(
  payload: Record<string, unknown>,
  state: Pick<
    GatewayState,
    'messageId' | 'pendingToolCalls' | 'runId' | 'textContent' | 'textStarted'
  >,
): TranslationResult {
  const timestamp = Date.now()
  const chunks: Array<StreamChunk> = []
  const stream = asString(payload['stream'])
  const lifecycle = asString(payload['lifecycle'])
  const data = asRecord(payload['data'])

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
  messages: Array<UIMessage | null>,
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

export function deriveSessionKey(messages: Array<UIMessage>): string {
  const seed = messages.find((message) => message.role === 'user')?.id ?? randomUUID()
  return `agent:main:chat-${seed}`
}

function getBridgeConfig(): BridgeConfig {
  return {
    gatewayUrl: process.env['OPENCLAW_GATEWAY_URL'] ?? DEFAULT_GATEWAY_URL,
    bootstrapGatewayToken: readEnvValue('OPENCLAW_GATEWAY_TOKEN'),
    bootstrapTokenFile: readEnvValue('OPENCLAW_BOOTSTRAP_TOKEN_FILE'),
    deviceFile: process.env['OPENCLAW_DEVICE_FILE'] ?? DEFAULT_DEVICE_FILE,
    deviceTokenFile:
      process.env['OPENCLAW_DEVICE_TOKEN_FILE'] ?? DEFAULT_DEVICE_TOKEN_FILE,
  }
}

export function resolveAuthMode(options: {
  cachedDeviceToken: string | null
  bootstrapGatewayToken: string | null
}): BridgeAuthState['mode'] {
  if (options.cachedDeviceToken) {
    return 'device-token'
  }

  if (options.bootstrapGatewayToken) {
    return 'bootstrap-token'
  }

  throw new Error(
    'Cockpit device auth is not configured: provide a persisted device token or a bootstrap token via OPENCLAW_GATEWAY_TOKEN or OPENCLAW_BOOTSTRAP_TOKEN_FILE.',
  )
}

async function loadOrCreateDeviceIdentity(
  deviceFile: string,
): Promise<DeviceIdentity> {
  const envIdentity = process.env['OPENCLAW_DEVICE_IDENTITY']
  if (envIdentity) {
    return JSON.parse(envIdentity) as DeviceIdentity
  }

  try {
    const existing = await fs.readFile(deviceFile, 'utf8')
    return JSON.parse(existing) as DeviceIdentity
  } catch {}

  await fs.mkdir(path.dirname(deviceFile), { recursive: true })

  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const jwk = publicKey.export({ format: 'jwk' })
  if (!jwk.x) {
    throw new Error('Failed to export OpenClaw device public key')
  }
  const publicKeyRaw = Buffer.from(jwk.x, 'base64url')
  const identity: DeviceIdentity = {
    id: createHash('sha256').update(publicKeyRaw).digest('hex'),
    publicKey: toBase64Url(publicKeyRaw),
    privateKey: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
  }

  await fs.writeFile(deviceFile, `${JSON.stringify(identity, null, 2)}\n`, 'utf8')
  return identity
}

async function loadDeviceToken(deviceTokenFile: string): Promise<string | null> {
  const envToken = readEnvValue('OPENCLAW_DEVICE_TOKEN')
  if (envToken) {
    return envToken
  }

  try {
    const token = await fs.readFile(deviceTokenFile, 'utf8')
    return token.trim() || null
  } catch {
    return null
  }
}

async function loadOptionalToken(tokenFile: string): Promise<string | null> {
  try {
    const token = await fs.readFile(tokenFile, 'utf8')
    return token.trim() || null
  } catch {
    return null
  }
}

function readEnvValue(name: string): string | null {
  const value = process.env[name]?.trim()
  return value ? value : null
}

async function persistDeviceToken(
  deviceTokenFile: string,
  token: string,
): Promise<void> {
  await fs.mkdir(path.dirname(deviceTokenFile), { recursive: true })
  await fs.writeFile(deviceTokenFile, `${token.trim()}\n`, 'utf8')
}

function signChallenge(options: {
  deviceIdentity: DeviceIdentity
  nonce: string
  ts: number
  clientId: string
  clientMode: string
  role: string
  scopes: Array<string>
  token: string
}): Record<string, unknown> {
  const payload = [
    'v2',
    options.deviceIdentity.id,
    options.clientId,
    options.clientMode,
    options.role,
    options.scopes.join(','),
    String(options.ts),
    options.token,
    options.nonce,
  ].join('|')

  const privateKey = createPrivateKey(options.deviceIdentity.privateKey)
  const signature = signMessage(null, Buffer.from(payload), privateKey)

  return {
    id: options.deviceIdentity.id,
    publicKey: options.deviceIdentity.publicKey,
    signature: toBase64Url(signature),
    signedAt: options.ts,
    nonce: options.nonce,
  }
}

function toRunError(runId: string, error: unknown): StreamChunk {
  return {
    type: 'RUN_ERROR',
    runId,
    timestamp: Date.now(),
    error: {
      message: error instanceof Error ? error.message : 'Unknown OpenClaw error',
    },
  }
}

function normalizeFinishReason(
  finishReason?: string | null,
): 'stop' | 'length' | 'content_filter' | 'tool_calls' | null {
  if (finishReason === 'stop') return 'stop'
  if (finishReason === 'length') return 'length'
  if (finishReason === 'content_filter') return 'content_filter'
  if (finishReason === 'tool_calls') return 'tool_calls'
  return 'stop'
}

function stringifyArgs(value: unknown): string {
  if (value === undefined) {
    return ''
  }
  if (typeof value === 'string') {
    return value
  }
  return JSON.stringify(value)
}

function stringifyResult(value: unknown): string {
  if (value === undefined) {
    return ''
  }
  if (typeof value === 'string') {
    return value
  }
  return JSON.stringify(value, null, 2)
}

function throwGatewayError(
  method: string,
  error?: GatewayResponseFrame['error'],
): never {
  const message = error?.message ?? `${method} failed`
  const code = error?.details?.code ?? error?.code
  if (code) {
    throw new Error(`${method} failed [${code}]: ${message}`)
  }
  throw new Error(`${method} failed: ${message}`)
}

function toWebSocketUrl(value: string): string {
  if (value.startsWith('ws://') || value.startsWith('wss://')) {
    return value
  }
  if (value.startsWith('http://')) {
    return `ws://${value.slice('http://'.length)}`
  }
  if (value.startsWith('https://')) {
    return `wss://${value.slice('https://'.length)}`
  }
  return `ws://${value}`
}

function toBase64Url(value: Uint8Array | Buffer): string {
  return Buffer.from(value).toString('base64url')
}

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function asString(value: unknown, key?: string): string | undefined {
  const next = key ? asRecord(value)?.[key] : value
  return typeof next === 'string' ? next : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}

class AsyncQueue<T> {
  private items: Array<T> = []
  private resolvers: Array<(item: IteratorResult<T>) => void> = []
  private closed = false

  push(item: T): void {
    if (this.closed) return
    const resolver = this.resolvers.shift()
    if (resolver) {
      resolver({ value: item, done: false })
      return
    }
    this.items.push(item)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    while (this.resolvers.length > 0) {
      const resolver = this.resolvers.shift()
      resolver?.({ value: undefined, done: true })
    }
  }

  async *iterate(abortSignal?: AbortSignal): AsyncGenerator<T> {
    while (!this.closed || this.items.length > 0) {
      if (abortSignal?.aborted) {
        return
      }

      if (this.items.length > 0) {
        yield this.items.shift() as T
        continue
      }

      const next = await new Promise<IteratorResult<T>>((resolve) => {
        const onAbort = () => {
          abortSignal?.removeEventListener('abort', onAbort)
          resolve({ value: undefined, done: true })
        }

        this.resolvers.push((result) => {
          abortSignal?.removeEventListener('abort', onAbort)
          resolve(result)
        })
        abortSignal?.addEventListener('abort', onAbort, { once: true })
      })

      if (next.done) {
        return
      }

      yield next.value
    }
  }
}
