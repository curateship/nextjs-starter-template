import * as React from "react"

import {
  getCopyErrorMessage,
  readCopyNotes,
  removeCopyNotes,
} from "@/lib/api/trade/copy-trading"
import type { CopyNote } from "@/lib/trade/copy/copy-rules"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The skipped copies on these wallets, for the Journal.
 *
 * Read when the Journal is showing and again whenever its trades are read
 * again. Writing a skipped copy moves the wallet's history version, which is
 * what makes the Journal read its trades again, so a new skip shows up on the
 * same beat as a new trade. Nothing here polls.
 */
export function useCopyNotes(
  walletIds: readonly string[],
  showing: boolean,
  /** Changes whenever the Journal's trades were read again. */
  historyRead: unknown
): { notes: CopyNote[]; remove: (note: CopyNote) => void } {
  const [notes, setNotes] = React.useState<CopyNote[]>([])
  const key = [...walletIds].sort().join(",")

  React.useEffect(() => {
    if (!showing || key === "") return
    let live = true
    readCopyNotes(key.split(","))
      .then((next) => {
        if (live) setNotes(next)
      })
      .catch((error) => {
        if (live) {
          showErrorToast(
            `Skipped copies could not be read, so the Journal may be missing some. ${getCopyErrorMessage(error)}`
          )
        }
      })
    return () => {
      live = false
    }
  }, [key, showing, historyRead])

  const remove = React.useCallback((note: CopyNote) => {
    setNotes((current) => current.filter((one) => one.id !== note.id))
    removeCopyNotes([note.id]).catch((error) => {
      setNotes((current) =>
        current.some((one) => one.id === note.id)
          ? current
          : [...current, note].sort((a, b) => b.at - a.at)
      )
      showErrorToast(getCopyErrorMessage(error))
    })
  }, [])

  return { notes: showing ? notes : [], remove }
}
