const ZIP_EPOCH = new Date("1980-01-01T00:00:00Z")

type ExportFile = { name: string; data: Uint8Array }

/** The server rasterizes each saved slide with the same bundled Inter file as
 * video export. The browser only packs those PNGs and the caption together. */
export async function exportCarouselZip({
  carouselId,
  name,
  slideCount,
  caption,
}: {
  carouselId: string
  name: string
  slideCount: number
  caption: string
}) {
  const files: ExportFile[] = []
  for (let index = 0; index < slideCount; index += 1) {
    const response = await fetch(
      `/api/v1/video/carousels/${encodeURIComponent(carouselId)}/slides/${index}`
    )
    if (!response.ok) {
      throw new Error(`Slide ${index + 1} could not be exported.`)
    }
    files.push({
      name: `slides/slide-${String(index + 1).padStart(2, "0")}.png`,
      data: new Uint8Array(await response.arrayBuffer()),
    })
  }
  files.push({
    name: "caption.txt",
    data: new TextEncoder().encode(caption.trim() ? `${caption.trim()}\n` : ""),
  })
  downloadBlob(createStoredZip(files), `${safeFilename(name)}.zip`)
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function safeFilename(value: string) {
  return (
    value
      .trim()
      .replace(/[^a-z0-9]+/gi, "-")
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
  const parts = [
    ...localParts,
    ...centralParts,
    endOfCentralDirectory(files.length, centralSize, offset),
  ]
  const archive = new Uint8Array(
    parts.reduce((size, part) => size + part.byteLength, 0)
  )
  let cursor = 0
  for (const part of parts) {
    archive.set(part, cursor)
    cursor += part.byteLength
  }
  return new Blob([archive.buffer], { type: "application/zip" })
}

function localFileHeader(name: Uint8Array, data: Uint8Array, crc: number) {
  const header = new Uint8Array(30 + name.byteLength)
  const view = new DataView(header.buffer)
  view.setUint32(0, 0x04034b50, true)
  view.setUint16(4, 20, true)
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
  setDosDateTime(view, 12)
  view.setUint32(16, crc, true)
  view.setUint32(20, data.byteLength, true)
  view.setUint32(24, data.byteLength, true)
  view.setUint16(28, name.byteLength, true)
  view.setUint32(42, offset, true)
  header.set(name, 46)
  return header
}

function endOfCentralDirectory(count: number, size: number, offset: number) {
  const bytes = new Uint8Array(22)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x06054b50, true)
  view.setUint16(8, count, true)
  view.setUint16(10, count, true)
  view.setUint32(12, size, true)
  view.setUint32(16, offset, true)
  return bytes
}

function setDosDateTime(view: DataView, offset: number) {
  const year = Math.max(1980, ZIP_EPOCH.getUTCFullYear())
  const date =
    ((year - 1980) << 9) |
    ((ZIP_EPOCH.getUTCMonth() + 1) << 5) |
    ZIP_EPOCH.getUTCDate()
  const time =
    (ZIP_EPOCH.getUTCHours() << 11) |
    (ZIP_EPOCH.getUTCMinutes() << 5) |
    Math.floor(ZIP_EPOCH.getUTCSeconds() / 2)
  view.setUint16(offset, time, true)
  view.setUint16(offset + 2, date, true)
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of data) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}
