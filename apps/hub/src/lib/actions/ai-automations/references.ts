import 'server-only'

import type { LookupAddress } from 'node:dns'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { TextDecoder } from 'node:util'
import { Agent } from 'undici'
import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'
import { uploadPrivateToR2 } from '@/lib/utils/r2'

export const MAX_REFERENCE_FILE_BYTES = 10 * 1024 * 1024
export const MAX_LINK_BYTES = 1024 * 1024
export const MAX_EXTRACTED_REFERENCE_CHARS = 40_000

const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

const TEXT_REFERENCE_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/csv',
])

const BINARY_REFERENCE_MIME_TYPES = new Set([
  'application/pdf',
  DOCX_MIME_TYPE,
])

export const ALLOWED_REFERENCE_MIME_TYPES = new Set([
  ...TEXT_REFERENCE_MIME_TYPES,
  ...BINARY_REFERENCE_MIME_TYPES,
])

const LINK_FETCH_TIMEOUT_MS = 15_000
const textDecoder = new TextDecoder('utf-8', { fatal: true })

export interface ExtractedReference {
  label: string
  mimeType: string
  fileSize: number
  storagePath?: string
  sourceUrl?: string
  extractedText: string
  metadata: Record<string, any>
}

export async function extractReferenceFile(file: File, userId: string): Promise<ExtractedReference> {
  const mimeType = normalizeReferenceMimeType(file.type, file.name)
  if (!ALLOWED_REFERENCE_MIME_TYPES.has(mimeType)) {
    throw new Error('Unsupported reference file type')
  }
  if (file.size > MAX_REFERENCE_FILE_BYTES) {
    throw new Error('Reference file is too large')
  }

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  assertReferenceFileSignature(buffer, mimeType)
  const extractedText = await extractTextFromBuffer(buffer, mimeType)
  if (!extractedText.trim()) {
    throw new Error('No readable text found in reference file')
  }

  const timestamp = Date.now()
  const cleanName = file.name
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 140)
  const storagePath = await uploadPrivateToR2(
    `${userId}/ai-automation-references/${timestamp}_${cleanName}`,
    buffer,
    mimeType
  )

  return {
    label: file.name,
    mimeType,
    fileSize: buffer.length,
    storagePath,
    extractedText: limitExtractedText(extractedText),
    metadata: { original_name: file.name, extracted_chars: extractedText.length },
  }
}

export async function extractReferenceUrl(rawUrl: string): Promise<ExtractedReference> {
  const { url, addresses } = await resolveSafeReferenceUrl(rawUrl)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), LINK_FETCH_TIMEOUT_MS)
  const dispatcher = createPinnedDispatcher(url.hostname, addresses)

  try {
    const response = await fetch(url.href, {
      redirect: 'error',
      signal: controller.signal,
      dispatcher,
      headers: {
        Accept: 'text/html,text/plain,text/markdown,text/csv,application/json,application/xml,text/xml,*/*;q=0.2',
        'User-Agent': 'HubAutomationBot/1.0',
      },
    } as RequestInit & { dispatcher: Agent })

    if (!response.ok) throw new Error(`Reference URL returned HTTP ${response.status}`)
    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() || 'text/plain'
    if (!isAllowedLinkContentType(contentType)) throw new Error('Reference URL content type is not supported')

    const text = await readLimitedResponseText(response, MAX_LINK_BYTES)
    const extractedText = contentType === 'text/html'
      ? extractTextFromHtml(text)
      : normalizeWhitespace(text)

    if (!extractedText.trim()) throw new Error('No readable text found at reference URL')

    return {
      label: url.hostname,
      mimeType: contentType,
      fileSize: Buffer.byteLength(text),
      sourceUrl: url.href,
      extractedText: limitExtractedText(extractedText),
      metadata: { fetched_at: new Date().toISOString(), extracted_chars: extractedText.length },
    }
  } finally {
    clearTimeout(timeout)
    await dispatcher.close().catch(() => {})
  }
}

async function extractTextFromBuffer(buffer: Buffer, mimeType: string) {
  if (mimeType === 'application/pdf') {
    const parser = new PDFParse({ data: buffer })
    try {
      const result = await parser.getText()
      return result.text || ''
    } finally {
      await parser.destroy().catch(() => {})
    }
  }

  if (mimeType === DOCX_MIME_TYPE) {
    const result = await mammoth.extractRawText({ buffer })
    return result.value || ''
  }

  return buffer.toString('utf8')
}

function assertReferenceFileSignature(buffer: Buffer, mimeType: string) {
  if (!buffer.length) throw new Error('Reference file is empty')

  if (mimeType === 'application/pdf') {
    if (!startsWithBytes(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
      throw new Error('Reference file does not match the expected PDF format')
    }
    return
  }

  if (mimeType === DOCX_MIME_TYPE) {
    if (!hasZipHeader(buffer) ||
      !buffer.includes(Buffer.from('[Content_Types].xml')) ||
      !buffer.includes(Buffer.from('word/'))) {
      throw new Error('Reference file does not match the expected DOCX format')
    }
    return
  }

  if (TEXT_REFERENCE_MIME_TYPES.has(mimeType)) {
    assertTextReferenceBuffer(buffer)
    return
  }

  throw new Error('Unsupported reference file type')
}

function startsWithBytes(buffer: Buffer, bytes: number[]) {
  if (buffer.length < bytes.length) return false
  return bytes.every((byte, index) => buffer[index] === byte)
}

function hasZipHeader(buffer: Buffer) {
  return startsWithBytes(buffer, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWithBytes(buffer, [0x50, 0x4b, 0x05, 0x06]) ||
    startsWithBytes(buffer, [0x50, 0x4b, 0x07, 0x08])
}

function assertTextReferenceBuffer(buffer: Buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 64 * 1024))
  if (sample.includes(0)) throw new Error('Reference file does not look like readable text')

  try {
    textDecoder.decode(sample)
  } catch {
    throw new Error('Reference file is not valid UTF-8 text')
  }

  let suspiciousControlBytes = 0
  for (const byte of sample) {
    const isAllowedControl = byte === 0x09 || byte === 0x0a || byte === 0x0c || byte === 0x0d
    if (byte < 0x20 && !isAllowedControl) suspiciousControlBytes++
  }

  if (suspiciousControlBytes > Math.max(8, sample.length * 0.02)) {
    throw new Error('Reference file does not look like readable text')
  }
}

async function resolveSafeReferenceUrl(rawUrl: string) {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('Reference URL is invalid')
  }

  if (url.protocol !== 'https:') throw new Error('Reference URL must use HTTPS')
  if (url.username || url.password) throw new Error('Reference URL cannot include credentials')
  if (!url.hostname || isBlockedHostname(url.hostname)) throw new Error('Reference URL host is not allowed')

  const addresses = await lookup(url.hostname, { all: true, verbatim: true })
  if (!addresses.length) throw new Error('Reference URL host could not be resolved')
  if (addresses.some((address) => isBlockedAddress(address.address))) {
    throw new Error('Reference URL cannot resolve to a private or reserved address')
  }

  return { url, addresses }
}

function createPinnedDispatcher(hostname: string, addresses: LookupAddress[]) {
  const normalizedHostname = normalizeHostname(hostname)

  return new Agent({
    connect: {
      lookup(requestedHostname, options, callback) {
        if (normalizeHostname(requestedHostname) !== normalizedHostname) {
          callback(new Error('Reference URL host changed during fetch'), '', 0)
          return
        }

        if (options?.all) {
          callback(null, addresses)
          return
        }

        const selected = addresses[0]
        callback(null, selected.address, selected.family)
      },
    },
  })
}

function isAllowedLinkContentType(contentType: string) {
  return contentType.startsWith('text/') ||
    contentType === 'application/json' ||
    contentType === 'application/xml' ||
    contentType === 'application/rss+xml' ||
    contentType === 'application/atom+xml'
}

async function readLimitedResponseText(response: Response, maxBytes: number) {
  const reader = response.body?.getReader()
  if (!reader) return response.text()

  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    total += value.byteLength
    if (total > maxBytes) throw new Error('Reference URL response is too large')
    chunks.push(value)
  }

  return Buffer.concat(chunks).toString('utf8')
}

function extractTextFromHtml(html: string) {
  return normalizeWhitespace(html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'"))
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function limitExtractedText(value: string) {
  const normalized = normalizeWhitespace(value)
  return normalized.length > MAX_EXTRACTED_REFERENCE_CHARS
    ? `${normalized.slice(0, MAX_EXTRACTED_REFERENCE_CHARS)}\n[Reference truncated]`
    : normalized
}

function normalizeReferenceMimeType(mimeType: string, fileName: string) {
  const normalized = mimeType.trim().toLowerCase()
  if (ALLOWED_REFERENCE_MIME_TYPES.has(normalized)) return normalized

  const extension = fileName.toLowerCase().split('.').pop()
  if (extension === 'pdf') return 'application/pdf'
  if (extension === 'txt') return 'text/plain'
  if (extension === 'md' || extension === 'markdown') return 'text/markdown'
  if (extension === 'csv') return 'text/csv'
  if (extension === 'docx') return DOCX_MIME_TYPE
  return normalized
}

function isBlockedHostname(hostname: string) {
  const normalized = normalizeHostname(hostname)
  return normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized.endsWith('.internal')
}

function normalizeHostname(hostname: string) {
  return hostname.toLowerCase().replace(/\.$/, '')
}

function isBlockedAddress(address: string) {
  const version = isIP(address)
  if (version === 4) return isBlockedIPv4(address)
  if (version === 6) return isBlockedIPv6(address)
  return true
}

function isBlockedIPv4(address: string) {
  const parts = address.split('.').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a, b] = parts

  return a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && parts[2] === 0) ||
    (a === 192 && b === 0 && parts[2] === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && parts[2] === 100) ||
    (a === 203 && b === 0 && parts[2] === 113)
}

function isBlockedIPv6(address: string) {
  const normalized = address.toLowerCase()
  if (normalized.startsWith('::ffff:')) {
    const mappedAddress = normalized.slice('::ffff:'.length)
    if (isIP(mappedAddress) === 4) return isBlockedIPv4(mappedAddress)
    return true
  }

  return normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb') ||
    normalized.startsWith('ff')
}
