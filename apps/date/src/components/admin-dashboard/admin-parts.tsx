import * as React from "react"

import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

/**
 * A member's name that opens them in Users, which every Admin section draws
 * with. The narrow rows the blocks and widgets use are `SideRows` in
 * `components/shared/notes/side-rows.tsx`.
 */

const OpenPerson = React.createContext<(userId: string) => void>(() => undefined)

export const OpenPersonProvider = OpenPerson.Provider

/**
 * A member's name. Pressed, the Users tab opens with them on the right
 * (Tyler, 8 Nov 2026: "clicking the user should open its user data on the
 * right panel"). A deleted account has nobody to open, so its name is plain
 * muted text.
 */
export function MemberName({
  userId,
  name,
  className,
}: {
  userId: string | null
  name: string
  className?: string
}) {
  const open = React.useContext(OpenPerson)
  if (!userId) {
    return <span className={cn("block truncate font-medium text-muted-foreground", className)}>{name}</span>
  }
  return (
    <button
      type="button"
      onClick={() => open(userId)}
      className={cn(
        "block max-w-full truncate rounded-sm text-left font-medium hover:underline",
        focusRing,
        className
      )}
    >
      {name}
    </button>
  )
}
