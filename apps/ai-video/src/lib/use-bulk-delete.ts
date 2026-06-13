import * as React from "react"

// Single/bulk delete shared by the list/grid dashboards: owns the `deleteIds`
// (one row or a selection) + `deleting` state and the confirm lifecycle. The
// host wires in its delete calls, how to drop the deleted rows, and its notice
// setters. The success message derives from `noun` (single → "Noun deleted.",
// bulk → "Deleted N nouns."), with an optional suffix for cascade warnings.
//
// Removal strategy — provide exactly one:
//   • setItems — local filter, for dashboards that load every row up front.
//   • reload   — refetch, for server-paginated dashboards that hold one page.
export function useBulkDelete<T extends { id: string }>(opts: {
  noun: string
  // Omit for always-bulk dashboards (e.g. no single-delete endpoint).
  deleteOne?: (id: string) => Promise<unknown>
  deleteMany: (ids: string[]) => Promise<{ deletedCount: number }>
  clearSelection: (ids: string[]) => void
  setNotice: (message: string | null) => void
  setError: (message: string | null) => void
  formatError: (error: unknown) => string
  setItems?: React.Dispatch<React.SetStateAction<T[]>>
  reload?: () => Promise<unknown>
  // Appended before the period, e.g. "and their reels" for cascade deletes.
  noticeSuffix?: string
}) {
  const [deleteIds, setDeleteIds] = React.useState<string[] | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  const suffix = opts.noticeSuffix ? ` ${opts.noticeSuffix}` : ""

  async function confirmDelete() {
    if (!deleteIds?.length) return
    const ids = deleteIds

    setDeleting(true)
    opts.setError(null)
    opts.setNotice(null)
    try {
      // Single delete only when the host provides one; otherwise always bulk.
      if (ids.length === 1 && opts.deleteOne) {
        await opts.deleteOne(ids[0])
        opts.setNotice(
          `${opts.noun[0].toUpperCase()}${opts.noun.slice(1)} deleted${suffix}.`
        )
      } else {
        const { deletedCount } = await opts.deleteMany(ids)
        opts.setNotice(
          `Deleted ${deletedCount} ${deletedCount === 1 ? opts.noun : `${opts.noun}s`}${suffix}.`
        )
      }
      // Drop the deleted rows: refetch for server-paginated hosts, else filter.
      if (opts.reload) {
        await opts.reload()
      } else {
        const removed = new Set(ids)
        opts.setItems?.((current) =>
          current.filter((item) => !removed.has(item.id))
        )
      }
      opts.clearSelection(ids)
      setDeleteIds(null)
    } catch (error) {
      opts.setError(opts.formatError(error))
    } finally {
      setDeleting(false)
    }
  }

  return { deleteIds, setDeleteIds, deleting, confirmDelete }
}
