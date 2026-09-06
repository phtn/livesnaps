/**
 * Reads snap photos straight out of R2 from inside a Convex action.
 *
 * The Worker has its own copy of this signing in `src/lib/r2/server.ts`, but
 * that one is built on `node:crypto` and this file has to run in the Convex
 * runtime, where only Web Crypto exists. The wire format is identical — SigV4
 * over the S3 API — so the two stay in step; only the primitives differ.
 */

const R2_REGION = 'auto'
const R2_SERVICE = 's3'
const DEFAULT_BUCKET = 'livesnaps'

export class R2ConfigurationError extends Error {
  constructor() {
    super(
      'R2 is not configured for this Convex deployment. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME.'
    )
    this.name = 'R2ConfigurationError'
  }
}

interface R2Config {
  accessKeyId: string
  accountId: string
  bucket: string
  secretAccessKey: string
}

const encoder = new TextEncoder()

const toHex = (bytes: ArrayBuffer): string =>
  Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

const sha256Hex = async (data: string | ArrayBuffer): Promise<string> =>
  toHex(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? encoder.encode(data) : data))

const hmac = async (key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> => {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data))
}

const encodePath = (path: string): string => path.split('/').map(encodeURIComponent).join('/')

const getR2Config = (): R2Config => {
  const accountId = process.env.R2_ACCOUNT_ID?.trim()
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim()
  const bucket = process.env.R2_BUCKET_NAME?.trim() || DEFAULT_BUCKET

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new R2ConfigurationError()
  }

  return { accessKeyId, accountId, bucket, secretAccessKey }
}

/** True when this deployment can read R2 at all, so callers can degrade rather than throw. */
export const isR2Configured = (): boolean =>
  Boolean(
    process.env.R2_ACCOUNT_ID?.trim() &&
      process.env.R2_ACCESS_KEY_ID?.trim() &&
      process.env.R2_SECRET_ACCESS_KEY?.trim()
  )

/**
 * Fetches one object's bytes. Throws on a non-2xx so a missing or unreadable
 * photo surfaces as a named failure rather than an empty attachment.
 */
export async function getR2ObjectBytes(objectKey: string): Promise<ArrayBuffer> {
  const config = getR2Config()
  const host = `${config.accountId}.r2.cloudflarestorage.com`
  const pathname = `/${config.bucket}/${objectKey}`
  // Every GET here has an empty body, so the payload hash is the digest of ''.
  const payloadHash = await sha256Hex('')

  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`
  const canonicalRequest = ['GET', encodePath(pathname), '', canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const credentialScope = `${dateStamp}/${R2_REGION}/${R2_SERVICE}/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, await sha256Hex(canonicalRequest)].join('\n')

  const dateKey = await hmac(encoder.encode(`AWS4${config.secretAccessKey}`), dateStamp)
  const regionKey = await hmac(dateKey, R2_REGION)
  const serviceKey = await hmac(regionKey, R2_SERVICE)
  const signingKey = await hmac(serviceKey, 'aws4_request')
  const signature = toHex(await hmac(signingKey, stringToSign))

  const response = await fetch(`https://${host}${encodePath(pathname)}`, {
    method: 'GET',
    headers: {
      authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate
    }
  })

  if (!response.ok) {
    throw new Error(`R2 read failed for ${objectKey} (${response.status}).`)
  }

  return response.arrayBuffer()
}

/**
 * Base64 for an attachment payload. Chunked because spreading a multi-megabyte
 * photo into `String.fromCharCode` blows the argument limit.
 */
export function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const CHUNK = 0x8000
  let binary = ''

  for (let offset = 0; offset < view.length; offset += CHUNK) {
    binary += String.fromCharCode(...view.subarray(offset, offset + CHUNK))
  }

  return btoa(binary)
}
