import * as React from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { MailCheckIcon, SettingsIcon } from "lucide-react"

import { DashboardTable } from "@/components/shared/dashboard-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
} from "@/components/ui/table"
import type { SystemEmailListItem } from "@/lib/api/email/system-emails"
import {
  RECENT_SEND_DAYS,
  SYSTEM_EMAIL_META,
  type SystemEmailKind,
} from "@/lib/system-emails/kinds"
import { formatDate } from "@/lib/format/format-time"
import { useTableSort } from "@/lib/hooks/use-table-sort"

type SortColumn = "name" | "subject" | "sends" | "edited"

/**
 * The emails the app sends for itself.
 *
 * This is a fixed built-in list, so it has no search, no paging and no way to
 * add or delete one — those would all be controls that never do anything. It
 * is a way in to each editor and an answer to "has this one actually been
 * going out".
 */
export function SystemEmailsPage({
  initial,
}: {
  initial: SystemEmailListItem[]
}) {
  const navigate = useNavigate()
  // Starts in the order the emails are declared, which is roughly the order
  // somebody meets them: register, sign in, forget the password.
  const { sort, direction, toggleSort } = useTableSort<SortColumn>("name", "asc", (column) => column === "sends" || column === "edited" ? "desc" : "asc")

  const openEditor = (kind: SystemEmailKind) =>
    navigate({ to: "/admin/system-emails/$kind", params: { kind } })

  const rows = React.useMemo(() => {
    const factor = direction === "asc" ? 1 : -1
    return [...initial].sort((left, right) => {
      if (sort === "name") {
        return (
          factor *
          SYSTEM_EMAIL_META[left.kind].name.localeCompare(
            SYSTEM_EMAIL_META[right.kind].name
          )
        )
      }
      if (sort === "subject") {
        return factor * left.subject.localeCompare(right.subject)
      }
      if (sort === "sends") {
        // Everything that went out, not only what worked — "this one is busy"
        // is the question, and a failure is still an attempt.
        return (
          factor *
          (left.recentSent +
            left.recentFailed -
            (right.recentSent + right.recentFailed))
        )
      }
      // Never edited sorts as the oldest, so ascending puts the built-in ones
      // first and descending puts what you touched most recently on top.
      return factor * (left.updated_at ?? "").localeCompare(right.updated_at ?? "")
    })
  }, [direction, initial, sort])

  return (
    <DashboardTable
      title="System emails"
      icon={<MailCheckIcon />}
      count={initial.length}
      footer={{
        type: "summary",
        count: initial.length,
        label: "emails the app sends on its own",
      }}
      header={
        <TableHeader>
          <TableRow>
            <TableHead column="main">
              <TableSortButton
                active={sort === "name"}
                direction={direction}
                onClick={() => toggleSort("name")}
              >
                Email
              </TableSortButton>
            </TableHead>
            <TableHead column="meta" className="hidden sm:table-cell">
              <TableSortButton
                active={sort === "subject"}
                direction={direction}
                onClick={() => toggleSort("subject")}
              >
                Subject
              </TableSortButton>
            </TableHead>
            <TableHead column="meta" className="hidden md:table-cell">
              <TableSortButton
                active={sort === "sends"}
                direction={direction}
                onClick={() => toggleSort("sends")}
              >
                Last {RECENT_SEND_DAYS} days
              </TableSortButton>
            </TableHead>
            <TableHead column="meta">
              <TableSortButton
                active={sort === "edited"}
                direction={direction}
                onClick={() => toggleSort("edited")}
              >
                Edited
              </TableSortButton>
            </TableHead>
            <TableHead column="meta">Actions</TableHead>
          </TableRow>
        </TableHeader>
      }
      isEmpty={false}
      // Never actually shown: these are built into the app and cannot be
      // deleted, searched away or filtered out. The table still asks for it.
      emptyText="The app sends no emails of its own."
      emptyColSpan={5}
    >
      {rows.map((item) => (
        <TableRow
          key={item.kind}
          className="group"
          rowAction={() => void openEditor(item.kind)}
        >
          <TableCell column="main">
            <Link
              to="/admin/system-emails/$kind"
              params={{ kind: item.kind }}
              className="block max-w-96 truncate text-left font-medium underline-offset-2 group-hover:underline"
              title={SYSTEM_EMAIL_META[item.kind].name}
            >
              {SYSTEM_EMAIL_META[item.kind].name}
            </Link>
            <span className="mt-0.5 block max-w-96 truncate text-sm text-muted-foreground">
              {SYSTEM_EMAIL_META[item.kind].whenSent}
            </span>
          </TableCell>
          <TableCell column="mutedMeta" className="hidden sm:table-cell">
            <span className="block max-w-72 truncate" title={item.subject}>
              {item.subject}
            </span>
          </TableCell>
          <TableCell column="mutedMeta" className="hidden md:table-cell">
            {item.recentSent === 0 && item.recentFailed === 0
              ? "None"
              : `${item.recentSent} sent` +
                (item.recentFailed > 0
                  ? ` · ${item.recentFailed} did not go through`
                  : "")}
          </TableCell>
          <TableCell column="meta">
            {item.edited && item.updated_at ? (
              <span className="text-sm text-muted-foreground">
                {formatDate(item.updated_at)}
              </span>
            ) : (
              <Badge variant="secondary">Built in</Badge>
            )}
          </TableCell>
          <TableCell column="actions">
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Open ${SYSTEM_EMAIL_META[item.kind].name}`}
                onClick={() => void openEditor(item.kind)}
              >
                <SettingsIcon className="size-4" />
              </Button>
            </div>
          </TableCell>
        </TableRow>
      ))}
    </DashboardTable>
  )
}
