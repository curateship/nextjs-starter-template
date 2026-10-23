import * as React from "react"
import { toast } from "sonner"

import type { Category } from "@/lib/api/directory/categories"
import {
  bulkChangeVerb,
  describeBulkRefusals,
  type BulkChange,
  type BulkRecordChange,
} from "@/lib/bulk-change"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Running one action-bar change and saying what it did.
 *
 * All four dashboards report the same way, so the wording, the refresh and what
 * stays ticked afterwards live here once. Two things matter and both were
 * learned from Delete: the records that did not change stay ticked, so the rows
 * still on screen are the ones the message is about; and a run that changed
 * nothing is a failure, not a success toast reading "0 listings published".
 */
export function useBulkChange({
  one,
  many,
  rows,
  categories,
  send,
  describeError,
  onChanged,
  setSelected,
}: {
  /** The record's name, singular — "listing". */
  one: string
  /** The record's name, plural — "listings". */
  many: string
  /** The rows on screen, for naming a record that was refused. */
  rows: { id: string; title: string }[]
  /** The site's categories, for naming the one that was chosen. */
  categories: Category[] | null
  /** This kind's door: one request for the whole selection. */
  send: (ids: string[], change: BulkRecordChange) => Promise<BulkChange>
  /** The feature's own `getXErrorMessage`. */
  describeError: (error: unknown) => string
  /** Refreshes the list, and anything cached with it. */
  onChanged: () => Promise<void> | void
  setSelected: (ids: Set<string>) => void
}) {
  const [act, busy] = useAsyncAction(describeError)

  const titleById = React.useMemo(
    () => new Map(rows.map((row) => [row.id, row.title])),
    [rows]
  )

  /** Resolves true when the change went through, so a window can close on it. */
  const run = React.useCallback(
    (ids: string[], change: BulkRecordChange) => {
      return act(async () => {
        const result = await send(ids, change)
        await onChanged()
        setSelected(new Set(result.kept.map((refusal) => refusal.id)))

        // Named from the rows as they were before the refresh. A record that
        // was refused because somebody deleted it is not in the new list, so
        // the map that arrived with this render is the only place its name
        // still exists.
        const refusals = describeBulkRefusals(
          result.kept,
          (id) => titleById.get(id) ?? `One ${one}`
        )
        // Nothing went through at all, so there is no result to report and the
        // whole thing is a failure.
        if (result.done.length === 0 && result.same.length === 0) {
          throw new Error(
            refusals ||
              "Nothing changed. The list has been refreshed, so try again."
          )
        }

        const categoryName =
          change.kind === "category"
            ? (categories?.find((row) => row.id === change.categoryId)?.name ??
              "that category")
            : ""
        toast.success(
          describeBulkResult({
            done: result.done.length,
            same: result.same.length,
            kept: result.kept.length,
            one,
            many,
            verb: bulkChangeVerb(change, categoryName),
          })
        )
        // Alongside the count, not instead of it: the line above says how many,
        // and this says which ones and why. Shown rather than thrown, because
        // part of the batch did go through and throwing would report the whole
        // run as failed.
        if (refusals) showErrorToast(refusals)
      })
    },
    [act, categories, many, onChanged, one, send, setSelected, titleById]
  )

  return { run, busy }
}
