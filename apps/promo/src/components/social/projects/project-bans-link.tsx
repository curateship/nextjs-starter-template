import { Link } from "@tanstack/react-router"
import { BanIcon } from "lucide-react"

import { Hint } from "@/components/social/hint"

/**
 * "2 accounts banned in the last 30 days" on a project's row in the Projects
 * table (Bans task, part 18), opening the Bans dashboard filtered to the
 * project and the last 30 days. Nothing shows when there are none.
 */
export function ProjectBansLink({ projectId, count }: { projectId: string; count: number }) {
  if (!count) return null
  return (
    <Link
      to="/admin/bans"
      search={{ project: projectId, since: 30 }}
      className="flex w-fit items-center gap-1 text-xs text-destructive hover:underline"
      onClick={(event) => event.stopPropagation()}
    >
      <BanIcon className="size-3" aria-hidden="true" />
      {count} {count === 1 ? "account" : "accounts"} banned in the last 30 days
    </Link>
  )
}

/**
 * The same, as a small red mark after the project's name in its left
 * column's header (left-column-standards task, part 6): the number, with its
 * words on hover. A guest, who has no Bans dashboard, gets the mark alone.
 */
export function ProjectBansMark({ projectId, count, link }: { projectId: string; count: number; link: boolean }) {
  if (!count) return null
  const words = `${count} ${count === 1 ? "account" : "accounts"} banned in the last 30 days`
  const mark = (
    <>
      <BanIcon className="size-3.5" aria-hidden="true" />
      <span className="tabular-nums">{count}</span>
    </>
  )
  const className = "flex shrink-0 items-center gap-0.5 rounded-sm text-xs font-normal text-destructive"
  return (
    <Hint label={words}>
      {link ? (
        <Link
          to="/admin/bans"
          search={{ project: projectId, since: 30 }}
          aria-label={`${words}. Open the Bans dashboard`}
          className={`${className} hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none`}
        >
          {mark}
        </Link>
      ) : (
        <span className={className} aria-label={words} tabIndex={0}>
          {mark}
        </span>
      )}
    </Hint>
  )
}
