import { createHash, createHmac } from 'node:crypto'

const R2_REGION = 'auto'
const R2_SERVICE = 's3'
const R2_BUCKET_NAME = 'livesnaps'
const EMPTY_BODY_HASH = createHash('sha256').update('').digest('hex')

export interface R2Config {
  accessKeyId: string
  accountId: string
  bucket: string
  secretAccessKey: string
}

export class R2ConfigurationError extends Error {
  constructor() {
    super('R2 is not configured.')
    this.name = 'R2ConfigurationError'
  }
}

function hmac(key: string | Buffer, data: string): Buffer
function hmac(key: string | Buffer, data: string, encoding: 'hex'): string
function hmac(key: string | Buffer, data: string, encoding?: 'hex'): Buffer | string {
  const digest = createHmac('sha256', key).update(data, 'utf8')

  return encoding ? digest.digest(encoding) : digest.digest()
}

const hash = (data: string | ArrayBuffer) =>
  createHash('sha256')
    .update(typeof data === 'string' ? data : Buffer.from(data))
    .digest('hex')

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/')

const getR2Config = (overrides?: Partial<R2Config>): R2Config => {
  const accountId = overrides?.accountId?.trim() || process.env.R2_ACCOUNT_ID?.trim()
  const accessKeyId = overrides?.accessKeyId?.trim() || process.env.R2_ACCESS_KEY_ID?.trim()
  const secretAccessKey = overrides?.secretAccessKey?.trim() || process.env.R2_SECRET_ACCESS_KEY?.trim()
  const bucket = overrides?.bucket?.trim() || process.env.R2_BUCKET_NAME?.trim() || R2_BUCKET_NAME

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new R2ConfigurationError()
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket
  }
}

const getSignedR2Headers = ({
  accessKeyId,
  host,
  method,
  pathname,
  payloadHash,
  secretAccessKey
}: {
  accessKeyId: string
  host: string
  method: 'DELETE' | 'GET' | 'PUT'
  pathname: string
  payloadHash: string
  secretAccessKey: string
}) => {
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`
  const canonicalRequest = [method, encodePath(pathname), '', canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const credentialScope = `${dateStamp}/${R2_REGION}/${R2_SERVICE}/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, hash(canonicalRequest)].join('\n')
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp)
  const regionKey = hmac(dateKey, R2_REGION)
  const serviceKey = hmac(regionKey, R2_SERVICE)
  const signingKey = hmac(serviceKey, 'aws4_request')
  const signature = hmac(signingKey, stringToSign, 'hex')

  return {
    authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate
  }
}

const requestR2 = ({
  body,
  contentType,
  method,
  objectKey,
  r2
}: {
  body?: ArrayBuffer
  contentType?: string
  method: 'DELETE' | 'GET' | 'PUT'
  objectKey: string
  r2?: Partial<R2Config>
}) => {
  const config = getR2Config(r2)
  const host = `${config.accountId}.r2.cloudflarestorage.com`
  const pathname = `/${config.bucket}/${objectKey}`
  const payloadHash = body ? hash(body) : EMPTY_BODY_HASH

  return fetch(`https://${host}${encodePath(pathname)}`, {
    method,
    headers: {
      ...getSignedR2Headers({
        accessKeyId: config.accessKeyId,
        host,
        method,
        pathname,
        payloadHash,
        secretAccessKey: config.secretAccessKey
      }),
      ...(contentType ? { 'content-type': contentType } : {})
    },
    ...(body ? { body } : {})
  })
}

export const getR2Object = (objectKey: string, r2?: Partial<R2Config>) =>
  requestR2({
    method: 'GET',
    objectKey,
    r2
  })

export const putR2Object = ({
  body,
  contentType,
  objectKey,
  r2
}: {
  body: ArrayBuffer
  contentType: string
  objectKey: string
  r2?: Partial<R2Config>
}) =>
  requestR2({
    body,
    contentType,
    method: 'PUT',
    objectKey,
    r2
  })

export const deleteR2Object = (objectKey: string, r2?: Partial<R2Config>) =>
  requestR2({
    method: 'DELETE',
    objectKey,
    r2
  })
