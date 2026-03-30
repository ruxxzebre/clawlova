import { randomUUID, createHash, generateKeyPairSync, sign as signMessage, createPrivateKey } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const DEFAULT_SCOPES = ['operator.read', 'operator.write']
const DEFAULT_GATEWAY_HTTP_URL = 'http://localhost:18789'
const DEFAULT_GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN
if (!DEFAULT_GATEWAY_TOKEN) {
  console.error('Error: OPENCLAW_GATEWAY_TOKEN environment variable is required.\nSet it in your .env file or export it before running this script.')
  process.exit(1)
}
const DEFAULT_DEVICE_FILE = path.resolve(process.cwd(), '.openclaw-device.json')
const DEFAULT_DEVICE_TOKEN_FILE = path.resolve(process.cwd(), '.openclaw-device-token')

async function main() {
  const {
    prompt,
    sessionKey,
    gatewayUrl,
    gatewayToken,
    verbose,
    deviceFile,
    deviceTokenFile,
  } = parseArgs(process.argv.slice(2))

  if (!prompt) {
    printUsage()
    process.exitCode = 1
    return
  }

  const deviceIdentity = await loadOrCreateDeviceIdentity(deviceFile)
  const cachedDeviceToken = await loadDeviceToken(deviceTokenFile)
  const wsUrl = toWebSocketUrl(gatewayUrl)
  const socket = new WebSocket(wsUrl)

  const state = {
    connectRequestId: randomUUID(),
    connectReady: false,
    chatRequestId: randomUUID(),
    chatAcked: false,
    sessionKey,
    prompt,
    verbose,
    deviceIdentity,
    gatewayToken,
    cachedDeviceToken,
    deviceTokenFile,
    pendingToolCalls: new Map(),
    done: false,
  }

  const timeout = setTimeout(() => {
    if (state.done) return
    console.error('\nTimed out waiting for OpenClaw events.')
    socket.close()
    process.exitCode = 1
  }, 120_000)

  socket.addEventListener('open', () => {
    console.error(`Connected to ${wsUrl}`)
    console.error(`Device ID: ${deviceIdentity.id}`)
    if (cachedDeviceToken) {
      console.error(`Using cached device token from ${deviceTokenFile}`)
    }
  })

  socket.addEventListener('message', async (event) => {
    try {
      const frame = JSON.parse(String(event.data))
      await handleFrame(socket, frame, state)
    } catch (error) {
      console.error('\nFailed to process gateway frame:')
      console.error(error instanceof Error ? error.message : error)
    }
  })

  socket.addEventListener('close', (event) => {
    clearTimeout(timeout)
    if (!state.done && event.code !== 1000) {
      console.error(`\nSocket closed unexpectedly (${event.code}): ${event.reason || 'no reason provided'}`)
      process.exitCode = 1
    }
  })

  socket.addEventListener('error', () => {
    console.error('\nWebSocket error while talking to OpenClaw.')
  })
}

async function handleFrame(socket, frame, state) {
  if (frame.type === 'event' && frame.event === 'connect.challenge') {
    const { nonce, ts } = frame.payload ?? {}
    if (!nonce || !ts) {
      throw new Error('connect.challenge did not include nonce/ts')
    }

    const authToken = state.cachedDeviceToken ?? state.gatewayToken
    const signingToken = gatewaySigningToken(authToken)
    const client = {
      id: 'cli',
      version: '0.0.1',
      platform: process.platform,
      mode: 'cli',
    }

    const connectFrame = {
      type: 'req',
      id: state.connectRequestId,
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client,
        role: 'operator',
        scopes: DEFAULT_SCOPES,
        caps: ['agent-events', 'tool-events'],
        commands: [],
        permissions: {},
        auth: { token: authToken },
        locale: 'en-US',
        userAgent: 'clawlova/openclaw-ws-chat',
        device: signChallenge({
          deviceIdentity: state.deviceIdentity,
          nonce,
          ts,
          clientId: client.id,
          clientMode: client.mode,
          role: 'operator',
          scopes: DEFAULT_SCOPES,
          token: signingToken,
        }),
      },
    }

    socket.send(JSON.stringify(connectFrame))
    return
  }

  if (frame.type === 'res' && frame.id === state.connectRequestId) {
    if (!frame.ok) {
      throwGatewayError('connect', frame.error)
    }

    state.connectReady = true
    const deviceToken = frame.payload?.auth?.deviceToken
    if (deviceToken && deviceToken !== state.cachedDeviceToken) {
      state.cachedDeviceToken = deviceToken
      await persistDeviceToken(state.deviceTokenFile, deviceToken)
      console.error(`Received device token from gateway and saved it to ${state.deviceTokenFile}`)
    }

    if (state.verbose) {
      try {
        await sendRpc(socket, 'sessions.patch', {
          key: state.sessionKey,
          verboseLevel: 'full',
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`Skipping sessions.patch: ${message}`)
      }
    }

    socket.send(
      JSON.stringify({
        type: 'req',
        id: state.chatRequestId,
        method: 'chat.send',
        params: {
          sessionKey: state.sessionKey,
          message: state.prompt,
          idempotencyKey: `msg-${randomUUID()}`,
        },
      }),
    )

    console.error(`Session: ${state.sessionKey}`)
    console.error(`Prompt: ${state.prompt}`)
    console.error('')
    return
  }

  if (frame.type === 'res' && frame.id === state.chatRequestId) {
    if (!frame.ok) {
      throwGatewayError('chat.send', frame.error)
    }

    state.chatAcked = true
    const payload = frame.payload ?? {}
    console.error(`chat.send ack: ${payload.status ?? 'ok'}${payload.runId ? ` (${payload.runId})` : ''}`)
    return
  }

  if (frame.type === 'event' && (frame.event === 'chat' || frame.event === 'agent')) {
    handleStreamEvent(frame.payload ?? {}, state)
    return
  }
}

function handleStreamEvent(payload, state) {
  const stream = payload.stream
  const data = payload.data ?? {}
  const lifecycle = payload.lifecycle

  // Handle "final" messages from slash commands (/status, /thinking, etc.)
  if (payload.state === 'final' && payload.message) {
    const message = payload.message
    const content = Array.isArray(message.content)
      ? message.content
          .filter((p) => p.type === 'text' && typeof p.text === 'string')
          .map((p) => p.text)
          .join('')
      : typeof message.content === 'string'
        ? message.content
        : ''
    if (content) {
      process.stdout.write(content)
    }
    state.done = true
    process.stdout.write('\n')
    setTimeout(() => process.exit(0), 50)
    return
  }

  if (stream === 'assistant' && typeof data.delta === 'string' && data.delta.length > 0) {
    process.stdout.write(data.delta)
  }

  if (stream === 'tool') {
    const phase = data.phase ?? 'unknown'
    const toolName = data.name ?? 'unknown'
    const toolCallId = data.toolCallId ?? `tool-${state.pendingToolCalls.size + 1}`

    if (phase === 'start') {
      state.pendingToolCalls.set(toolCallId, {
        name: toolName,
        args: data.args,
      })
      process.stdout.write(`\n\n[tool:start] ${toolName}\n`)
      if (data.args !== undefined) {
        process.stdout.write(`${safeJson(data.args)}\n`)
      }
    } else if (phase === 'result') {
      process.stdout.write(`\n\n[tool:result] ${toolName}\n`)
      if (data.result !== undefined) {
        process.stdout.write(`${safeJson(data.result)}\n`)
      } else if (data.meta !== undefined) {
        process.stdout.write(`${safeJson(data.meta)}\n`)
      }
      state.pendingToolCalls.delete(toolCallId)
    } else if (phase === 'error') {
      process.stdout.write(`\n\n[tool:error] ${toolName}\n`)
      if (data.error !== undefined) {
        process.stdout.write(`${safeJson(data.error)}\n`)
      }
      state.pendingToolCalls.delete(toolCallId)
    }
  }

  if (lifecycle === 'end' || data.phase === 'end') {
    state.done = true
    process.stdout.write('\n')
    setTimeout(() => process.exit(0), 50)
  }
}

async function sendRpc(socket, method, params) {
  const id = randomUUID()

  return await new Promise((resolve, reject) => {
    const onMessage = (event) => {
      try {
        const frame = JSON.parse(String(event.data))
        if (frame.type !== 'res' || frame.id !== id) {
          return
        }

        socket.removeEventListener('message', onMessage)

        if (!frame.ok) {
          reject(new Error(`${method} failed: ${frame.error?.message ?? 'unknown error'}`))
          return
        }

        resolve(frame.payload)
      } catch (error) {
        socket.removeEventListener('message', onMessage)
        reject(error)
      }
    }

    socket.addEventListener('message', onMessage)
    socket.send(JSON.stringify({ type: 'req', id, method, params }))
  })
}

function signChallenge({
  deviceIdentity,
  nonce,
  ts,
  clientId,
  clientMode,
  role,
  scopes,
  token,
}) {
  const payload = [
    'v2',
    deviceIdentity.id,
    clientId,
    clientMode,
    role,
    scopes.join(','),
    String(ts),
    token,
    nonce,
  ].join('|')

  const privateKey = createPrivateKey(deviceIdentity.privateKey)
  const signature = signMessage(null, Buffer.from(payload), privateKey)

  return {
    id: deviceIdentity.id,
    publicKey: deviceIdentity.publicKey,
    signature: toBase64Url(signature),
    signedAt: ts,
    nonce,
  }
}

async function loadOrCreateDeviceIdentity(deviceFile) {
  const envIdentity = process.env.OPENCLAW_DEVICE_IDENTITY
  if (envIdentity) {
    return JSON.parse(envIdentity)
  }

  try {
    const existing = await fs.readFile(deviceFile, 'utf8')
    return JSON.parse(existing)
  } catch {}

  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const jwk = publicKey.export({ format: 'jwk' })
  const publicKeyRaw = Buffer.from(jwk.x, 'base64url')
  const identity = {
    id: createHash('sha256').update(publicKeyRaw).digest('hex'),
    publicKey: toBase64Url(publicKeyRaw),
    privateKey: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
  }

  await fs.writeFile(deviceFile, `${JSON.stringify(identity, null, 2)}\n`, 'utf8')
  console.error(`Generated device identity: ${deviceFile}`)
  return identity
}

async function loadDeviceToken(deviceTokenFile) {
  const envToken = process.env.OPENCLAW_DEVICE_TOKEN
  if (envToken) {
    return envToken.trim()
  }

  try {
    const existing = await fs.readFile(deviceTokenFile, 'utf8')
    const token = existing.trim()
    return token || null
  } catch {
    return null
  }
}

async function persistDeviceToken(deviceTokenFile, token) {
  await fs.writeFile(deviceTokenFile, `${token.trim()}\n`, 'utf8')
}

function parseArgs(args) {
  const positionals = []
  const options = {
    gatewayUrl: process.env.OPENCLAW_WS_URL ?? DEFAULT_GATEWAY_HTTP_URL,
    gatewayToken: DEFAULT_GATEWAY_TOKEN,
    sessionKey: process.env.OPENCLAW_SESSION_KEY ?? `agent:main:script-${Date.now()}`,
    verbose: readBoolean(process.env.OPENCLAW_VERBOSE, true),
    deviceFile: process.env.OPENCLAW_DEVICE_FILE ?? DEFAULT_DEVICE_FILE,
    deviceTokenFile:
      process.env.OPENCLAW_DEVICE_TOKEN_FILE ?? DEFAULT_DEVICE_TOKEN_FILE,
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    const next = args[index + 1]

    if (arg === '--url' && next) {
      options.gatewayUrl = next
      index += 1
      continue
    }

    if (arg === '--token' && next) {
      options.gatewayToken = next
      index += 1
      continue
    }

    if (arg === '--session' && next) {
      options.sessionKey = next
      index += 1
      continue
    }

    if (arg === '--device-file' && next) {
      options.deviceFile = path.resolve(next)
      index += 1
      continue
    }

    if (arg === '--device-token-file' && next) {
      options.deviceTokenFile = path.resolve(next)
      index += 1
      continue
    }

    if (arg === '--no-verbose') {
      options.verbose = false
      continue
    }

    positionals.push(arg)
  }

  return {
    ...options,
    prompt: positionals.join(' ').trim(),
  }
}

function toWebSocketUrl(value) {
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

function gatewaySigningToken(token) {
  return token ?? ''
}

function toBase64Url(value) {
  return Buffer.from(value).toString('base64url')
}

function safeJson(value) {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

function readBoolean(value, fallback) {
  if (value == null) return fallback
  return !['0', 'false', 'no', 'off'].includes(String(value).toLowerCase())
}

function throwGatewayError(method, error) {
  const message = error?.message ?? `${method} failed`
  const code = error?.details?.code ?? error?.code
  if (code) {
    throw new Error(`${method} failed [${code}]: ${message}`)
  }
  throw new Error(`${method} failed: ${message}`)
}

function printUsage() {
  console.error(`Usage:
  pnpm openclaw:ws -- "your prompt here"

Options:
  --url <ws-or-http-url>      Gateway URL, default: ${DEFAULT_GATEWAY_HTTP_URL}
  --token <token>             Gateway token, default: OPENCLAW_GATEWAY_TOKEN or repo dev token
  --session <sessionKey>      Session key, default: agent:main:script-<timestamp>
  --device-file <path>        Where to persist generated device identity
  --device-token-file <path>  Where to persist paired device token
  --no-verbose                Skip sessions.patch verboseLevel=full

Env:
  OPENCLAW_WS_URL
  OPENCLAW_GATEWAY_TOKEN
  OPENCLAW_SESSION_KEY
  OPENCLAW_DEVICE_FILE
  OPENCLAW_DEVICE_TOKEN
  OPENCLAW_DEVICE_TOKEN_FILE
  OPENCLAW_DEVICE_IDENTITY
  OPENCLAW_VERBOSE
`)
}

await main()
