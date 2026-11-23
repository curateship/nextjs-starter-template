import { TreePalmIcon } from "lucide-react"

import type { AwayDay } from "@/lib/api/project/checkins"

/**
 * Who is on time off, on a Team calendar day (Features 16 Oct, part 6):
 * "Leo away", or "3 away" when more than one is. A phone's square has room
 * for the mark and the count only. No reason is ever shown, because none is
 * kept.
 */
export function AwayChip({ away }: { away: AwayDay | undefined }) {
  if (!away) return null
  const count = away.people.length
  return (
    <span className="flex w-full items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground">
      <TreePalmIcon className="size-3 shrink-0 sm:hidden" aria-hidden />
      <span className="sm:hidden">{count}</span>
      <span className="truncate max-sm:hidden">{count === 1 ? `${away.people[0].name} away` : `${count} away`}</span>
    </span>
  )
}
