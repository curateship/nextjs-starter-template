// Resolves stored public media references for the browser: r2:// URLs are only
// served by the media proxy when the key belongs to a media table row.
export function resolveMediaUrl(url?: string | null) {
  const trimmedUrl = url?.trim() || ""
  if (!trimmedUrl) return ""

  if (trimmedUrl.startsWith("r2://")) {
    return `/api/media/proxy?url=${encodeURIComponent(trimmedUrl)}`
  }

  return trimmedUrl
}
