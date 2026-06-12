import { request as httpsRequest } from "node:https"
import type { Agent } from "node:http"

import { HttpsProxyAgent } from "https-proxy-agent"
import { SocksProxyAgent } from "socks-proxy-agent"

// Result of routing a probe request through an upstream proxy. Stored as-is in
// proxies.last_test_result (jsonb) and sent to the client — contains no secrets.
export type ProxyTestResult = {
  ok: boolean
  ip?: string
  country?: string
  city?: string
  isp?: string
  timezone?: string
  latencyMs?: number
  error?: string
  testedAt: string
}

export type ProxyProtocol = "http" | "https" | "socks5"

export type ProxyTestInput = {
  protocol: ProxyProtocol
  host: string
  port: number
  username?: string | null
  password?: string | null // already decrypted by the caller
}

// We probe ipinfo.io because it echoes the exit IP's geo AND an IANA timezone —
// the timezone is what the fingerprint generator needs to stay coherent with the
// proxy's location (a US exit on a Moscow clock is an instant tell).
const PROBE_URL = "https://ipinfo.io/json"
const TIMEOUT_MS = 12_000

// GET a URL through the given agent, returning status + body. Rejects on timeout
// or transport error so the caller can record a failed test.
function getThroughAgent(
  url: string,
  agent: Agent,
  timeoutMs: number
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(url, { agent, timeout: timeoutMs }, (res) => {
      let data = ""
      res.setEncoding("utf8")
      res.on("data", (chunk) => {
        data += chunk
      })
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }))
    })
    // 'timeout' only fires the event — we must destroy the socket ourselves.
    req.on("timeout", () => req.destroy(new Error("Proxy test timed out")))
    req.on("error", reject)
    req.end()
  })
}

// Build the proxy URL (credentials url-encoded so special chars survive) and pick
// the matching agent: SOCKS for socks5, HTTP-CONNECT tunnel for http/https.
function buildAgent(input: ProxyTestInput): Agent {
  const auth = input.username
    ? `${encodeURIComponent(input.username)}:${encodeURIComponent(
        input.password ?? ""
      )}@`
    : ""
  const url = `${input.protocol}://${auth}${input.host}:${input.port}`
  return input.protocol === "socks5"
    ? (new SocksProxyAgent(url) as unknown as Agent)
    : (new HttpsProxyAgent(url) as unknown as Agent)
}

// ipinfo's `org` looks like "AS15169 Google LLC" — drop the ASN prefix for ISP.
function cleanIsp(org: unknown): string | undefined {
  if (typeof org !== "string" || !org) return undefined
  return org.replace(/^AS\d+\s*/, "").trim() || undefined
}

// Routes a probe through the proxy and reports what the destination sees. Never
// throws — a failure is a result with ok:false and an error message.
export async function testProxyConnection(
  input: ProxyTestInput
): Promise<ProxyTestResult> {
  const testedAt = new Date().toISOString()
  const startedAt = Date.now()
  try {
    const agent = buildAgent(input)
    const { status, body } = await getThroughAgent(PROBE_URL, agent, TIMEOUT_MS)
    const latencyMs = Date.now() - startedAt
    if (status < 200 || status >= 300) {
      return { ok: false, error: `Probe returned HTTP ${status}`, latencyMs, testedAt }
    }
    const geo = JSON.parse(body) as Record<string, unknown>
    return {
      ok: true,
      ip: typeof geo.ip === "string" ? geo.ip : undefined,
      country: typeof geo.country === "string" ? geo.country : undefined,
      city: typeof geo.city === "string" ? geo.city : undefined,
      isp: cleanIsp(geo.org),
      timezone: typeof geo.timezone === "string" ? geo.timezone : undefined,
      latencyMs,
      testedAt,
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Proxy test failed",
      latencyMs: Date.now() - startedAt,
      testedAt,
    }
  }
}
