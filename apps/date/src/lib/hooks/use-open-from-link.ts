import * as React from "react"

/**
 * Opens the record another page linked to with `?open=<id>`.
 *
 * A dashboard shows a record in a dialog, so a link from somewhere else can
 * only name the one it means and leave the page to open it as soon as its list
 * has arrived. It fires once per id: closing the dialog must not spring it back
 * open while the address bar still says which record was asked for.
 */
export function useOpenFromLink<T extends { id: string }>({
  openId,
  records,
  onOpen,
}: {
  openId: string | undefined
  records: T[]
  onOpen: (record: T) => void
}) {
  const openedRef = React.useRef<string | null>(null)
  // The opener is a fresh function every render; keeping it in a ref leaves the
  // effect keyed on the id and the list, which is what actually changes.
  const onOpenRef = React.useRef(onOpen)
  React.useEffect(() => {
    onOpenRef.current = onOpen
  })

  React.useEffect(() => {
    if (!openId || openedRef.current === openId) return

    const match = records.find((record) => record.id === openId)
    // A list still loading, or a record since deleted: nothing to open.
    if (!match) return

    openedRef.current = openId
    onOpenRef.current(match)
  }, [openId, records])
}

/** Reads `?open=<id>` off a page's address, ignoring anything unusable. */
export function readOpenSearch(search: Record<string, unknown>) {
  return {
    open:
      typeof search.open === "string" && search.open.length <= 36
        ? search.open
        : undefined,
  }
}
