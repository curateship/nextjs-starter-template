import { lookup } from "node:dns/promises"
import type { Agent } from "node:http"
import { request as httpsRequest } from "node:https"
import { isIP } from "node:net"

import { HttpsProxyAgent } from "https-proxy-agent"
import { SocksProxyAgent } from "socks-proxy-agent"

import type { ProxyProtocol, ProxyTestResult } from "@/lib/social/options"

/**
 * Proving a proxy works before the browser is asked to live behind it.
 *
 * Two apps already had a version of this and each had something the other
 * lacked. Anti-detect probes ipinfo.io, which hands back an IANA timezone;
 * that timezone is what keeps the browser's clock agreeing with its exit IP,
 * and a US exit on a Moscow clock is an instant tell. Core has the check that
 * the host is not something inside the network. This has both.
 */

/**
 * ipinfo echoes the exit IP's country, city, network AND an IANA timezone. The
 * timezone is the reason for choosing it over any other echo service.
 */
const PROBE_URL = "https://ipinfo.io/json"

/** A proxy slower than this is not usable for browsing anyway. */
const TIMEOUT_MS = 12_000

export type ProxyTestInput = {
  protocol: ProxyProtocol
  host: string
  port: number
  username?: string | null
  /** Already decrypted by the caller. Never logged. */
  password?: string | null
}

/**
 * Refuses a proxy address that points back inside the network.
 *
 * Without this, a proxy row is a way to make the server fetch its own
 * neighbours: a host resolving to 169.254.169.254 reaches a cloud metadata
 * service, and 127.0.0.1 reaches whatever else is on this machine. The check
 * resolves the name first, because a public-looking name can answer with a
 * private address.
 */
export async function assertPublicProxyHost(host: string): Promise<void> {
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true })

  if (!addresses.length || addresses.some(({ address }) => isBlockedIp(address))) {
    throw new Error("A proxy host has to resolve to a public address.")
  }
}

function isBlockedIp(address: string) {
  const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isBlockedIpv4(mapped[1])
  return isIP(address) === 4 ? isBlockedIpv4(address) : isBlockedIpv6(address)
}

function isBlockedIpv4(address: string) {
  const parts = address.split(".").map((part) => Number.parseInt(part, 10))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true

  const [a, b] = parts
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19)) ||
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

/**
 * The agent for this kind of proxy. Credentials are URL-encoded so a password
 * with an @ or a colon in it survives being put in an address.
 */
function buildAgent(input: ProxyTestInput): Agent {
  const auth = input.username
    ? `${encodeURIComponent(input.username)}:${encodeURIComponent(input.password ?? "")}@`
    : ""
  const url = `${input.protocol}://${auth}${input.host}:${input.port}`
  return input.protocol === "socks5"
    ? (new SocksProxyAgent(url) as unknown as Agent)
    : (new HttpsProxyAgent(url) as unknown as Agent)
}

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
      res.on("end", () => {
        clearTimeout(deadline)
        resolve({ status: res.statusCode ?? 0, body: data })
      })
    })
    // One deadline for the whole test, connecting included, and it settles
    // the answer itself. Node's own `timeout` only counts silence on a socket
    // that already exists, and a request still connecting through the proxy
    // agent does not report being destroyed, so a proxy that drops the
    // connection attempt kept a test, and the ticker pass waiting on it,
    // hanging past a minute. Measured on 5 Oct 2026 against 8.8.4.4:8080,
    // which answers nothing.
    const deadline = setTimeout(() => {
      const error = new Error("The proxy did not answer in time.")
      reject(error)
      req.destroy(error)
    }, timeoutMs)
    req.on("timeout", () => req.destroy(new Error("The proxy did not answer in time.")))
    req.on("error", (error) => {
      clearTimeout(deadline)
      reject(error)
    })
    req.end()
  })
}

/** ipinfo's `org` reads "AS15169 Google LLC"; the ASN prefix is noise here. */
function cleanIsp(org: unknown): string | undefined {
  if (typeof org !== "string" || !org) return undefined
  return org.replace(/^AS\d+\s*/, "").trim() || undefined
}

/**
 * Routes one probe through the proxy and reports what the far end saw.
 *
 * Never throws. A proxy that is down is an answer, not an error, and the
 * screen shows it next to the row: a failed test that threw would take the
 * whole save with it.
 */
export async function testProxyConnection(
  input: ProxyTestInput
): Promise<ProxyTestResult> {
  const startedAt = Date.now()
  try {
    await assertPublicProxyHost(input.host)
    const { status, body } = await getThroughAgent(
      PROBE_URL,
      buildAgent(input),
      TIMEOUT_MS
    )
    const latencyMs = Date.now() - startedAt

    if (status < 200 || status >= 300) {
      return { ok: false, error: `The probe came back as HTTP ${status}.`, latencyMs }
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
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "The proxy test failed.",
      latencyMs: Date.now() - startedAt,
    }
  }
}
