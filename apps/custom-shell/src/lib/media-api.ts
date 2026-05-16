const mediaApiUrl = `${
  import.meta.env.VITE_CUSTOM_SHELL_API_URL ?? ""
}`.replace(/\/$/, "")

export type MediaFileType = "image" | "video"

export type MediaItem = {
  id: string
  filename: string
  original_name: string
  alt_text: string | null
  file_size: number
  mime_type: string
  file_type: MediaFileType
  url: string
  created_at: string
  updated_at: string
}

export type MediaListResponse = {
  media: MediaItem[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export function resolveMediaUrl(url: string) {
  return url.startsWith("/") ? `${mediaApiUrl}${url}` : url
}

export function getMediaFileUrl(mediaId: string) {
  return resolveMediaUrl(`/api/v1/media/${mediaId}/file`)
}

export function getMediaErrorMessage(error: unknown) {
  if (error instanceof TypeError && error.message === "Failed to fetch") {
    const apiTarget = mediaApiUrl || "the same-origin custom-shell API"
    return `Could not reach ${apiTarget}. Run npm run dev:custom-shell.`
  }

  return error instanceof Error ? error.message : "Media request failed."
}

async function readMediaResponse<T>(response: Response) {
  if (!response.ok) {
    let detail = `Media request failed (${response.status}).`
    try {
      const data = (await response.json()) as { detail?: unknown }
      if (typeof data.detail === "string") {
        detail = data.detail
      }
    } catch {
      // Keep the status-based message.
    }
    throw new Error(detail)
  }

  return (await response.json()) as T
}

function normalizeMediaItem(item: MediaItem): MediaItem {
  return {
    ...item,
    url: resolveMediaUrl(item.url),
  }
}

export async function listMedia({
  page = 1,
  pageSize = 20,
  fileType,
}: {
  page?: number
  pageSize?: number
  fileType?: MediaFileType
} = {}) {
  const params = new URLSearchParams({
    page: page.toString(),
    page_size: pageSize.toString(),
  })
  if (fileType) {
    params.set("file_type", fileType)
  }

  const response = await fetch(`${mediaApiUrl}/api/v1/media?${params}`, {
    credentials: "include",
  })
  const data = await readMediaResponse<MediaListResponse>(response)

  return {
    ...data,
    media: data.media.map(normalizeMediaItem),
  }
}

export async function uploadMedia(file: File, altText?: string) {
  const formData = new FormData()
  formData.append("file", file)
  if (altText?.trim()) {
    formData.append("alt_text", altText.trim())
  }

  const response = await fetch(`${mediaApiUrl}/api/v1/media`, {
    method: "POST",
    credentials: "include",
    body: formData,
  })
  const item = await readMediaResponse<MediaItem>(response)
  return normalizeMediaItem(item)
}

export async function updateMedia(mediaId: string, altText: string) {
  const response = await fetch(`${mediaApiUrl}/api/v1/media/${mediaId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ alt_text: altText }),
  })
  const item = await readMediaResponse<MediaItem>(response)
  return normalizeMediaItem(item)
}

export async function deleteMedia(mediaId: string) {
  const response = await fetch(`${mediaApiUrl}/api/v1/media/${mediaId}`, {
    method: "DELETE",
    credentials: "include",
  })

  if (!response.ok) {
    await readMediaResponse<never>(response)
  }
}

export async function bulkDeleteMedia(mediaIds: string[]) {
  const response = await fetch(`${mediaApiUrl}/api/v1/media/bulk-delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ ids: mediaIds }),
  })

  return readMediaResponse<{ deleted_count: number }>(response)
}
