const DEFAULT_HUB_PLATFORM_HOST = "hub.systemeverything.com"
const RESERVED_PLATFORM_SUBDOMAINS = new Set(["www", "api", "admin", "app", "hub"])

function normalizeHost(value?: string | null) {
  if (!value) return ""

  return value
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]
}

function normalizeHostname(value?: string | null) {
  return normalizeHost(value).replace(/^www\./, "").replace(/:\d+$/, "")
}

function getHubPlatformHost() {
  return normalizeHost(process.env.HUB_PLATFORM_HOST) || DEFAULT_HUB_PLATFORM_HOST
}

function getHubPlatformHostname() {
  return normalizeHostname(getHubPlatformHost())
}

function isLocalDevelopmentHost(host?: string | null) {
  if (process.env.NODE_ENV === "production") return false

  const hostname = normalizeHostname(host).replace(/^\[|\]$/g, "")
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
}

export function getHubPlatformOrigin(protocol = "https") {
  const rawHost = process.env.HUB_PLATFORM_HOST?.trim()
  if (rawHost?.startsWith("http://") || rawHost?.startsWith("https://")) {
    return new URL(rawHost).origin
  }

  const host = getHubPlatformHost()
  const isLocal = host.includes("localhost") || host.startsWith("127.")
  return `${isLocal ? "http" : protocol}://${host}`
}

export function isHubPlatformHost(host?: string | null) {
  return isLocalDevelopmentHost(host)
    || normalizeHost(host) === getHubPlatformHost()
    || normalizeHostname(host) === getHubPlatformHostname()
}

export function isHubPlatformHostname(host?: string | null) {
  return normalizeHostname(host) === getHubPlatformHostname()
}

export function isReservedPlatformSubdomain(subdomain?: string | null) {
  return RESERVED_PLATFORM_SUBDOMAINS.has((subdomain || "").trim().toLowerCase())
}
