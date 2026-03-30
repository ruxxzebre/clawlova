import type { StreamChunk } from '@tanstack/ai'
import { randomUUID } from 'node:crypto'
import type { AsyncQueue } from './async-queue'
import type { GatewayFrame, GatewayState } from './types'
import { handleConnectError, persistDeviceToken, signChallenge } from './auth'
import { DEFAULT_SCOPES } from './config'
import { translateGatewayEvent } from './translate'
import { asNumber, asString, throwGatewayError, toWebSocketUrl } from './utils'

export async function streamViaGatewayWebSocket(options: {
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
          if (
            deviceToken &&
            deviceToken !== options.state.auth.cachedDeviceToken
          ) {
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
          const translation = translateGatewayEvent(
            frame.payload ?? {},
            options.state,
          )
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
  deviceIdentity: GatewayState['auth']['deviceIdentity']
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
