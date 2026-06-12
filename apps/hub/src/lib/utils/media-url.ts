// Resolves stored media references for the browser: r2:// URLs aren't publicly
// reachable (no CORS on the bucket), so they go through the authenticated proxy.
export function resolveMediaUrl(url?: string | null) {
  const trimmedUrl = url?.trim() || ""
  if (!trimmedUrl) return ""

  if (trimmedUrl.startsWith("r2://")) {
    return `/api/media/proxy?url=${encodeURIComponent(trimmedUrl)}`
  }

  return trimmedUrl
}
