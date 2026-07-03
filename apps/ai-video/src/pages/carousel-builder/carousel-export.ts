import type {
  CarouselFormat,
  CarouselGradientShadowItem,
  CarouselMediaFit,
  CarouselMediaItem,
  CarouselSlide,
  CarouselTextItem,
} from "@/lib/api/carousels"
import { getTextFont } from "@/lib/text-fonts"

const CANVAS_SIZES: Record<CarouselFormat, { width: number; height: number }> =
  {
    "4:5": { width: 1080, height: 1350 },
    "1:1": { width: 1080, height: 1080 },
    "9:16": { width: 1080, height: 1920 },
  }

const ZIP_EPOCH = new Date("1980-01-01T00:00:00Z")
const VIDEO_FPS = 30
const DEFAULT_VIDEO_SLIDE_DURATION_SECONDS = 3
const MIN_VIDEO_SLIDE_DURATION_SECONDS = 1
const MAX_VIDEO_SLIDE_DURATION_SECONDS = 10
const MP4_MIME_TYPES = [
  'video/mp4;codecs="avc1.42E01E"',
  "video/mp4;codecs=avc1.42E01E",
  'video/mp4;codecs="h264"',
  "video/mp4;codecs=h264",
  "video/mp4",
]

type ExportFile = {
  name: string
  data: Uint8Array
}

export type ObjectFitDrawRect = {
  sx: number
  sy: number
  sw: number
  sh: number
  dx: number
  dy: number
  dw: number
  dh: number
}

export type CarouselVideoExportProgress = {
  completedSlides: number
  totalSlides: number
}

export async function exportCarouselZip({
  name,
  slides,
  caption,
  format,
}: {
  name: string
  slides: CarouselSlide[]
  caption: string
  format: CarouselFormat
}) {
  const files: ExportFile[] = []

  for (let index = 0; index < slides.length; index += 1) {
    const png = await renderSlidePng(slides[index], format)
    files.push({
      name: `slides/slide-${String(index + 1).padStart(2, "0")}.png`,
      data: new Uint8Array(await png.arrayBuffer()),
    })
  }

  files.push({
    name: "caption.txt",
    data: new TextEncoder().encode(caption.trim() ? `${caption.trim()}\n` : ""),
  })

  const zip = createStoredZip(files)
  downloadBlob(zip, `${safeFilename(name || "carousel")}.zip`)
}

export async function exportCarouselMp4({
  name,
  slides,
  format,
  secondsPerSlide = DEFAULT_VIDEO_SLIDE_DURATION_SECONDS,
  onProgress,
}: {
  name: string
  slides: CarouselSlide[]
  format: CarouselFormat
  secondsPerSlide?: number
  onProgress?: (progress: CarouselVideoExportProgress) => void
}) {
  const mimeType = getSupportedCarouselMp4MimeType()
  if (!mimeType) {
    throw new Error("MP4 export is not supported in this browser.")
  }
  if (!slides.length) {
    throw new Error("Carousel needs at least one slide.")
  }

  const frames: HTMLCanvasElement[] = []
  for (const slide of slides) {
    frames.push(await renderSlideCanvas(slide, format))
  }

  const video = await recordSlideCanvases({
    frames,
    mimeType,
    secondsPerSlide: normalizeVideoSlideDuration(secondsPerSlide),
    onProgress,
  })
  downloadBlob(video, `${safeFilename(name || "carousel")}.mp4`)
}

export function canExportCarouselMp4() {
  return getSupportedCarouselMp4MimeType() !== null
}

async function renderSlidePng(slide: CarouselSlide, format: CarouselFormat) {
  return canvasToBlob(await renderSlideCanvas(slide, format))
}

async function renderSlideCanvas(slide: CarouselSlide, format: CarouselFormat) {
  const size = CANVAS_SIZES[format]
  const canvas = document.createElement("canvas")
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext("2d")
  if (!context) {
    throw new Error("Export is not available in this browser.")
  }

  context.fillStyle = slide.backgroundColor
  context.fillRect(0, 0, size.width, size.height)

  const items = [...slide.items].sort((a, b) => a.zIndex - b.zIndex)
  for (const item of items) {
    if (item.type === "text") {
      await drawTextItem(context, item, size.width, size.height)
    } else if (item.type === "image") {
      await drawImageItem(context, item, size.width, size.height)
    } else if (item.type === "gradient-shadow") {
      drawGradientShadowItem(context, item, size.width, size.height)
    }
  }

  return canvas
}

async function drawTextItem(
  context: CanvasRenderingContext2D,
  item: CarouselTextItem,
  width: number,
  height: number
) {
  const box = itemBox(item, width, height)
  const font = getTextFont(item.fontId)
  context.save()
  context.fillStyle = item.color
  context.font = `${font.weight} ${item.fontSize}px ${canvasFontFamily(
    font.family
  )}, Arial, sans-serif`
  await document.fonts.load(context.font)
  context.textAlign = item.align
  context.textBaseline = "top"

  const lines = wrapText(context, item.text, box.width)
  const lineHeight = item.fontSize * 1.16
  const x =
    item.align === "center"
      ? box.x + box.width / 2
      : item.align === "right"
        ? box.x + box.width
        : box.x

  lines.forEach((line, lineIndex) => {
    const y = box.y + lineIndex * lineHeight
    if (y <= box.y + box.height - lineHeight * 0.25) {
      context.fillText(line, x, y)
    }
  })
  context.restore()
}

function canvasFontFamily(family: string) {
  return `"${family.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
}

async function drawImageItem(
  context: CanvasRenderingContext2D,
  item: CarouselMediaItem,
  width: number,
  height: number
) {
  const loaded = await loadExportImage(item)
  try {
    const box = itemBox(item, width, height)
    const rect = getObjectFitDrawRect(
      loaded.image.naturalWidth,
      loaded.image.naturalHeight,
      box.width,
      box.height,
      item.fit
    )
    context.drawImage(
      loaded.image,
      rect.sx,
      rect.sy,
      rect.sw,
      rect.sh,
      box.x + rect.dx,
      box.y + rect.dy,
      rect.dw,
      rect.dh
    )
  } finally {
    loaded.cleanup()
  }
}

function drawGradientShadowItem(
  context: CanvasRenderingContext2D,
  item: CarouselGradientShadowItem,
  width: number,
  height: number
) {
  const box = itemBox(item, width, height)
  const alpha = item.opacity / 100
  const gradient = context.createLinearGradient(0, box.y + box.height, 0, box.y)
  gradient.addColorStop(0, hexToRgba(item.color, alpha))
  gradient.addColorStop(1, hexToRgba(item.color, 0))

  context.save()
  context.fillStyle = gradient
  context.fillRect(box.x, box.y, box.width, box.height)
  context.restore()
}

function itemBox(
  item: { x: number; y: number; width: number; height: number },
  width: number,
  height: number
) {
  return {
    x: item.x * width,
    y: item.y * height,
    width: item.width * width,
    height: item.height * height,
  }
}

function hexToRgba(hex: string, alpha: number) {
  const color = hex.replace("#", "")
  const red = Number.parseInt(color.slice(0, 2), 16)
  const green = Number.parseInt(color.slice(2, 4), 16)
  const blue = Number.parseInt(color.slice(4, 6), 16)

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
) {
  const lines: string[] = []
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (!words.length) {
      lines.push("")
      continue
    }

    let line = words[0]
    for (const word of words.slice(1)) {
      const next = `${line} ${word}`
      if (context.measureText(next).width <= maxWidth) {
        line = next
      } else {
        lines.push(line)
        line = word
      }
    }
    lines.push(line)
  }
  return lines
}

export function getObjectFitDrawRect(
  imageWidth: number,
  imageHeight: number,
  boxWidth: number,
  boxHeight: number,
  fit: CarouselMediaFit
): ObjectFitDrawRect {
  const imageRatio = imageWidth / imageHeight
  const boxRatio = boxWidth / boxHeight
  const fillDestination = {
    dx: 0,
    dy: 0,
    dw: boxWidth,
    dh: boxHeight,
  }

  if (fit === "contain") {
    const scale = Math.min(boxWidth / imageWidth, boxHeight / imageHeight)
    const dw = imageWidth * scale
    const dh = imageHeight * scale

    return {
      sx: 0,
      sy: 0,
      sw: imageWidth,
      sh: imageHeight,
      dx: (boxWidth - dw) / 2,
      dy: (boxHeight - dh) / 2,
      dw,
      dh,
    }
  }

  if (imageRatio > boxRatio) {
    const sw = imageHeight * boxRatio
    return {
      sx: (imageWidth - sw) / 2,
      sy: 0,
      sw,
      sh: imageHeight,
      ...fillDestination,
    }
  }

  const sh = imageWidth / boxRatio
  return {
    sx: 0,
    sy: (imageHeight - sh) / 2,
    sw: imageWidth,
    sh,
    ...fillDestination,
  }
}

async function loadExportImage(item: CarouselMediaItem) {
  if (item.mediaId) {
    try {
      return await loadMediaRouteImage(item.mediaId)
    } catch {
      // Fall back to the stored URL for older carousel data or temporary media
      // records whose authenticated file route is unavailable.
    }
  }

  return {
    image: await loadImage(item.url, {
      crossOrigin: needsAnonymousCors(item.url),
    }),
    cleanup: () => undefined,
  }
}

async function loadMediaRouteImage(mediaId: string) {
  const response = await fetch(
    `/api/v1/media/${encodeURIComponent(mediaId)}/file`
  )
  if (!response.ok) {
    throw new Error("Image export failed.")
  }

  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)

  try {
    return {
      image: await loadImage(objectUrl, { crossOrigin: false }),
      cleanup: () => URL.revokeObjectURL(objectUrl),
    }
  } catch (error) {
    URL.revokeObjectURL(objectUrl)
    throw error
  }
}

function loadImage(url: string, options: { crossOrigin: boolean }) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    if (options.crossOrigin) {
      image.crossOrigin = "anonymous"
    }
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("Image export failed."))
    image.src = url
  })
}

function needsAnonymousCors(url: string) {
  try {
    return new URL(url, window.location.href).origin !== window.location.origin
  } catch {
    return false
  }
}

async function recordSlideCanvases({
  frames,
  mimeType,
  secondsPerSlide,
  onProgress,
}: {
  frames: HTMLCanvasElement[]
  mimeType: string
  secondsPerSlide: number
  onProgress?: (progress: CarouselVideoExportProgress) => void
}) {
  const [firstFrame] = frames
  const canvas = document.createElement("canvas")
  canvas.width = firstFrame.width
  canvas.height = firstFrame.height

  const context = canvas.getContext("2d")
  if (!context) {
    throw new Error("MP4 export is not available in this browser.")
  }

  if (!canvas.captureStream) {
    throw new Error("MP4 export is not supported in this browser.")
  }

  const stream = canvas.captureStream(VIDEO_FPS)
  let recorder: MediaRecorder
  try {
    recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: videoBitrate(canvas.width, canvas.height),
    })
  } catch {
    stream.getTracks().forEach((track) => track.stop())
    throw new Error("MP4 export is not supported in this browser.")
  }

  const chunks: Blob[] = []
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    recorder.onerror = () => reject(new Error("MP4 export failed."))
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType })
      if (blob.size > 0) {
        resolve(blob)
      } else {
        reject(new Error("MP4 export failed."))
      }
    }
  })

  const requestFrame = createCanvasFrameRequester(stream)
  context.drawImage(firstFrame, 0, 0)
  requestFrame()

  try {
    recorder.start()
    await playSlidesIntoRecorder({
      context,
      frames,
      secondsPerSlide,
      requestFrame,
      onProgress,
    })
    recorder.stop()
    return await done
  } finally {
    if (recorder.state !== "inactive") {
      recorder.stop()
    }
    stream.getTracks().forEach((track) => track.stop())
  }
}

async function playSlidesIntoRecorder({
  context,
  frames,
  secondsPerSlide,
  requestFrame,
  onProgress,
}: {
  context: CanvasRenderingContext2D
  frames: HTMLCanvasElement[]
  secondsPerSlide: number
  requestFrame: () => void
  onProgress?: (progress: CarouselVideoExportProgress) => void
}) {
  const totalSlides = frames.length
  const durationMs = secondsPerSlide * 1000

  for (let index = 0; index < frames.length; index += 1) {
    onProgress?.({ completedSlides: index, totalSlides })
    await drawRecordedFrame(context, frames[index], durationMs, requestFrame)
    onProgress?.({ completedSlides: index + 1, totalSlides })
  }
}

function drawRecordedFrame(
  context: CanvasRenderingContext2D,
  frame: HTMLCanvasElement,
  durationMs: number,
  requestFrame: () => void
) {
  return new Promise<void>((resolve) => {
    const startedAt = performance.now()
    const draw = (timestamp: number) => {
      context.drawImage(frame, 0, 0)
      requestFrame()
      if (timestamp - startedAt >= durationMs) {
        resolve()
        return
      }
      requestAnimationFrame(draw)
    }
    requestAnimationFrame(draw)
  })
}

function createCanvasFrameRequester(stream: MediaStream) {
  const [track] = stream.getVideoTracks()
  const captureTrack = track as MediaStreamTrack & { requestFrame?: () => void }
  return () => captureTrack.requestFrame?.()
}

function getSupportedCarouselMp4MimeType() {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof MediaRecorder.isTypeSupported !== "function"
  ) {
    return null
  }

  return (
    MP4_MIME_TYPES.find((mimeType) =>
      MediaRecorder.isTypeSupported(mimeType)
    ) ?? null
  )
}

function normalizeVideoSlideDuration(seconds: number) {
  if (!Number.isFinite(seconds)) {
    return DEFAULT_VIDEO_SLIDE_DURATION_SECONDS
  }

  return Math.min(
    MAX_VIDEO_SLIDE_DURATION_SECONDS,
    Math.max(MIN_VIDEO_SLIDE_DURATION_SECONDS, seconds)
  )
}

function videoBitrate(width: number, height: number) {
  return Math.min(
    14_000_000,
    Math.max(4_000_000, Math.round(width * height * VIDEO_FPS * 0.08))
  )
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error("Slide export failed."))
      }, "image/png")
    } catch {
      reject(new Error("Slide export failed."))
    }
  })
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function safeFilename(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "carousel"
  )
}

function createStoredZip(files: ExportFile[]) {
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0

  for (const file of files) {
    const name = new TextEncoder().encode(file.name)
    const crc = crc32(file.data)
    const local = localFileHeader(name, file.data, crc)
    localParts.push(local, file.data)
    centralParts.push(centralDirectoryHeader(name, file.data, crc, offset))
    offset += local.byteLength + file.data.byteLength
  }

  const centralSize = centralParts.reduce(
    (sum, part) => sum + part.byteLength,
    0
  )
  const end = endOfCentralDirectory(files.length, centralSize, offset)
  return new Blob([...localParts, ...centralParts, end], {
    type: "application/zip",
  })
}

function localFileHeader(name: Uint8Array, data: Uint8Array, crc: number) {
  const header = new Uint8Array(30 + name.byteLength)
  const view = new DataView(header.buffer)
  view.setUint32(0, 0x04034b50, true)
  view.setUint16(4, 20, true)
  view.setUint16(6, 0, true)
  view.setUint16(8, 0, true)
  setDosDateTime(view, 10)
  view.setUint32(14, crc, true)
  view.setUint32(18, data.byteLength, true)
  view.setUint32(22, data.byteLength, true)
  view.setUint16(26, name.byteLength, true)
  header.set(name, 30)
  return header
}

function centralDirectoryHeader(
  name: Uint8Array,
  data: Uint8Array,
  crc: number,
  offset: number
) {
  const header = new Uint8Array(46 + name.byteLength)
  const view = new DataView(header.buffer)
  view.setUint32(0, 0x02014b50, true)
  view.setUint16(4, 20, true)
  view.setUint16(6, 20, true)
  view.setUint16(8, 0, true)
  view.setUint16(10, 0, true)
  setDosDateTime(view, 12)
  view.setUint32(16, crc, true)
  view.setUint32(20, data.byteLength, true)
  view.setUint32(24, data.byteLength, true)
  view.setUint16(28, name.byteLength, true)
  view.setUint32(42, offset, true)
  header.set(name, 46)
  return header
}

function endOfCentralDirectory(
  fileCount: number,
  centralSize: number,
  centralOffset: number
) {
  const header = new Uint8Array(22)
  const view = new DataView(header.buffer)
  view.setUint32(0, 0x06054b50, true)
  view.setUint16(8, fileCount, true)
  view.setUint16(10, fileCount, true)
  view.setUint32(12, centralSize, true)
  view.setUint32(16, centralOffset, true)
  return header
}

function setDosDateTime(view: DataView, offset: number) {
  const date = ZIP_EPOCH
  const dosTime =
    (date.getUTCHours() << 11) |
    (date.getUTCMinutes() << 5) |
    Math.floor(date.getUTCSeconds() / 2)
  const dosDate =
    ((date.getUTCFullYear() - 1980) << 9) |
    ((date.getUTCMonth() + 1) << 5) |
    date.getUTCDate()
  view.setUint16(offset, dosTime, true)
  view.setUint16(offset + 2, dosDate, true)
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of data) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}
