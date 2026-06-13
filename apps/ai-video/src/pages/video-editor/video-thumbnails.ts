// Extracts frames from a video and caches them per media id; timeline clips
// lay the frames out side-by-side as a filmstrip preview. Sources go through
// the same-origin media proxy route because the public R2 bucket sends no CORS
// headers, which would taint the extraction canvas.

// Captured frame height. Kept well above the on-screen clip height (~52px,
// double that on retina) so frames stay crisp when the filmstrip downscales
// them — capturing small and upscaling is what made the strip blurry.
const FRAME_HEIGHT_PX = 160

// One sample every ~2 seconds of source, so longer clips get more frames and
// the strip density is constant in time rather than stretched to a fixed count.
const SECONDS_PER_FRAME = 2

// Upper bound on frames per clip so a long source can't trigger dozens of
// sequential seeks.
const MAX_FRAMES = 30

// The slice of source video a clip shows on the timeline. Template slots and
// split clips share one mediaId but display different windows, so the window
// is part of the cache key.
export type ClipWindow = { startMs: number; durationMs: number }

// `${mediaId}:${startMs}:${durationMs}` -> in-flight/resolved filmstrip frames.
const filmstripCache = new Map<string, Promise<string[]>>()

// Returns one frame per ~2 seconds across a clip's visible trim window, so a
// short template slot samples only its own scene rather than the whole reel.
export function getVideoFilmstrip(
  mediaId: string,
  window: ClipWindow
): Promise<string[]> {
  const key = `${mediaId}:${window.startMs}:${window.durationMs}`
  let pending = filmstripCache.get(key)
  if (!pending) {
    pending = withRetry(() => extractFrames(mediaUrl(mediaId), window))
    filmstripCache.set(key, pending)
    pending.catch(() => filmstripCache.delete(key)) // allow a retry next mount
  }
  return pending
}

function mediaUrl(mediaId: string) {
  return `/api/v1/media/${mediaId}/file`
}

// One delayed retry — covers transient dev-server/network hiccups.
function withRetry<T>(run: () => Promise<T>): Promise<T> {
  return run().catch(() => sleep(800).then(run))
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

// Fetch the file once through the authenticated proxy and extract from a
// blob URL: a single plain request (media elements fire multi-range request
// sequences that the dev proxy handles unreliably) and a same-origin source,
// so the canvas never taints.
async function extractFrames(
  src: string,
  window: ClipWindow
): Promise<string[]> {
  const response = await fetch(src)
  if (!response.ok) {
    throw new Error(`Thumbnail fetch failed (${response.status})`)
  }
  const blobUrl = URL.createObjectURL(await response.blob())
  try {
    return await drawFramesFromVideo(blobUrl, window)
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
}

// Picks the sample times (in source seconds): one per ~2s across the clip's
// visible slice, centered in each.
function sampleTimes(totalDuration: number, window: ClipWindow) {
  // Clamp the requested window to what the file actually contains.
  const startSec = Math.max(0, window.startMs / 1000)
  const endSec = Math.min(totalDuration, (window.startMs + window.durationMs) / 1000)
  const span = Math.max(0, endSec - startSec)
  const count = Math.min(
    MAX_FRAMES,
    Math.max(1, Math.round(span / SECONDS_PER_FRAME))
  )
  return Array.from({ length: count }, (_, i) =>
    Math.min(
      totalDuration - 0.01,
      Math.max(0.05, startSec + (span * (i + 0.5)) / count)
    )
  )
}

// Load the video once, then seek to each sample point in turn, drawing a
// frame to a canvas at every `seeked` event. Returns compact JPEG data-URLs.
function drawFramesFromVideo(
  src: string,
  window: ClipWindow
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video")
    video.muted = true
    video.playsInline = true
    video.preload = "auto"

    const results: string[] = []
    let times: number[] = []
    let index = 0

    function cleanup() {
      video.removeAttribute("src")
      video.load()
    }

    video.onerror = () => {
      cleanup()
      reject(new Error("Could not load video for thumbnail"))
    }

    video.onloadedmetadata = () => {
      const duration =
        Number.isFinite(video.duration) && video.duration > 0
          ? video.duration
          : 1
      times = sampleTimes(duration, window)
      video.currentTime = times[0]
    }

    video.onseeked = () => {
      try {
        const ratio =
          video.videoWidth && video.videoHeight
            ? video.videoWidth / video.videoHeight
            : 9 / 16
        const canvas = document.createElement("canvas")
        canvas.height = FRAME_HEIGHT_PX
        canvas.width = Math.max(1, Math.round(FRAME_HEIGHT_PX * ratio))
        const context = canvas.getContext("2d")
        if (!context) throw new Error("Canvas 2d context unavailable")
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        results.push(canvas.toDataURL("image/jpeg", 0.72))

        // Advance to the next sample, or finish once every frame is captured.
        index += 1
        if (index >= times.length) {
          cleanup()
          resolve(results)
          return
        }
        video.currentTime = times[index]
      } catch (error) {
        cleanup()
        reject(error instanceof Error ? error : new Error("Thumbnail failed"))
      }
    }

    video.src = src
  })
}
