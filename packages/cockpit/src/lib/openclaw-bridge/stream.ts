import type { StreamChunk } from '@tanstack/ai'

import type { GatewayState, SessionBridgeOptions } from './types'
import { AsyncQueue } from './async-queue'
import { loadBridgeAuthState } from './auth'
import { getBridgeConfig } from './config'
import { streamViaGatewayWebSocket } from './gateway'
import { deriveSessionKey, extractLatestUserMessageText } from './translate'
import { genId, toRunError } from './utils'

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
