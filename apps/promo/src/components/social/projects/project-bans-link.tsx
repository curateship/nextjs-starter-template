import { Link } from "@tanstack/react-router"
import { BanIcon } from "lucide-react"

/**
 * "2 accounts banned in the last 30 days" on a project's row and in its left
 * column (Bans task, part 18), opening the Bans dashboard filtered to the
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
