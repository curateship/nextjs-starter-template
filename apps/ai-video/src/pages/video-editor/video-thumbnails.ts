// Extracts a single representative frame from a video and caches it per
// media id; timeline clips tile the frame as a filmstrip preview. Sources go
// through the same-origin media proxy route because the public R2 bucket
// sends no CORS headers, which would taint the extraction canvas.

// 2x the rendered clip height so the tiled frames stay crisp on retina.
const THUMB_HEIGHT_PX = 72

// mediaId -> in-flight/resolved data-URL. Shared across chips so split clip
// halves and re-mounts never re-extract.
const thumbnailCache = new Map<string, Promise<string>>()

export function getVideoThumbnail(mediaId: string): Promise<string> {
  let pending = thumbnailCache.get(mediaId)
  if (!pending) {
    const src = `/api/v1/media/${mediaId}/file`
    pending = extractFrame(src)
      // One delayed retry — covers transient dev-server/network hiccups.
      .catch(() => sleep(800).then(() => extractFrame(src)))
      .catch((error) => {
        thumbnailCache.delete(mediaId) // allow a retry on the next mount
        throw error
      })
    thumbnailCache.set(mediaId, pending)
  }
  return pending
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

// Fetch the file once through the authenticated proxy and extract from a
// blob URL: a single plain request (media elements fire multi-range request
// sequences that the dev proxy handles unreliably) and a same-origin source,
// so the canvas never taints.
async function extractFrame(src: string): Promise<string> {
  const response = await fetch(src)
  if (!response.ok) {
    throw new Error(`Thumbnail fetch failed (${response.status})`)
  }
  const blobUrl = URL.createObjectURL(await response.blob())
  try {
    return await drawFrameFromVideo(blobUrl)
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
}

// Load the video far enough to seek, draw one frame to a canvas, and return
// it as a compact JPEG data-URL.
function drawFrameFromVideo(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video")
    video.muted = true
    video.playsInline = true
    video.preload = "auto"

    function cleanup() {
      video.removeAttribute("src")
      video.load()
    }

    video.onerror = () => {
      cleanup()
      reject(new Error("Could not load video for thumbnail"))
    }

    // Seek a little way in — the very first frames are often black.
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 1
      video.currentTime = Math.min(0.5, duration * 0.25)
    }

    video.onseeked = () => {
      try {
        const ratio =
          video.videoWidth && video.videoHeight
            ? video.videoWidth / video.videoHeight
            : 16 / 9
        const canvas = document.createElement("canvas")
        canvas.height = THUMB_HEIGHT_PX
        canvas.width = Math.max(1, Math.round(THUMB_HEIGHT_PX * ratio))
        const context = canvas.getContext("2d")
        if (!context) throw new Error("Canvas 2d context unavailable")
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        const dataUrl = canvas.toDataURL("image/jpeg", 0.6)
        cleanup()
        resolve(dataUrl)
      } catch (error) {
        cleanup()
        reject(error instanceof Error ? error : new Error("Thumbnail failed"))
      }
    }

    video.src = src
  })
}
