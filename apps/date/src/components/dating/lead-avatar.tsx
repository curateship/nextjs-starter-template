import { cn } from "@/lib/utils"

import { DatingPicture } from "./picture"

/** Soft backgrounds for the letter, picked by the name so a person keeps theirs. */
const TINTS = [
  "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-100",
  "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-100",
  "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-100",
  "bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-100",
]

/**
 * A lead's round photo, their first one (part 8 of task
 * "features/07-three-panel-design": faces are quicker to find than letters).
 * Without one, while it loads, or once a passed card's photos were deleted
 * after 30 days, the round letter Tyler's mock of 20 Oct 2026 drew: the
 * name's first letter on a soft colour of its own.
 */
export function LeadAvatar({ name, photoId = null, className }: { name: string; photoId?: string | null; className?: string }) {
  const letter = name.trim().charAt(0).toUpperCase() || "?"
  let sum = 0
  for (const char of name) sum += char.charCodeAt(0)
  const letterMark = (
    <span aria-hidden className={cn("flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-medium", TINTS[sum % TINTS.length], className)}>
      {letter}
    </span>
  )
  if (!photoId) return letterMark
  return <DatingPicture pictureId={photoId} alt="" className={cn("size-9 shrink-0 rounded-full", className)} fallback={letterMark} />
}
