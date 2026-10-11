import { XIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

/**
 * The chip an admin list shows while it is limited to one member: who it is,
 * and one press that shows everyone again. It sits in the list's `filters`
 * strip, drawn as the shell's filter chip (a secondary badge with its own ×),
 * and looks the same on every list that takes one person (Polish 3 task 10).
 *
 * `name` is null when the rows on screen do not say who it is, such as an
 * empty page; the chip then says "one member" rather than nothing.
 */
export function AdminPersonFilter({
  name,
  onClear,
}: {
  name: string | null
  onClear: () => void
}) {
  const label = name ? `Only ${name}` : "Only one member"
  return (
    <Badge variant="secondary" className="max-w-full gap-1 pr-1">
      <span className="truncate">{label}</span>
      <button
        type="button"
        className={cn("shrink-0 rounded-sm p-0.5 hover:bg-muted", focusRing)}
        aria-label={`${label}. Show everyone`}
        onClick={onClear}
      >
        <XIcon className="size-3" />
      </button>
    </Badge>
  )
}
