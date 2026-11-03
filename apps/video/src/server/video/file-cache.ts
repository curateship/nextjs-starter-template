import { createHash } from "node:crypto"
import { statfsSync } from "node:fs"
import { mkdir, readdir, rename, rm, stat, utimes } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { uuid } from "@/server/auth/security"
import { requireFreeDisk, type FreeDiskReader } from "@/server/video/disk-space"
import { downloadToFile } from "@/server/video/storage-files"

/**
 * Stored files kept on this server's disk once they have been downloaded, so
 * the next job that needs the same file reads it from disk instead of
 * fetching it again. A 20GB original is downloaded once to make its smooth
 * copy, and every later job reuses that copy of it.
 *
 * - **Where:** `VIDEO_FILE_CACHE_DIR`, or a folder in the system's temporary
 *   folder.
 * - **How big:** `VIDEO_FILE_CACHE_GB` when set. Unset, a quarter of the
 *   disk the folder is on, and never more than 100GB, so the copies can
 *   never crowd out the database on a small disk. When a new file would take
 *   the folder past it, the files used longest ago go first. A file bigger
 *   than the whole cap is downloaded for its one job and deleted after, as
 *   every download was before.
 * - **Never under a job.** A file a job is reading is not deleted until the
 *   job lets go of it.
 * - **Deleted files go too.** The media worker's tick sweeps out any file
 *   whose library row or smooth copy is gone (`sweepFileCache`).
 *
 * One folder per process: the website and the worker each keep their own,
 * because they run in separate containers.
 */

const GB = 1024 * 1024 * 1024
/** Partial downloads a crash left behind are cleared after a day. */
const PARTIAL_MAX_AGE_MS = 24 * 60 * 60 * 1000

export type CachedFile = {
  path: string
  /** Lets the file be evicted again. Call it once the job is done with it. */
  release: () => Promise<void>
}

type Download = (
  storagePath: string,
  filePath: string,
  signal?: AbortSignal
) => Promise<void>

export type FileCacheOptions = {
  dir: string
  maxBytes: number
  download?: Download
  readFree?: FreeDiskReader
}

export class FileCache {
  private readonly dir: string
  private readonly maxBytes: number
  private readonly download: Download
  private readonly readFree: FreeDiskReader | undefined
  private readonly inUse = new Map<string, number>()
  private readonly inflight = new Map<string, Promise<void>>()

  constructor(options: FileCacheOptions) {
    this.dir = options.dir
    this.maxBytes = options.maxBytes
    this.download = options.download ?? downloadToFile
    this.readFree = options.readFree
  }

  /** Where a stored file is kept on disk. */
  pathFor(storagePath: string) {
    const hash = createHash("sha256").update(storagePath).digest("hex").slice(0, 40)
    return path.join(this.dir, `${hash}${path.extname(storagePath)}`)
  }

  /**
   * The stored file on disk, downloaded first unless it is already here.
   * `sizeBytes` is how big it is, for the disk check and the cap. Two jobs
   * asking for the same file at once share one download.
   */
  async open(
    storagePath: string,
    sizeBytes: number,
    signal?: AbortSignal
  ): Promise<CachedFile> {
    const file = this.pathFor(storagePath)
    await mkdir(this.dir, { recursive: true })

    if (sizeBytes > this.maxBytes) return this.openOnce(storagePath, sizeBytes, signal)

    // Held before anything is awaited, so a sweep or an eviction running
    // alongside the download never takes it.
    this.hold(file)
    try {
      if (!(await exists(file))) {
        let pending = this.inflight.get(file)
        if (!pending) {
          pending = this.fetch(storagePath, file, sizeBytes, signal).finally(() =>
            this.inflight.delete(file)
          )
          this.inflight.set(file, pending)
        }
        await pending
      }
      const touched = new Date()
      await utimes(file, touched, touched)
    } catch (error) {
      this.letGo(file)
      throw error
    }
    return { path: file, release: async () => this.letGo(file) }
  }

  /** The stored file on disk if it is already here, without downloading it. */
  async peek(storagePath: string): Promise<CachedFile | null> {
    const file = this.pathFor(storagePath)
    this.hold(file)
    if (!(await exists(file))) {
      this.letGo(file)
      return null
    }
    const touched = new Date()
    await utimes(file, touched, touched).catch(() => undefined)
    return { path: file, release: async () => this.letGo(file) }
  }

  /**
   * Keeps a file this server has just made and stored, such as a smooth copy,
   * so the next job reads it from disk rather than downloading it back. The
   * file is moved, not copied. A file bigger than the cap, or on a different
   * disk from the folder, is left where it is.
   */
  async adopt(storagePath: string, localPath: string, sizeBytes: number) {
    if (sizeBytes > this.maxBytes) return
    const file = this.pathFor(storagePath)
    try {
      await mkdir(this.dir, { recursive: true })
      await this.makeRoom(this.maxBytes - sizeBytes)
      await rename(localPath, file)
    } catch {
      // Only a later download is lost.
    }
  }

  /**
   * Deletes every kept file whose stored file is not in `live`, unless a job
   * is reading it, and partial downloads older than a day.
   */
  async sweep(live: Iterable<string>) {
    const keep = new Set<string>()
    for (const storagePath of live) keep.add(path.basename(this.pathFor(storagePath)))
    for (const entry of await this.entries()) {
      if (this.inUse.has(entry.file)) continue
      if (entry.partial) {
        if (Date.now() - entry.mtimeMs > PARTIAL_MAX_AGE_MS) await rm(entry.file, { force: true })
        continue
      }
      if (!keep.has(path.basename(entry.file))) await rm(entry.file, { force: true })
    }
  }

  private async fetch(
    storagePath: string,
    file: string,
    sizeBytes: number,
    signal?: AbortSignal
  ) {
    await this.makeRoom(this.maxBytes - sizeBytes)
    await requireFreeDisk(this.dir, sizeBytes, this.readFree)
    const partial = `${file}.partial-${uuid()}`
    try {
      await this.download(storagePath, partial, signal)
      await rename(partial, file)
    } catch (error) {
      await rm(partial, { force: true })
      throw error
    }
  }

  /** A file too big to keep: downloaded beside the others, deleted after. */
  private async openOnce(
    storagePath: string,
    sizeBytes: number,
    signal?: AbortSignal
  ): Promise<CachedFile> {
    await requireFreeDisk(this.dir, sizeBytes, this.readFree)
    const file = path.join(this.dir, `once-${uuid()}${path.extname(storagePath)}.partial`)
    try {
      await this.download(storagePath, file, signal)
    } catch (error) {
      await rm(file, { force: true })
      throw error
    }
    return { path: file, release: () => rm(file, { force: true }) }
  }

  /** Deletes the files used longest ago until the rest fit in `budget`. */
  private async makeRoom(budget: number) {
    const kept = (await this.entries()).filter((entry) => !entry.partial)
    let total = kept.reduce((sum, entry) => sum + entry.size, 0)
    kept.sort((a, b) => a.mtimeMs - b.mtimeMs)
    for (const entry of kept) {
      if (total <= budget) break
      if (this.inUse.has(entry.file)) continue
      await rm(entry.file, { force: true })
      total -= entry.size
    }
  }

  private async entries() {
    let names: string[]
    try {
      names = await readdir(this.dir)
    } catch {
      return []
    }
    const found: { file: string; size: number; mtimeMs: number; partial: boolean }[] = []
    for (const name of names) {
      const file = path.join(this.dir, name)
      const info = await stat(file).catch(() => null)
      if (!info?.isFile()) continue
      found.push({
        file,
        size: info.size,
        mtimeMs: info.mtimeMs,
        partial: name.includes(".partial"),
      })
    }
    return found
  }

  private hold(file: string) {
    this.inUse.set(file, (this.inUse.get(file) ?? 0) + 1)
  }

  private letGo(file: string) {
    const count = (this.inUse.get(file) ?? 1) - 1
    if (count > 0) this.inUse.set(file, count)
    else this.inUse.delete(file)
  }
}

async function exists(file: string) {
  return stat(file).then(
    () => true,
    () => false
  )
}

declare global {
  var __videoFileCache: FileCache | undefined
}

/**
 * This process's one cache, on `globalThis` so the dev server's module
 * reloads do not forget which files jobs are reading.
 */
export function fileCache() {
  if (!globalThis.__videoFileCache) {
    const dir = process.env.VIDEO_FILE_CACHE_DIR || path.join(tmpdir(), "video-file-cache")
    globalThis.__videoFileCache = new FileCache({ dir, maxBytes: defaultCacheBytes(dir) })
  }
  return globalThis.__videoFileCache
}

/** The most the kept copies take when the folder is on a disk this big. */
export function cacheBytesForDisk(diskBytes: number) {
  return Math.min(DEFAULT_CACHE_MAX_BYTES, Math.floor(diskBytes / 4))
}

const DEFAULT_CACHE_MAX_BYTES = 100 * GB

function defaultCacheBytes(dir: string) {
  const chosen = Number(process.env.VIDEO_FILE_CACHE_GB)
  if (chosen > 0) return chosen * GB
  // The disk the folder will be on. A folder not made yet is on the same
  // disk as the system's temporary folder, or close enough to judge by.
  for (const place of [dir, path.dirname(dir), tmpdir()]) {
    try {
      const disk = statfsSync(place)
      return cacheBytesForDisk(disk.blocks * disk.bsize)
    } catch {
      // Not there yet: try the next place.
    }
  }
  return 10 * GB
}
