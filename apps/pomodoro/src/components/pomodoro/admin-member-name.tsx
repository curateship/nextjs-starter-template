import * as React from "react"
import { useNavigate } from "@tanstack/react-router"

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
  // An account deleted since leaves nobody to open; the name stays as text.
  if (!id)
    return (
      <span className={cn("block max-w-96 truncate", className)} title={title}>
        {name}
      </span>
    )
  return (
    <button
      type="button"
      className={cn("block max-w-96 truncate text-left font-medium hover:underline", className)}
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
}
