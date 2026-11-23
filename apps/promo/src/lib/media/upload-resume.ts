/**
 * What the browser remembers about a video upload that has not finished, so
 * picking the same file again after a closed tab, a refresh or dropped wifi
 * carries on instead of starting over.
 *
 * Only the upload's key is kept here. Which pieces arrived is asked of the
 * bucket when the upload is picked back up, and the server checks the key is
 * the asker's own, so nothing stored here is trusted.
 *
 * "The same file" is the same name, size and last-changed time. A file edited
 * since has a new time and starts afresh.
 */

const PREFIX = "media-upload:"

/**
 * R2 throws unfinished pieces away seven days after the upload opened.
 * Stopping a day short means an upload is never picked back up just as the
 * bucket is clearing it.
 */
const KEEP_MS = 6 * 24 * 60 * 60 * 1000

export type RememberedUpload = {
  storagePath: string
  uploadId: string
  fileSize: number
  startedAt: number
}

type FileIdentity = Pick<File, "name" | "size" | "lastModified">

function keyFor(file: FileIdentity) {
  return `${PREFIX}${file.name}:${file.size}:${file.lastModified}`
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage
  } catch {
    // Some private windows refuse storage outright. Uploads then simply
    // start from the beginning each time, as they used to.
    return null
  }
}

export function rememberUpload(
  file: FileIdentity,
  upload: Omit<RememberedUpload, "startedAt">,
  nowMs: number = Date.now()
) {
  try {
    storage()?.setItem(keyFor(file), JSON.stringify({ ...upload, startedAt: nowMs }))
  } catch {
    // Full storage costs only the ability to pick this upload back up.
  }
}

export function recallUpload(
  file: FileIdentity,
  nowMs: number = Date.now()
): RememberedUpload | null {
  const store = storage()
  if (!store) return null
  forgetExpiredUploads(store, nowMs)
  const raw = store.getItem(keyFor(file))
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<RememberedUpload>
    if (
      typeof value.storagePath === "string" &&
      typeof value.uploadId === "string" &&
      value.fileSize === file.size &&
      typeof value.startedAt === "number"
    ) {
      return value as RememberedUpload
    }
  } catch {
    // Unreadable: treated as nothing remembered.
  }
  store.removeItem(keyFor(file))
  return null
}

export function forgetUpload(file: FileIdentity) {
  storage()?.removeItem(keyFor(file))
}

function forgetExpiredUploads(store: Storage, nowMs: number) {
  for (let index = store.length - 1; index >= 0; index -= 1) {
    const key = store.key(index)
    if (!key?.startsWith(PREFIX)) continue
    try {
      const { startedAt } = JSON.parse(store.getItem(key) ?? "{}") as {
        startedAt?: number
      }
      if (typeof startedAt === "number" && nowMs - startedAt < KEEP_MS) continue
    } catch {
      // Falls through to removal.
    }
    store.removeItem(key)
  }
}
