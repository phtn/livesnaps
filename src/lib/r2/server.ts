import 'server-only'

import { createHash, createHmac } from 'node:crypto'

const R2_REGION = 'auto'
const R2_SERVICE = 's3'
const R2_BUCKET_NAME = 'livesnaps'
const EMPTY_BODY_HASH = createHash('sha256').update('').digest('hex')

interface R2Config {
  accessKeyId: string
  accountId: string
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

const getR2Config = (): R2Config => {
  const accountId = process.env.R2_ACCOUNT_ID?.trim()
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim()

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new R2ConfigurationError()
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey
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
  method: 'GET' | 'PUT'
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
  objectKey
}: {
  body?: ArrayBuffer
  contentType?: string
  method: 'GET' | 'PUT'
  objectKey: string
}) => {
  const config = getR2Config()
  const host = `${config.accountId}.r2.cloudflarestorage.com`
  const pathname = `/${R2_BUCKET_NAME}/${objectKey}`
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

export const getR2Object = (objectKey: string) =>
  requestR2({
    method: 'GET',
    objectKey
  })

export const putR2Object = ({
  body,
  contentType,
  objectKey
}: {
  body: ArrayBuffer
  contentType: string
  objectKey: string
}) =>
  requestR2({
    body,
    contentType,
    method: 'PUT',
    objectKey
  })
