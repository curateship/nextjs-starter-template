import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import { lookup } from "node:dns/promises"
import { request } from "node:https"
import { isIP } from "node:net"

import { HttpsProxyAgent } from "https-proxy-agent"

import type { CoreProxy } from "@/server/schema"

const algorithm = "aes-256-gcm"
const ivLength = 12
const authTagLength = 16
const proxyTestUrl = "https://ipapi.co/json/"
const maxImportLines = 500

export const proxyProtocols = ["http", "https"] as const
export const proxyConnectionTypes = [
  "residential",
  "mobile",
  "datacenter",
] as const
export const proxyStatuses = ["untested", "online", "offline"] as const

export type ProxyProtocol = (typeof proxyProtocols)[number]
export type ProxyConnectionType = (typeof proxyConnectionTypes)[number]
export type ProxyStatus = (typeof proxyStatuses)[number]

export type ProxyItem = {
  id: string
  name: string
  protocol: ProxyProtocol
  host: string
  port: number
  username: string
  has_password: boolean
  connection_type: ProxyConnectionType | null
  country: string | null
  enabled: boolean
  last_status: ProxyStatus
  last_checked_at: string | null
  last_response_ms: number | null
  last_error: string | null
  created_at: string
  updated_at: string
}

export type ProxyImportLineError = {
  line: number
  value: string
  error: string
}

export type ParsedProxyImportLine = {
  line: number
  host: string
  port: number
  username: string
  password: string
}

type ProxyHealthResult = {
  status: "online" | "offline"
  responseMs: number
  country: string | null
  error: string | null
}

type ProxyResponse = {
  statusCode: number
  body: string
}

export function serializeProxy(row: CoreProxy): ProxyItem {
  return {
    id: row.id,
    name: row.name,
    protocol: row.protocol as ProxyProtocol,
    host: row.host,
    port: row.port,
    username: row.username,
    has_password: Boolean(row.passwordEncrypted),
    connection_type: row.connectionType as ProxyConnectionType | null,
    country: row.country,
    enabled: row.enabled,
    last_status: row.lastStatus as ProxyStatus,
    last_checked_at: row.lastCheckedAt?.toISOString() ?? null,
    last_response_ms: row.lastResponseMs,
    last_error: row.lastError,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

export function encryptProxyPassword(password: string) {
  const iv = randomBytes(ivLength)
  const cipher = createCipheriv(algorithm, getProxyEncryptionKey(), iv)
  const encrypted = Buffer.concat([
    cipher.update(password, "utf8"),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":")
}

export function decryptProxyPassword(encryptedPassword: string) {
  const [ivBase64, authTagBase64, encryptedBase64] = encryptedPassword.split(":")
  if (!ivBase64 || !authTagBase64 || !encryptedBase64) {
    throw new Error("Invalid encrypted proxy password")
  }

  const iv = Buffer.from(ivBase64, "base64")
  const authTag = Buffer.from(authTagBase64, "base64")
  if (iv.length !== ivLength || authTag.length !== authTagLength) {
    throw new Error("Invalid encrypted proxy password")
  }

  const decipher = createDecipheriv(algorithm, getProxyEncryptionKey(), iv)
  decipher.setAuthTag(authTag)
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, "base64")),
    decipher.final(),
  ])

  return decrypted.toString("utf8")
}

export function parseProxyImportLines(input: string): {
  proxies: ParsedProxyImportLine[]
  errors: ProxyImportLineError[]
} {
  const lines = input
    .split(/\r?\n/)
    .map((line, index) => ({ line: index + 1, value: line.trim() }))
    .filter((line) => line.value.length > 0)

  if (lines.length > maxImportLines) {
    return {
      proxies: [],
      errors: [{
        line: maxImportLines + 1,
        value: "",
        error: `Import supports up to ${maxImportLines} proxies at a time.`,
      }],
    }
  }

  return lines.reduce<{
    proxies: ParsedProxyImportLine[]
    errors: ProxyImportLineError[]
  }>(
    (result, line) => {
      const parsed = parseProxyImportLine(line.value)
      if (!parsed) {
        result.errors.push({
          line: line.line,
          value: line.value,
          error: "Use host:port:user:pass.",
        })
        return result
      }

      result.proxies.push({ line: line.line, ...parsed })
      return result
    },
    { proxies: [], errors: [] }
  )
}

export async function testProxyConnection(row: CoreProxy): Promise<ProxyHealthResult> {
  const startedAt = Date.now()

  try {
    await assertPublicProxyHost(row.host)
    const proxyUrl = getProxyUrl(row)
    const response = await requestThroughProxy(proxyUrl)
    const responseMs = Date.now() - startedAt

    if (response.statusCode < 200 || response.statusCode >= 300) {
      return {
        status: "offline",
        responseMs,
        country: null,
        error: `Health check returned HTTP ${response.statusCode}.`,
      }
    }

    const payload = JSON.parse(response.body) as Record<string, unknown>
    const country = typeof payload.country_name === "string"
      ? payload.country_name.trim()
      : null

    return {
      status: "online",
      responseMs,
      country: country || null,
      error: null,
    }
  } catch (error) {
    return {
      status: "offline",
      responseMs: Date.now() - startedAt,
      country: null,
      error: error instanceof Error ? error.message : "Proxy test failed.",
    }
  }
}

function parseProxyImportLine(value: string) {
  const first = value.indexOf(":")
  const second = first === -1 ? -1 : value.indexOf(":", first + 1)
  const third = second === -1 ? -1 : value.indexOf(":", second + 1)

  if (first === -1 || second === -1 || third === -1) {
    return null
  }

  const host = cleanHost(value.slice(0, first))
  const port = Number.parseInt(value.slice(first + 1, second), 10)
  const username = value.slice(second + 1, third).trim()
  const password = value.slice(third + 1)

  if (!host || !isValidPort(port) || !username || !password) {
    return null
  }

  return { host, port, username, password }
}

export function cleanHost(value: string) {
  const host = value.trim().toLowerCase()
  if (
    !host ||
    host.includes("/") ||
    host.includes("\\") ||
    host.includes(":") ||
    /\s/.test(host) ||
    isBlockedProxyHost(host)
  ) {
    return ""
  }
  return host
}

export function cleanNullableText(value: string | null | undefined, maxLength: number) {
  const trimmed = value?.trim() ?? ""
  return trimmed ? trimmed.slice(0, maxLength) : null
}

export function isValidPort(value: number) {
  return Number.isInteger(value) && value >= 1 && value <= 65535
}

function getProxyUrl(row: CoreProxy) {
  const url = new URL(`${row.protocol}://${row.host}:${row.port}`)
  if (row.username) {
    url.username = row.username
  }
  if (row.passwordEncrypted) {
    url.password = decryptProxyPassword(row.passwordEncrypted)
  }
  return url.toString()
}

function requestThroughProxy(proxyUrl: string) {
  return new Promise<ProxyResponse>((resolve, reject) => {
    const agent = new HttpsProxyAgent(proxyUrl)
    const req = request(
      proxyTestUrl,
      {
        agent,
        headers: {
          accept: "application/json",
          "user-agent": "core-proxy-health/1.0",
        },
        timeout: 12_000,
      },
      (res) => {
        let body = ""

        res.setEncoding("utf8")
        res.on("data", (chunk) => {
          body += chunk
          if (body.length > 100_000) {
            req.destroy(new Error("Proxy test response is too large."))
          }
        })
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            body,
          })
        })
      }
    )

    req.on("timeout", () => {
      req.destroy(new Error("Proxy test timed out."))
    })
    req.on("error", reject)
    req.end()
  })
}

function getProxyEncryptionKey() {
  const secret = process.env.CORE_PROXY_ENCRYPTION_KEY
  if (!secret) {
    throw new Error("CORE_PROXY_ENCRYPTION_KEY is required for proxy passwords.")
  }
  if (secret.length < 32) {
    throw new Error("CORE_PROXY_ENCRYPTION_KEY must be at least 32 characters.")
  }

  return createHash("sha256").update(secret, "utf8").digest()
}

function isBlockedProxyHost(host: string) {
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "0.0.0.0" ||
    host.startsWith("127.") ||
    host.startsWith("10.") ||
    host.startsWith("169.254.") ||
    host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  )
}

async function assertPublicProxyHost(host: string) {
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true })

  if (!addresses.length || addresses.some(({ address }) => isBlockedIp(address))) {
    throw new Error("Proxy host must resolve to a public IP address.")
  }
}

function isBlockedIp(address: string) {
  const ipv4Mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (ipv4Mapped) {
    return isBlockedIpv4(ipv4Mapped[1])
  }

  return isIP(address) === 4 ? isBlockedIpv4(address) : isBlockedIpv6(address)
}

function isBlockedIpv4(address: string) {
  const parts = address.split(".").map((part) => Number.parseInt(part, 10))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return true
  }

  const [a, b] = parts
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a === 169 && b === 254 ||
    a === 172 && b >= 16 && b <= 31 ||
    a === 192 && b === 168 ||
    a === 100 && b >= 64 && b <= 127 ||
    a === 198 && (b === 18 || b === 19) ||
    a >= 224
  )
}

function isBlockedIpv6(address: string) {
  const normalized = address.split("%")[0].toLowerCase()
  const first = Number.parseInt(normalized.split(":")[0] || "0", 16)

  return (
    normalized === "::" ||
    normalized === "::1" ||
    (first >= 0xfc00 && first <= 0xfdff) ||
    (first >= 0xfe80 && first <= 0xfebf)
  )
}
