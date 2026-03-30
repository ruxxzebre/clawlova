# MinIO Object Storage Integration

## Summary

Add MinIO (S3-compatible object storage) to the Docker Compose stack to support file uploads in the cockpit chat UI. Users upload files directly to MinIO via pre-signed URLs, and the cockpit enriches chat messages with file URLs before forwarding to OpenClaw.

## Goals

- Users can attach files (images, documents) to chat messages
- Files are stored in MinIO with no anonymous access
- Pre-signed URLs handle all browser-to-MinIO communication
- File metadata is tracked in a lightweight JSON registry
- Bucket structure supports future expansion (artifacts, session-scoped storage)

## Architecture

### Docker Compose

New `minio` service added:

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

New volume: `minio-data`.

Cockpit service gains:
- `MINIO_ENDPOINT: http://minio:9000` (internal Docker network)
- `MINIO_PUBLIC_URL: http://localhost:9000` (browser-facing)
- `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD` (same creds as MinIO service)
- `depends_on: minio` with `condition: service_healthy`

`MINIO_ROOT_PASSWORD` has no default — must be set in `.env`.

### Bucket Structure

Single bucket: `openclaw`

```
openclaw/
  uploads/{uuid}_{filename}     # chat uploads, flat
  artifacts/                    # reserved for future agent output
  sessions/                     # reserved for future session-scoped storage
```

Bucket policy: private, no anonymous access. All access via pre-signed URLs.

### MinIO Client Module

**File:** `packages/cockpit/src/lib/minio-client.ts`

Uses `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`.

- Lazily initializes S3 client from env vars
- Ensures `openclaw` bucket exists on first use (create if missing)
- Exports:
  - `getUploadUrl(key, contentType, maxSizeBytes)` — pre-signed PUT, 5 min expiry
  - `getDownloadUrl(key)` — pre-signed GET, 15 min expiry

Key format: `uploads/{uuid}_{sanitized_filename}` — UUID generated server-side.

### File Registry

**File:** `packages/cockpit/src/lib/file-registry.ts`

JSON file at `/var/lib/cockpit/file-registry.json` on the existing `cockpit-state` volume.

```typescript
interface FileRecord {
  key: string              // S3 key
  originalName: string     // original filename
  contentType: string      // MIME type
  sizeBytes: number        // file size
  uploadedAt: string       // ISO timestamp
  sessionKey?: string      // chat session association
}
```

Exports:
- `addFile(record)` — append + atomic write (write-to-temp + rename)
- `getFile(key)` — lookup by S3 key
- `listFiles(sessionKey?)` — list all, optionally filter by session

### Server Functions

**File:** `packages/cockpit/src/server/functions.ts` (added alongside existing server functions)

Using TanStack Start `createServerFn()`:

**`requestUpload`** (POST)
- Input: `{ filename, contentType, sizeBytes, sessionKey? }`
- Validates content type against allowlist:
  - Images: `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/svg+xml`
  - Documents: `application/pdf`, `text/plain`, `text/csv`, `text/markdown`
  - Data: `application/json`, `application/xml`
- Validates size (max 25MB)
- Generates UUID, builds S3 key
- Returns `{ uploadUrl, key }` — uploadUrl uses `MINIO_PUBLIC_URL`

**`confirmUpload`** (POST)
- Input: `{ key, originalName, contentType, sizeBytes, sessionKey? }`
- HEAD request to MinIO to verify object exists
- Adds record to file registry
- Returns `{ downloadUrl }`

**`getFileUrl`** (GET)
- Input: `{ key }`
- Looks up registry, returns `{ downloadUrl, record }`

### Chat Integration

**Upload flow (browser):**
1. User clicks attachment button next to chat input
2. Client calls `requestUpload()` → gets pre-signed URL + key
3. Client PUTs file directly to MinIO via pre-signed URL
4. Client calls `confirmUpload()` → gets download URL
5. File appears as preview chip in input area

**Message enrichment (server) — data flow:**

The attachment metadata needs to travel: browser → API route → bridge → prompt.

1. **Client sends attachments with the chat request.** The `api.chat.ts` route handler accepts an additional `attachments` field in the POST body:
   ```typescript
   attachments?: { key: string, originalName: string, contentType: string, sizeBytes: number }[]
   ```

2. **`SessionBridgeOptions` (in `types.ts`) gains a new field:**
   ```typescript
   attachments?: { key: string, originalName: string, contentType: string, sizeBytes: number }[]
   ```
   The API route passes this through when calling `createOpenClawSessionStream()`.

3. **Enrichment happens in `stream.ts`** inside `createOpenClawSessionStream`, after `extractLatestUserMessageText()` extracts the user's text and before it's set on the `GatewayState` `prompt` field. If `options.attachments` is non-empty, the function generates internal pre-signed URLs (via `MINIO_ENDPOINT`) for each attachment and appends them to the prompt text:

```
User's text here

[Attached file: screenshot.png (image/png, 245KB)]
URL: http://minio:9000/openclaw/uploads/abc123_screenshot.png?presigned...
```

The URL uses an internal pre-signed URL (`MINIO_ENDPOINT`) so the agent can fetch it within the Docker network.

**Rendering in chat UI:**

`MessageBubble` extended to detect file attachments and render:
- Image thumbnails for image content types
- Download links with filename + size for other types
- Download URLs fetched via `getFileUrl()` on demand — image `src` attributes must not cache the URL; re-fetch when the URL expires or on load error

### Security

- MinIO credentials are server-side only, never exposed to the browser
- Pre-signed upload URLs: 5 minute expiry, scoped to a single object key
- Pre-signed download URLs: 15 minute expiry, generated on demand
- Bucket policy: fully private, no anonymous access
- Content type allowlist prevents executable uploads
- Max file size enforced server-side (25MB)
- UUID-prefixed keys prevent overwrites of existing files

## New Dependencies

- `@aws-sdk/client-s3`
- `@aws-sdk/s3-request-presigner`

## New Environment Variables

| Variable | Service | Default | Required |
|---|---|---|---|
| `MINIO_ROOT_USER` | minio, cockpit | `openclaw-admin` | No |
| `MINIO_ROOT_PASSWORD` | minio, cockpit | *(none)* | Yes |
| `MINIO_ENDPOINT` | cockpit | `http://minio:9000` | No |
| `MINIO_PUBLIC_URL` | cockpit | `http://localhost:9000` | No |
| `MINIO_API_PORT` | docker-compose | `9000` | No |
| `MINIO_CONSOLE_PORT` | docker-compose | `9001` | No |

## Files Changed

| File | Change |
|---|---|
| `docker-compose.yml` | Add MinIO service, volume, cockpit env vars + dependency |
| `packages/cockpit/package.json` | Add S3 SDK dependencies |
| `packages/cockpit/src/lib/minio-client.ts` | New — S3 client, bucket init, pre-signed URLs |
| `packages/cockpit/src/lib/file-registry.ts` | New — JSON file metadata registry |
| `packages/cockpit/src/server/functions.ts` | Add upload server functions alongside existing ones |
| `packages/cockpit/src/routes/index.tsx` | Attachment button, upload flow, file preview chips |
| `packages/cockpit/src/components/chat/MessageBubble.tsx` | Render file attachments inline |
| `packages/cockpit/src/lib/openclaw-bridge/types.ts` | Add `attachments` field to `SessionBridgeOptions` |
| `packages/cockpit/src/lib/openclaw-bridge/stream.ts` | Enrich prompt text with file URLs from attachments |
| `packages/cockpit/src/routes/api.chat.ts` | Accept and forward `attachments` from request body |
