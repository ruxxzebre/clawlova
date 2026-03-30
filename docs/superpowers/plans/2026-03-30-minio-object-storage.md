# MinIO Object Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add MinIO object storage to the Docker Compose stack so users can attach files to chat messages, with files uploaded directly to MinIO via pre-signed URLs and file URLs injected into the prompt sent to OpenClaw.

**Architecture:** MinIO runs as a new Docker Compose service. The cockpit server manages pre-signed URL generation and a JSON file registry for metadata. The browser uploads directly to MinIO, then the cockpit enriches the user's prompt with internal pre-signed URLs before forwarding to OpenClaw.

**Tech Stack:** MinIO (S3-compatible), `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, TanStack Start server functions, React 19

---

## File Structure

| File | Responsibility |
|---|---|
| `docker-compose.yml` | Add MinIO service, volume, cockpit env vars |
| `packages/cockpit/package.json` | Add S3 SDK dependencies |
| `packages/cockpit/src/lib/minio-client.ts` | **New** — S3 client init, bucket ensure, pre-signed URL helpers |
| `packages/cockpit/src/lib/file-registry.ts` | **New** — JSON file-based metadata registry on cockpit-state volume |
| `packages/cockpit/src/server/functions.ts` | Add `requestUpload`, `confirmUpload`, `getFileUrl` server fns |
| `packages/cockpit/src/lib/openclaw-bridge/types.ts` | Add `attachments` field to `SessionBridgeOptions` |
| `packages/cockpit/src/lib/openclaw-bridge/stream.ts` | Enrich prompt with attachment URLs |
| `packages/cockpit/src/routes/api.chat.ts` | Pass `attachments` from request body to bridge |
| `packages/cockpit/src/routes/index.tsx` | Attachment button, upload flow, file preview chips |
| `packages/cockpit/src/components/chat/MessageBubble.tsx` | Render file attachments inline |

---

### Task 1: Add MinIO to Docker Compose

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add MinIO service and volume**

Add the `minio` service after the `cockpit` service block (before `openclaw-cli`), and add `minio-data` to the `volumes` section:

```yaml
  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    ports:
      - "${MINIO_API_PORT:-9000}:9000"
      - "${MINIO_CONSOLE_PORT:-9001}:9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-openclaw-admin}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:-}
    volumes:
      - minio-data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 30s
      timeout: 5s
      retries: 3
    restart: unless-stopped
```

Add `minio-data:` to the `volumes:` section at the bottom.

- [ ] **Step 2: Add MinIO env vars to the cockpit service**

Add these environment variables to the `cockpit` service's `environment` block:

```yaml
      MINIO_ENDPOINT: http://minio:9000
      MINIO_PUBLIC_URL: ${MINIO_PUBLIC_URL:-http://localhost:9000}
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-openclaw-admin}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:-}
```

Add MinIO to cockpit's `depends_on`:

```yaml
      minio:
        condition: service_healthy
```

- [ ] **Step 3: Verify the compose file parses**

Run: `docker compose -f docker-compose.yml config > /dev/null`
Expected: exits 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add MinIO service to docker-compose"
```

---

### Task 2: Install S3 SDK dependencies

**Files:**
- Modify: `packages/cockpit/package.json`

- [ ] **Step 1: Add S3 SDK packages**

Run from repo root:

```bash
pnpm --filter cockpit add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

- [ ] **Step 2: Verify install succeeded**

Run: `pnpm --filter cockpit ls @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`
Expected: both packages listed with versions.

- [ ] **Step 3: Commit**

```bash
git add packages/cockpit/package.json pnpm-lock.yaml
git commit -m "feat: add S3 SDK dependencies for MinIO integration"
```

---

### Task 3: Create MinIO client module

**Files:**
- Create: `packages/cockpit/src/lib/minio-client.ts`

- [ ] **Step 1: Create the MinIO client module**

Create `packages/cockpit/src/lib/minio-client.ts`:

```typescript
import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'

const BUCKET = 'openclaw'

let client: S3Client | null = null

function getClient(): S3Client {
  if (client) return client
  client = new S3Client({
    endpoint: process.env['MINIO_ENDPOINT'] ?? 'http://minio:9000',
    region: 'us-east-1',
    credentials: {
      accessKeyId: process.env['MINIO_ROOT_USER'] ?? 'openclaw-admin',
      secretAccessKey: process.env['MINIO_ROOT_PASSWORD'] ?? '',
    },
    forcePathStyle: true,
  })
  return client
}

let bucketReady = false

async function ensureBucket(): Promise<void> {
  if (bucketReady) return
  const s3 = getClient()
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }))
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }))
  }
  bucketReady = true
}

export async function getUploadUrl(
  key: string,
  contentType: string,
): Promise<string> {
  await ensureBucket()
  const publicEndpoint =
    process.env['MINIO_PUBLIC_URL'] ?? 'http://localhost:9000'
  const publicClient = new S3Client({
    endpoint: publicEndpoint,
    region: 'us-east-1',
    credentials: {
      accessKeyId: process.env['MINIO_ROOT_USER'] ?? 'openclaw-admin',
      secretAccessKey: process.env['MINIO_ROOT_PASSWORD'] ?? '',
    },
    forcePathStyle: true,
  })
  return getSignedUrl(
    publicClient,
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: 300 },
  )
}

export async function getDownloadUrl(key: string): Promise<string> {
  await ensureBucket()
  const publicEndpoint =
    process.env['MINIO_PUBLIC_URL'] ?? 'http://localhost:9000'
  const publicClient = new S3Client({
    endpoint: publicEndpoint,
    region: 'us-east-1',
    credentials: {
      accessKeyId: process.env['MINIO_ROOT_USER'] ?? 'openclaw-admin',
      secretAccessKey: process.env['MINIO_ROOT_PASSWORD'] ?? '',
    },
    forcePathStyle: true,
  })
  return getSignedUrl(
    publicClient,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: 900 },
  )
}

export async function getInternalDownloadUrl(key: string): Promise<string> {
  await ensureBucket()
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: 900 },
  )
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await getClient().send(
      new HeadObjectCommand({ Bucket: BUCKET, Key: key }),
    )
    return true
  } catch {
    return false
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd packages/cockpit && npx tsc --noEmit src/lib/minio-client.ts`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/cockpit/src/lib/minio-client.ts
git commit -m "feat: add MinIO S3 client module with pre-signed URL helpers"
```

---

### Task 4: Create file registry module

**Files:**
- Create: `packages/cockpit/src/lib/file-registry.ts`

- [ ] **Step 1: Create the file registry module**

Create `packages/cockpit/src/lib/file-registry.ts`:

```typescript
import { readFile, writeFile, rename } from 'node:fs/promises'
import { join, dirname } from 'node:path'

export interface FileRecord {
  key: string
  originalName: string
  contentType: string
  sizeBytes: number
  uploadedAt: string
  sessionKey?: string
}

const REGISTRY_PATH =
  process.env['FILE_REGISTRY_PATH'] ??
  '/var/lib/cockpit/file-registry.json'

async function readRegistry(): Promise<FileRecord[]> {
  try {
    const data = await readFile(REGISTRY_PATH, 'utf-8')
    return JSON.parse(data) as FileRecord[]
  } catch {
    return []
  }
}

async function writeRegistry(records: FileRecord[]): Promise<void> {
  const tmpPath = join(dirname(REGISTRY_PATH), `.file-registry-${Date.now()}.tmp`)
  await writeFile(tmpPath, JSON.stringify(records, null, 2), 'utf-8')
  await rename(tmpPath, REGISTRY_PATH)
}

export async function addFile(record: FileRecord): Promise<void> {
  const records = await readRegistry()
  records.push(record)
  await writeRegistry(records)
}

export async function getFile(key: string): Promise<FileRecord | null> {
  const records = await readRegistry()
  return records.find((r) => r.key === key) ?? null
}

export async function listFiles(sessionKey?: string): Promise<FileRecord[]> {
  const records = await readRegistry()
  if (!sessionKey) return records
  return records.filter((r) => r.sessionKey === sessionKey)
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd packages/cockpit && npx tsc --noEmit src/lib/file-registry.ts`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/cockpit/src/lib/file-registry.ts
git commit -m "feat: add JSON file registry for uploaded file metadata"
```

---

### Task 5: Add upload server functions

**Files:**
- Modify: `packages/cockpit/src/server/functions.ts`

- [ ] **Step 1: Add imports and constants at the top of functions.ts**

Add after the existing imports (below line 9):

```typescript
import { getUploadUrl, getDownloadUrl, objectExists } from '#/lib/minio-client'
import { addFile, getFile } from '#/lib/file-registry'
```

Add after the `serialize` function (after line 33):

```typescript
// ---------------------------------------------------------------------------
// Upload constants
// ---------------------------------------------------------------------------

const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/json',
  'application/xml',
])

const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25 MB
```

- [ ] **Step 2: Add the requestUpload server function**

Add at the end of the file:

```typescript
// ---------------------------------------------------------------------------
// File uploads
// ---------------------------------------------------------------------------

export const requestUpload = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      filename: string
      contentType: string
      sizeBytes: number
      sessionKey?: string
    }) => data,
  )
  .handler(async ({ data }) => {
    if (!ALLOWED_CONTENT_TYPES.has(data.contentType)) {
      throw new Error(`File type not allowed: ${data.contentType}`)
    }
    if (data.sizeBytes > MAX_FILE_SIZE) {
      throw new Error(
        `File too large: ${data.sizeBytes} bytes (max ${MAX_FILE_SIZE})`,
      )
    }

    const uuid = crypto.randomUUID()
    const safeName = data.filename.replace(/[^a-zA-Z0-9._-]/g, '_')
    const key = `uploads/${uuid}_${safeName}`

    const uploadUrl = await getUploadUrl(key, data.contentType)
    return { uploadUrl, key }
  })
```

- [ ] **Step 3: Add the confirmUpload server function**

Add after `requestUpload`:

```typescript
export const confirmUpload = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      key: string
      originalName: string
      contentType: string
      sizeBytes: number
      sessionKey?: string
    }) => data,
  )
  .handler(async ({ data }) => {
    const exists = await objectExists(data.key)
    if (!exists) {
      throw new Error(`Object not found in storage: ${data.key}`)
    }

    await addFile({
      key: data.key,
      originalName: data.originalName,
      contentType: data.contentType,
      sizeBytes: data.sizeBytes,
      uploadedAt: new Date().toISOString(),
      sessionKey: data.sessionKey,
    })

    const downloadUrl = await getDownloadUrl(data.key)
    return { downloadUrl }
  })
```

- [ ] **Step 4: Add the getFileUrl server function**

Add after `confirmUpload`:

```typescript
export const getFileUrl = createServerFn({ method: 'GET' })
  .inputValidator((data: { key: string }) => data)
  .handler(async ({ data }) => {
    const record = await getFile(data.key)
    if (!record) {
      throw new Error(`File not found in registry: ${data.key}`)
    }
    const downloadUrl = await getDownloadUrl(data.key)
    return { downloadUrl, record }
  })
```

- [ ] **Step 5: Verify the project builds**

Run: `cd packages/cockpit && npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add packages/cockpit/src/server/functions.ts
git commit -m "feat: add requestUpload, confirmUpload, getFileUrl server functions"
```

---

### Task 6: Add attachments to the bridge data flow

**Files:**
- Modify: `packages/cockpit/src/lib/openclaw-bridge/types.ts`
- Modify: `packages/cockpit/src/lib/openclaw-bridge/stream.ts`
- Modify: `packages/cockpit/src/routes/api.chat.ts`

- [ ] **Step 1: Add FileAttachment type and attachments field to types.ts**

In `packages/cockpit/src/lib/openclaw-bridge/types.ts`, add after the `StreamChunk` import on line 1:

```typescript
export interface FileAttachment {
  key: string
  originalName: string
  contentType: string
  sizeBytes: number
}
```

Add the `attachments` field to `SessionBridgeOptions` (after `sessionKey?`):

```typescript
export interface SessionBridgeOptions {
  messages: UIMessage[]
  abortSignal?: AbortSignal
  sessionKey?: string
  attachments?: FileAttachment[]
}
```

- [ ] **Step 2: Enrich prompt with attachment URLs in stream.ts**

In `packages/cockpit/src/lib/openclaw-bridge/stream.ts`, add the import at the top:

```typescript
import { getInternalDownloadUrl } from '#/lib/minio-client'
```

In the `runSessionBridge` function, after line 36 (`const prompt = extractLatestUserMessageText(options.messages)`) and the null check, add the enrichment logic. Replace lines 36-39 with:

```typescript
    let prompt = extractLatestUserMessageText(options.messages)
    if (!prompt) {
      throw new Error('No user message found to send to OpenClaw')
    }

    if (options.attachments && options.attachments.length > 0) {
      const attachmentLines: string[] = []
      for (const att of options.attachments) {
        const url = await getInternalDownloadUrl(att.key)
        const sizeKB = Math.round(att.sizeBytes / 1024)
        attachmentLines.push(
          `[Attached file: ${att.originalName} (${att.contentType}, ${sizeKB}KB)]\nURL: ${url}`,
        )
      }
      prompt = prompt + '\n\n' + attachmentLines.join('\n\n')
    }
```

- [ ] **Step 3: Pass attachments from api.chat.ts to the bridge**

In `packages/cockpit/src/routes/api.chat.ts`, update the handler to extract and pass attachments. Replace lines 13-26 with:

```typescript
        const body = await request.json()
        const messages = body.messages
        const sessionKey: string | undefined = body.data?.sessionKey
        const attachments: { key: string; originalName: string; contentType: string; sizeBytes: number }[] | undefined = body.data?.attachments

        const abortController = new AbortController()
        request.signal.addEventListener('abort', () => abortController.abort(), {
          once: true,
        })

        const stream = createOpenClawSessionStream({
          messages,
          sessionKey,
          attachments,
          abortSignal: abortController.signal,
        })
```

- [ ] **Step 4: Verify the project builds**

Run: `cd packages/cockpit && npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/cockpit/src/lib/openclaw-bridge/types.ts packages/cockpit/src/lib/openclaw-bridge/stream.ts packages/cockpit/src/routes/api.chat.ts
git commit -m "feat: plumb file attachments through bridge to enrich prompt with URLs"
```

---

### Task 7: Add file attachment UI to chat input

**Files:**
- Modify: `packages/cockpit/src/routes/index.tsx`

- [ ] **Step 1: Add imports and attachment state**

In `packages/cockpit/src/routes/index.tsx`, add the import for the upload server functions and the Paperclip icon. Update the lucide import on line 7:

```typescript
import { ArrowDown, Check, Code, Lightbulb, MessageCircle, Paperclip, RefreshCw, Send, Square, Wrench, X } from 'lucide-react'
```

Add the import for the upload functions after the other imports:

```typescript
import { requestUpload, confirmUpload } from '#/server/functions'
```

- [ ] **Step 2: Add attachment state and upload handler to ChatView**

Inside the `ChatView` component, after the `const [lastInput, setLastInput]` line (line 102), add:

```typescript
  const [pendingFiles, setPendingFiles] = useState<
    { key: string; originalName: string; contentType: string; sizeBytes: number; previewUrl?: string }[]
  >([])
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    setIsUploading(true)
    try {
      for (const file of Array.from(files)) {
        const { uploadUrl, key } = await requestUpload({
          data: {
            filename: file.name,
            contentType: file.type,
            sizeBytes: file.size,
          },
        })

        await fetch(uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        })

        await confirmUpload({
          data: {
            key,
            originalName: file.name,
            contentType: file.type,
            sizeBytes: file.size,
          },
        })

        const previewUrl = file.type.startsWith('image/')
          ? URL.createObjectURL(file)
          : undefined

        setPendingFiles((prev) => [
          ...prev,
          { key, originalName: file.name, contentType: file.type, sizeBytes: file.size, previewUrl },
        ])
      }
    } catch (err) {
      console.error('Upload failed:', err)
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function removePendingFile(key: string) {
    setPendingFiles((prev) => {
      const removed = prev.find((f) => f.key === key)
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl)
      return prev.filter((f) => f.key !== key)
    })
  }
```

- [ ] **Step 3: Update handleSubmit to include attachments**

Replace the `handleSubmit` function with:

```typescript
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if ((!text && pendingFiles.length === 0) || isLoading) return
    setLastInput(text)
    setInput('')
    const attachments = pendingFiles.map(({ key, originalName, contentType, sizeBytes }) => ({
      key,
      originalName,
      contentType,
      sizeBytes,
    }))
    setPendingFiles([])
    if (inputRef.current) inputRef.current.style.height = 'auto'
    await sendMessage(text || 'See attached file(s)', {
      body: { attachments },
    })
  }
```

- [ ] **Step 4: Update the useChat body config**

The `useChat` hook's `body` needs to forward the attachments. Update the `useChat` call to use a function for `body` so it can merge dynamic data. Replace the `useChat` call:

```typescript
  const { messages, sendMessage, isLoading, error, stop } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    initialMessages,
    onFinish: onChatFinish,
  })
```

Note: The `body` option is removed from `useChat` because attachments and sessionKey are now passed per-message via `sendMessage`. Update the `sendMessage` call to include `sessionKey` in the body:

```typescript
    await sendMessage(text || 'See attached file(s)', {
      body: { sessionKey, attachments },
    })
```

Also update the `handleRetry` function:

```typescript
  async function handleRetry() {
    if (!lastInput || isLoading) return
    await sendMessage(lastInput, { body: { sessionKey } })
  }
```

- [ ] **Step 5: Add the file input element and attachment button to the form**

In the JSX, update the form section. Replace the `<form>` block with:

```tsx
          <form onSubmit={handleSubmit} className="flex flex-col gap-2">
            {/* Pending file previews */}
            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {pendingFiles.map((file) => (
                  <div
                    key={file.key}
                    className="flex items-center gap-2 rounded-lg border border-sand-200 dark:border-sand-700 bg-sand-100 dark:bg-sand-800 px-2.5 py-1.5 text-xs text-sand-600 dark:text-sand-300"
                  >
                    {file.previewUrl ? (
                      <img
                        src={file.previewUrl}
                        alt={file.originalName}
                        className="h-8 w-8 rounded object-cover"
                      />
                    ) : null}
                    <span className="max-w-[120px] truncate">
                      {file.originalName}
                    </span>
                    <button
                      type="button"
                      onClick={() => removePendingFile(file.key)}
                      className="text-sand-400 hover:text-sand-600 dark:hover:text-sand-200"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 sm:gap-3">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml,application/pdf,text/plain,text/csv,text/markdown,application/json,application/xml"
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading || isUploading}
                title="Attach file"
                className="flex h-11 w-11 sm:h-10 sm:w-10 flex-shrink-0 items-center justify-center self-end rounded-xl border border-sand-200 dark:border-sand-700 bg-sand-100 dark:bg-sand-800 text-sand-500 dark:text-sand-400 transition-colors hover:bg-sand-200 dark:hover:bg-sand-700 hover:text-sand-700 dark:hover:text-sand-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value)
                  resizeTextarea()
                }}
                onKeyDown={handleKeyDown}
                placeholder={
                  isUploading
                    ? 'Uploading file...'
                    : isLoading
                      ? 'OpenClaw is responding...'
                      : 'Message OpenClaw\u2026'
                }
                disabled={isLoading || isUploading}
                aria-disabled={isLoading || isUploading}
                rows={1}
                className="flex-1 resize-none rounded-xl border border-sand-200 dark:border-sand-700 bg-sand-100 dark:bg-sand-800 px-3 py-2.5 sm:px-4 text-sm sm:text-base text-sand-800 dark:text-sand-100 placeholder:text-sand-400 outline-none focus:border-terra-400 dark:focus:border-terra-500 focus:ring-1 focus:ring-terra-400/30 disabled:cursor-not-allowed disabled:bg-sand-200 disabled:text-sand-500 dark:disabled:bg-sand-800/80 dark:disabled:text-sand-400 disabled:opacity-60"
              />
              {isLoading ? (
                <motion.button
                  type="button"
                  onClick={stop}
                  title="Stop generating (Esc)"
                  whileTap={{ scale: 0.92 }}
                  className="flex h-11 w-11 sm:h-10 sm:w-10 flex-shrink-0 items-center justify-center self-end rounded-xl bg-red-600 text-white transition-colors hover:bg-red-700"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </motion.button>
              ) : (
                <motion.button
                  type="submit"
                  disabled={!input.trim() && pendingFiles.length === 0}
                  aria-disabled={!input.trim() && pendingFiles.length === 0}
                  title="Send message (Enter)"
                  whileTap={{ scale: 0.92 }}
                  className="flex h-11 w-11 sm:h-10 sm:w-10 flex-shrink-0 items-center justify-center self-end rounded-xl bg-terra-500 text-white transition-colors hover:bg-terra-600 disabled:cursor-not-allowed disabled:bg-sand-300 disabled:text-sand-500 dark:disabled:bg-sand-700 dark:disabled:text-sand-400"
                >
                  <Send className="h-4 w-4" />
                </motion.button>
              )}
            </div>
          </form>
```

- [ ] **Step 6: Update the api.chat.ts to read attachments from body.data**

The `sendMessage` from `useChat` sends custom body fields under `body.data`. In `api.chat.ts`, the `body.data` already contains `sessionKey`. The `attachments` field will be available at `body.data.attachments`. This is already handled in Task 6, Step 3 — no additional change needed here.

- [ ] **Step 7: Verify the project builds**

Run: `cd packages/cockpit && npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 8: Commit**

```bash
git add packages/cockpit/src/routes/index.tsx
git commit -m "feat: add file attachment UI with upload flow in chat input"
```

---

### Task 8: Render file attachments in MessageBubble

**Files:**
- Modify: `packages/cockpit/src/components/chat/MessageBubble.tsx`

- [ ] **Step 1: Add file attachment detection and rendering**

In `packages/cockpit/src/components/chat/MessageBubble.tsx`, add the import:

```typescript
import { useState, useEffect } from 'react'
import { FileText, Download } from 'lucide-react'
import { getFileUrl } from '#/server/functions'
```

Remove the existing `import { useState } from 'react'` on line 1 since it's merged above.

Add a helper component after the imports (before `const LONG_MESSAGE_THRESHOLD`):

```typescript
const ATTACHMENT_REGEX = /\[Attached file: (.+?) \((.+?), (\d+)KB\)\]\nURL: (.+)/g

function parseAttachments(
  text: string,
): { originalName: string; contentType: string; sizeKB: number; url: string }[] {
  const matches: { originalName: string; contentType: string; sizeKB: number; url: string }[] = []
  let match: RegExpExecArray | null
  const regex = new RegExp(ATTACHMENT_REGEX.source, 'g')
  while ((match = regex.exec(text)) !== null) {
    matches.push({
      originalName: match[1],
      contentType: match[2],
      sizeKB: parseInt(match[3], 10),
      url: match[4],
    })
  }
  return matches
}

function AttachmentChip({
  originalName,
  contentType,
  sizeKB,
}: {
  originalName: string
  contentType: string
  sizeKB: number
}) {
  const isImage = contentType.startsWith('image/')
  // For user messages, we don't have a URL to display — just show the chip
  return (
    <div className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-xs">
      <FileText className="h-3.5 w-3.5 flex-shrink-0" />
      <span className="max-w-[150px] truncate">{originalName}</span>
      <span className="opacity-60">{sizeKB}KB</span>
    </div>
  )
}
```

- [ ] **Step 2: Detect attachments in user message text**

In the `renderContent` function, update the user text rendering (inside the `if (isUser)` block). Replace:

```typescript
          if (isUser) {
            return (
              <p key={i} className="whitespace-pre-wrap leading-relaxed">
                {part.content}
              </p>
            )
          }
```

With:

```typescript
          if (isUser) {
            const attachments = parseAttachments(part.content)
            const cleanText = part.content
              .replace(ATTACHMENT_REGEX, '')
              .trim()
            return (
              <div key={i}>
                {cleanText && (
                  <p className="whitespace-pre-wrap leading-relaxed">
                    {cleanText}
                  </p>
                )}
                {attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {attachments.map((att, j) => (
                      <AttachmentChip
                        key={j}
                        originalName={att.originalName}
                        contentType={att.contentType}
                        sizeKB={att.sizeKB}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          }
```

- [ ] **Step 3: Verify the project builds**

Run: `cd packages/cockpit && npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add packages/cockpit/src/components/chat/MessageBubble.tsx
git commit -m "feat: render file attachment chips in user message bubbles"
```

---

### Task 9: Manual integration test

- [ ] **Step 1: Set up environment**

Ensure `.env` has `MINIO_ROOT_PASSWORD` set:

```bash
echo "MINIO_ROOT_PASSWORD=changeme-secure-password-123" >> .env
```

- [ ] **Step 2: Build and start the stack**

```bash
docker compose build cockpit
docker compose up -d
```

- [ ] **Step 3: Verify MinIO is healthy**

```bash
docker compose ps minio
```

Expected: minio service is running and healthy.

- [ ] **Step 4: Test the MinIO console**

Open `http://localhost:9001` in a browser. Log in with `openclaw-admin` / the password from `.env`. Verify the console loads.

- [ ] **Step 5: Test the upload flow**

1. Open `http://localhost:3000` (cockpit)
2. Click the attachment (paperclip) button
3. Select an image file
4. Verify the file preview chip appears in the input area
5. Type a message and send
6. Verify the message appears in the chat with the attachment chip
7. Check MinIO console — verify the file appears in the `openclaw` bucket under `uploads/`

- [ ] **Step 6: Commit any fixes**

If any fixes were needed during testing, commit them.
