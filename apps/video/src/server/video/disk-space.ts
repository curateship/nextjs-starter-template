import { statfs } from "node:fs/promises"

import { formatFileSize } from "@/lib/format/format-bytes"

/**
 * Whether the server's disk has room for a job before it starts writing.
 *
 * On 24 Oct 2026 a full disk crashed the German server and took Trade's
 * database with it. A job that would fill the disk now waits instead: it is
 * put back in its queue and tried again a minute later, and says why.
 *
 * Disk size is never a reason to refuse a file. Tyler, 31 Oct 2026: "we'll
 * solve the hdd issue with getting hetzner dedicated server". This only stops
 * a job from filling the disk while it runs.
 */

/** Room kept free on top of what a job needs, for the database and the logs. */
export const DISK_MARGIN_BYTES = 2 * 1024 * 1024 * 1024

/** How long a queue waits after a job found the disk too full. */
export const DISK_WAIT_MS = 60_000

export class DiskFullError extends Error {
  readonly neededBytes: number
  readonly freeBytes: number

  constructor(neededBytes: number, freeBytes: number) {
    super(
      `Waiting for room on the server's disk: this needs ${formatFileSize(neededBytes)} free and ${formatFileSize(freeBytes)} is. It tries again in a minute.`
    )
    this.name = "DiskFullError"
    this.neededBytes = neededBytes
    this.freeBytes = freeBytes
  }
}

export function isDiskFullError(error: unknown): error is DiskFullError {
  return error instanceof DiskFullError
}

export type FreeDiskReader = (dir: string) => Promise<number>

/** Bytes a non-root process may still write in the folder's file system. */
export const readFreeDisk: FreeDiskReader = async (dir) => {
  const stats = await statfs(dir)
  return stats.bavail * stats.bsize
}

/**
 * Throws `DiskFullError` unless the folder's disk has `bytes` free plus the
 * margin. `readFree` is swapped in tests.
 */
export async function requireFreeDisk(
  dir: string,
  bytes: number,
  readFree: FreeDiskReader = readFreeDisk
) {
  const needed = Math.max(0, bytes) + DISK_MARGIN_BYTES
  const free = await readFree(dir)
  if (free < needed) throw new DiskFullError(needed, free)
}
