import { and, asc, eq, inArray, isNull } from "drizzle-orm"

import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { getFromR2 } from "@/server/media/storage"
import { promoProjects } from "@/server/social/schema"

import { promoArchiveItems, promoArchiveSlides } from "./schema"

/**
 * Download everything as a zip (part 31): every item in one project, as a
 * zip streamed straight from storage while it downloads, so a big project
 * never sits in the server's memory. Files are stored, not squeezed: videos
 * and pictures are squeezed already. A carousel is a folder of its slides.
 *
 * This is a plain zip without the large-file extension, so one project's
 * download is refused past 4GB, with a sentence saying so.
 */

/** The plain zip format's limit, a little under 4GB. */
export const ZIP_MAX_BYTES = 0xffff_fff0

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(crc: number, bytes: Uint8Array): number {
  let c = crc ^ 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export type ZipEntry = { name: string; open: () => Promise<ReadableStream<Uint8Array>> }

/** A name safe on any disk: no slashes but the folder's own, nothing odd. */
export function zipName(raw: string, fallback: string): string {
  const cleaned = raw.replace(/[^\w .()-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80)
  return cleaned || fallback
}

/**
 * A zip of these entries, streamed. Each file's checksum and size follow
 * its bytes (the zip's "data descriptor"), so nothing is read twice.
 */
export function streamZip(entries: ZipEntry[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const central: Uint8Array[] = []
  let offset = 0
  let index = 0

  const header = (size: number) => {
    const bytes = new Uint8Array(size)
    return { bytes, view: new DataView(bytes.buffer) }
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (index >= entries.length) {
        // The table of contents, then its end record.
        const start = offset
        let size = 0
        for (const record of central) {
          controller.enqueue(record)
          size += record.byteLength
        }
        const end = header(22)
        end.view.setUint32(0, 0x06054b50, true)
        end.view.setUint16(8, entries.length, true)
        end.view.setUint16(10, entries.length, true)
        end.view.setUint32(12, size, true)
        end.view.setUint32(16, start, true)
        controller.enqueue(end.bytes)
        controller.close()
        return
      }
      const entry = entries[index]
      index += 1
      const name = encoder.encode(entry.name)
      const local = header(30 + name.byteLength)
      local.view.setUint32(0, 0x04034b50, true)
      local.view.setUint16(4, 20, true)
      // Bit 3: sizes and checksum follow the data. Bit 11: the name is UTF-8.
      local.view.setUint16(6, 0x0808, true)
      local.view.setUint16(26, name.byteLength, true)
      local.bytes.set(name, 30)
      const at = offset
      controller.enqueue(local.bytes)
      offset += local.bytes.byteLength

      let crc = 0
      let size = 0
      const reader = (await entry.open()).getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        crc = crc32(crc, value)
        size += value.byteLength
        controller.enqueue(value)
      }
      offset += size

      const descriptor = header(16)
      descriptor.view.setUint32(0, 0x08074b50, true)
      descriptor.view.setUint32(4, crc, true)
      descriptor.view.setUint32(8, size, true)
      descriptor.view.setUint32(12, size, true)
      controller.enqueue(descriptor.bytes)
      offset += 16

      const record = header(46 + name.byteLength)
      record.view.setUint32(0, 0x02014b50, true)
      record.view.setUint16(4, 20, true)
      record.view.setUint16(6, 20, true)
      record.view.setUint16(8, 0x0808, true)
      record.view.setUint32(16, crc, true)
      record.view.setUint32(20, size, true)
      record.view.setUint32(24, size, true)
      record.view.setUint16(28, name.byteLength, true)
      record.view.setUint32(42, at, true)
      record.bytes.set(name, 46)
      central.push(record.bytes)
    },
  })
}

const ending = (path: string) => (/\.[a-z0-9]{2,5}$/i.exec(path)?.[0] ?? "").toLowerCase()

/** A stored file, opened only when the zip reaches it. */
function stored(path: string): ZipEntry["open"] {
  return async () => {
    const object = await getFromR2(path)
    if (!object.Body) throw new Error("A stored file came back empty.")
    return object.Body.transformToWebStream() as ReadableStream<Uint8Array>
  }
}

/**
 * The zip's name and entries for one of this person's projects, or a
 * sentence saying why there is none. The Bin is left out.
 */
export async function projectZip(
  userId: string,
  projectId: string,
  db: CustomShellDb = defaultDb
): Promise<{ name: string; entries: ZipEntry[] } | { refused: string }> {
  const [project] = await db
    .select({ name: promoProjects.name })
    .from(promoProjects)
    .where(and(eq(promoProjects.id, projectId), eq(promoProjects.userId, userId)))
    .limit(1)
  if (!project) return { refused: "That project is not there any more." }
  const items = await db
    .select()
    .from(promoArchiveItems)
    .where(and(eq(promoArchiveItems.projectId, projectId), eq(promoArchiveItems.status, "ready"), isNull(promoArchiveItems.deletedAt)))
    .orderBy(asc(promoArchiveItems.createdAt))
  if (!items.length) return { refused: "This project's archive is empty, so there is nothing to download." }
  const total = items.reduce((sum, item) => sum + item.fileSize, 0)
  if (total > ZIP_MAX_BYTES) return { refused: "That is over 4GB, too big for one zip. Download the items one at a time." }

  const slides = await db
    .select()
    .from(promoArchiveSlides)
    .where(inArray(promoArchiveSlides.itemId, items.map((item) => item.id)))
    .orderBy(asc(promoArchiveSlides.position))
  const taken = new Set<string>()
  const unique = (name: string) => {
    let candidate = name
    for (let n = 2; taken.has(candidate.toLowerCase()); n += 1) candidate = name.replace(/(\.[^.]+)?$/, ` (${n})$1`)
    taken.add(candidate.toLowerCase())
    return candidate
  }
  const entries: ZipEntry[] = []
  for (const item of items) {
    const title = zipName(item.title, "Untitled")
    if (item.kind === "carousel") {
      const folder = unique(title)
      for (const slide of slides.filter((row) => row.itemId === item.id)) {
        entries.push({ name: `${folder}/slide ${String(slide.position + 1).padStart(2, "0")}${ending(slide.storagePath)}`, open: stored(slide.storagePath) })
      }
      continue
    }
    if (item.storagePath) entries.push({ name: unique(`${title}${ending(item.storagePath)}`), open: stored(item.storagePath) })
  }
  return { name: `${zipName(project.name, "Archive")}.zip`, entries }
}
