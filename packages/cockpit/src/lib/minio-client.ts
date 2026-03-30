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
