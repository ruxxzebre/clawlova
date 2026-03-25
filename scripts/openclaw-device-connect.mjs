import {
  createHash,
  createPrivateKey,
  generateKeyPairSync,
  sign as signMessage,
  randomUUID,
} from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const DEFAULT_GATEWAY_HTTP_URL = process.env.OPENCLAW_GATEWAY_URL ?? 'http://127.0.0.1:18789'
const DEFAULT_DEVICE_FILE =
  process.env.OPENCLAW_DEVICE_FILE ?? '/var/lib/cockpit/openclaw-device.json'
const DEFAULT_DEVICE_TOKEN_FILE =
  process.env.OPENCLAW_DEVICE_TOKEN_FILE ?? '/var/lib/cockpit/openclaw-device-token'
const DEFAULT_BOOTSTRAP_TOKEN_FILE =
  process.env.OPENCLAW_BOOTSTRAP_TOKEN_FILE ?? '/home/node/.openclaw/.gateway-token'
const DEFAULT_SCOPES = ['operator.read', 'operator.write']

async function main() {
  const gatewayToken =
    readEnvValue('OPENCLAW_GATEWAY_TOKEN') ??
    (await readTokenFile(DEFAULT_BOOTSTRAP_TOKEN_FILE))
  const deviceIdentity = await loadOrCreateDeviceIdentity(DEFAULT_DEVICE_FILE)
  const cachedDeviceToken = await loadDeviceToken(DEFAULT_DEVICE_TOKEN_FILE)
  const connectToken = cachedDeviceToken ?? gatewayToken

  if (!connectToken) {
    throw new Error(
      'Missing connect token. Provide OPENCLAW_GATEWAY_TOKEN or persist OPENCLAW_DEVICE_TOKEN_FILE first.',
    )
  }

  await connectAndPersist({
    gatewayUrl: DEFAULT_GATEWAY_HTTP_URL,
    deviceIdentity,
    connectToken,
    cachedDeviceToken,
    deviceTokenFile: DEFAULT_DEVICE_TOKEN_FILE,
  })
}

async function connectAndPersist(options) {
  const socket = new WebSocket(toWebSocketUrl(options.gatewayUrl))
  const connectRequestId = randomUUID()

  await new Promise((resolve, reject) => {
    let settled = false

    const cleanup = () => {
      socket.removeEventListener('message', onMessage)
      socket.removeEventListener('close', onClose)
      socket.removeEventListener('error', onError)
    }

    const finish = (callback) => {
      if (settled) return
      settled = true
      cleanup()
      callback()
    }

    const onClose = (event) => {
      finish(() =>
        reject(
          new Error(
            event.reason
              ? `OpenClaw socket closed (${event.code}): ${event.reason}`
              : `OpenClaw socket closed (${event.code})`,
          ),
        ),
      )
    }

    const onError = () => {
      finish(() => reject(new Error('WebSocket error while talking to OpenClaw')))
    }

    const onMessage = async (event) => {
      try {
        const frame = JSON.parse(String(event.data))

        if (frame.type === 'event' && frame.event === 'connect.challenge') {
          const { nonce, ts } = frame.payload ?? {}
          if (!nonce || !ts) {
            throw new Error('connect.challenge did not include nonce/ts')
          }

          socket.send(
            JSON.stringify({
              type: 'req',
              id: connectRequestId,
              method: 'connect',
              params: buildConnectParams({
                deviceIdentity: options.deviceIdentity,
                nonce,
                ts,
                token: options.connectToken,
              }),
            }),
          )
          return
        }

        if (frame.type === 'res' && frame.id === connectRequestId) {
          if (!frame.ok) {
            const code = frame.error?.details?.code ?? frame.error?.code ?? 'CONNECT_FAILED'
            const message = frame.error?.message ?? 'connect failed'
            throw new Error(`${code}: ${message}`)
          }

          const deviceToken = frame.payload?.auth?.deviceToken
          if (typeof deviceToken === 'string' && deviceToken !== options.cachedDeviceToken) {
            await persistDeviceToken(options.deviceTokenFile, deviceToken)
          }

          finish(() => {
            socket.close(1000, 'completed')
            resolve()
          })
        }
      } catch (error) {
        finish(() => reject(error))
      }
    }

    socket.addEventListener('message', onMessage)
    socket.addEventListener('close', onClose)
    socket.addEventListener('error', onError)
  })
}

function buildConnectParams(options) {
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
    userAgent: 'clawlova/bootstrap',
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

function signChallenge(options) {
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
    signature: Buffer.from(signature).toString('base64url'),
    signedAt: options.ts,
    nonce: options.nonce,
  }
}

async function loadOrCreateDeviceIdentity(deviceFile) {
  try {
    const existing = await fs.readFile(deviceFile, 'utf8')
    return JSON.parse(existing)
  } catch {}

  await fs.mkdir(path.dirname(deviceFile), { recursive: true })

  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const jwk = publicKey.export({ format: 'jwk' })
  const publicKeyRaw = Buffer.from(jwk.x, 'base64url')
  const identity = {
    id: createHash('sha256').update(publicKeyRaw).digest('hex'),
    publicKey: Buffer.from(publicKeyRaw).toString('base64url'),
    privateKey: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
  }

  await fs.writeFile(deviceFile, `${JSON.stringify(identity, null, 2)}\n`, 'utf8')
  return identity
}

async function loadDeviceToken(deviceTokenFile) {
  const envToken = readEnvValue('OPENCLAW_DEVICE_TOKEN')
  if (envToken) {
    return envToken
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
  await fs.mkdir(path.dirname(deviceTokenFile), { recursive: true })
  await fs.writeFile(deviceTokenFile, `${token.trim()}\n`, 'utf8')
}

async function readTokenFile(tokenFile) {
  try {
    const token = await fs.readFile(tokenFile, 'utf8')
    return token.trim() || null
  } catch {
    return null
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

function readEnvValue(name) {
  const value = process.env[name]?.trim()
  return value ? value : null
}

await main()
