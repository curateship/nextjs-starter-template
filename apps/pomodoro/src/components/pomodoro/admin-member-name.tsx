import * as React from "react"
import { useNavigate } from "@tanstack/react-router"

import { Badge } from "@/components/ui/badge"
import { loadSimulatedMemberIds } from "@/lib/api/pomodoro/admin-simulated"
import { cn } from "@/lib/utils"

/**
 * A member's name on any Pomoder admin page, and what clicking it does: open
 * the member window (admin task 06) over the page, with `?member=<userId>` in
 * the address. See `workspace/docs/admin-members.md`.
 */

/**
 * Opens or closes the member window. Each is its own history entry, the way
 * the shell's Users list opens an account, so Back closes the window and the
 * address can be handed to somebody else.
 */
export function useMemberWindowLink() {
  const navigate = useNavigate()
  return React.useCallback(
    (userId: string | undefined) => {
      void navigate({
        to: ".",
        search: (previous: Record<string, unknown>) => {
          const next = { ...previous }
          if (userId) next.member = userId
          else delete next.member
          return next
        },
      })
    },
    [navigate]
  )
}

/**
 * Which accounts are made up (live activity task 01), read once for every
 * name on the page and again after a minute, so Tyler can tell them apart on
 * every admin list. Only admin pages draw this; no member ever sees it. See
 * `workspace/docs/made-up-members.md`.
 */
const MADE_UP_FRESH_MS = 60_000
let madeUpIds: ReadonlySet<string> | null = null
let madeUpReadAt = 0
let madeUpReading = false
const madeUpListeners = new Set<() => void>()

function readMadeUpIds() {
  if (madeUpReading || Date.now() - madeUpReadAt < MADE_UP_FRESH_MS) return
  madeUpReading = true
  loadSimulatedMemberIds().then(
    (ids) => {
      madeUpIds = new Set(ids)
      madeUpReadAt = Date.now()
      madeUpReading = false
      for (const listener of madeUpListeners) listener()
    },
    () => {
      // No mark is the safe failure: the list still works without it.
      madeUpReading = false
    }
  )
}

/** Reads the made-up accounts again, after Make them now or Remove all. */
export function forgetMadeUpIds() {
  madeUpReadAt = 0
  readMadeUpIds()
}

function subscribeMadeUp(listener: () => void) {
  madeUpListeners.add(listener)
  return () => madeUpListeners.delete(listener)
}

/** Whether this account is one of the made-up members. */
export function useIsMadeUp(id: string | null | undefined) {
  const ids = React.useSyncExternalStore(
    subscribeMadeUp,
    () => madeUpIds,
    () => null
  )
  React.useEffect(() => {
    readMadeUpIds()
  }, [])
  return Boolean(id && ids?.has(id))
}

/** The mark itself, beside a made-up account's name. */
export function MadeUpMark() {
  return (
    <Badge variant="outline" title="A made-up member. Real members never see this mark.">
      Made up
    </Badge>
  )
}

/** The name, drawn as the button that opens their window. */
export function MemberName({
  id,
  name,
  title = name,
  className,
}: {
  id: string | null | undefined
  name: string
  /** The hover text, when the email says more than the name. */
  title?: string
  className?: string
}) {
  const openMember = useMemberWindowLink()
  const madeUp = useIsMadeUp(id)
  // An account deleted since leaves nobody to open; the name stays as text.
  if (!id)
    return (
      <span className={cn("block max-w-96 truncate", className)} title={title}>
        {name}
      </span>
    )
  const button = (
    <button
      type="button"
      className={cn(
        "block max-w-96 truncate text-left font-medium hover:underline",
        madeUp && "min-w-0",
        className
      )}
      title={title}
      onClick={(event) => {
        // A name inside a clickable row opens the person, not the row.
        event.stopPropagation()
        openMember(id)
      }}
    >
      {name}
    </button>
  )
  if (!madeUp) return button
  return (
    <span className="flex max-w-96 min-w-0 items-center gap-1.5">
      {button}
      <MadeUpMark />
    </span>
  )
}
