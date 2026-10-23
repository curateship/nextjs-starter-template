import { type MediaOrphan } from "@/lib/api/media/admin-media"

/** How the orphan rows can be ordered on the media library page. */
export type OrphanSort = "file" | "problem" | "owner" | "size" | "created"

export function problemLabel(kind: MediaOrphan["kind"]) {
  return kind === "unlinked_object" ? "No record in DB" : "Missing in storage"
}

/** A record orphan is identified by its row, a storage orphan by its key. */
export function orphanKey(row: MediaOrphan) {
  return row.kind === "missing_file" ? `db:${row.mediaId}` : `r2:${row.storagePath}`
}

export function compareOrphans(a: MediaOrphan, b: MediaOrphan, sort: OrphanSort) {
  if (sort === "size") return a.bytes - b.bytes
  if (sort === "problem") return a.kind.localeCompare(b.kind)
  if (sort === "owner") {
    return (a.ownerName ?? "").localeCompare(b.ownerName ?? "")
  }
  if (sort === "created") {
    return (a.createdAt ?? "").localeCompare(b.createdAt ?? "")
  }
  return a.name.localeCompare(b.name)
}
