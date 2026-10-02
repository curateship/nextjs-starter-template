import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { Trash2Icon, UserPlusIcon, UsersIcon } from "lucide-react"
import { toast } from "sonner"

import { AddCreatorDialog } from "@/components/social/add-creator-dialog"
import {
  CreatorFilters,
  CreatorFiltersButton,
} from "@/components/social/creator-filters"
import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
} from "@/components/shared/dashboard-toolbar"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
} from "@/components/ui/table"
import {
  deleteCreators,
  getSocialCreatorsErrorMessage,
  type SocialCreatorsList,
} from "@/lib/api/trade/social"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { formatDateTime, formatTimeAgo } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useSelection } from "@/lib/hooks/use-selection"
import { focusRing } from "@/lib/layout/focus-ring"
import { useWideScreen } from "@/lib/layout/wide-screen"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  creatorsSearch,
  DEFAULT_CREATORS_QUERY,
  isNarrowed,
  MAX_SEARCH_LENGTH,
  SORT_LABELS,
  type SocialCreatorSort,
  type SocialCreatorsQuery,
} from "@/lib/trade/social/creators-query"
import { cn } from "@/lib/utils"

/**
 * Every creator you track, on one screen.
 *
 * The front door of Social. A table of who you have, with a search box and
 * three filters above it. Clicking a row opens that creator's own dashboard.
 * This screen never shows one creator's posts: it shows who you have and
 * helps you find the one you want.
 *
 * **The question lives in the address, not in this component.** The search,
 * the filters and the sort are all search params, so a narrowed list can be
 * reloaded and pasted, and the back button out of a creator's dashboard
 * returns to the same rows rather than to everything.
 *
 * **The sort runs on the server**, like the search and the filters. Clicking a
 * heading changes the address, which re-reads the list — sorting the rows
 * already on screen would order one page rather than the whole list.
 */
export function CreatorsListPage({
  initial,
  query,
}: {
  initial: SocialCreatorsList
  query: SocialCreatorsQuery
}) {
  const navigate = useNavigate()
  const router = useRouter()
  const desktop = useWideScreen()
  const [adding, setAdding] = React.useState(false)
  /** The ids the confirmation is asking about: one row's, or every ticked row. */
  const [deleting, setDeleting] = React.useState<string[] | null>(null)
  const [deleteBusy, setDeleteBusy] = React.useState(false)
  const { selected, toggle, toggleVisible, clear, selectAllState } =
    useSelection()
  const list = initial

  // What is in the box right now, which runs ahead of the address while
  // somebody is still typing. The address catches up a beat later, so a
  // five-letter search is one request rather than five.
  const [typed, setTyped] = React.useState(query.q)
  const [typedFor, setTypedFor] = React.useState(query.q)
  if (typedFor !== query.q) {
    setTypedFor(query.q)
    setTyped(query.q)
  }

  const ask = React.useCallback(
    (next: SocialCreatorsQuery) => {
      void navigate({
        to: "/social/manage",
        search: creatorsSearch(next),
        replace: true,
      })
    },
    [navigate]
  )

  const change = React.useCallback(
    (part: Partial<SocialCreatorsQuery>) => ask({ ...query, ...part }),
    [ask, query]
  )

  const SEARCH_DELAY_MS = 300
  React.useEffect(() => {
    const wanted = typed.trim().slice(0, MAX_SEARCH_LENGTH)
    if (wanted === query.q) return
    const timer = setTimeout(() => change({ q: wanted }), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [change, query.q, typed])

  /**
   * Clicking the heading already sorted on turns the arrow round. Clicking a
   * different one starts at the end somebody wants first: most followers, most
   * posts and newest post, but creators A to Z.
   */
  const sortBy = (column: SocialCreatorSort) => {
    if (column === query.sort) {
      change({ dir: query.dir === "asc" ? "desc" : "asc" })
      return
    }
    change({ sort: column, dir: column === "handle" ? "asc" : "desc" })
  }

  const heading = (column: SocialCreatorSort) => (
    <TableSortButton
      active={query.sort === column}
      direction={query.dir}
      onClick={() => sortBy(column)}
    >
      {SORT_LABELS[column]}
    </TableSortButton>
  )

  const narrowed = isNarrowed(query)

  // Only the rows on screen. A search that hides a ticked row must not delete
  // it from behind the filter: the toolbar counts what somebody can see.
  const visibleIds = list.rows.map((creator) => creator.id)
  const chosen = visibleIds.filter((id) => selected.has(id))

  const nameOf = (id: string) => {
    const creator = list.rows.find((row) => row.id === id)
    return creator ? `@${creator.handle}` : "that creator"
  }

  /**
   * Untrack the asked-for rows and say what actually went.
   *
   * The ids back from the server are the ones that matched this member, so a
   * row somebody deleted in another window reads as "could not be" rather than
   * being counted as deleted. `router.invalidate` re-runs the loader, because
   * the list, its total and the footer's "of 12 tracked" all come from it.
   */
  async function runDelete(ids: string[]) {
    setDeleteBusy(true)
    try {
      const { deleted } = await deleteCreators(ids)
      clear()
      await router.invalidate()
      toast.success(
        describeBulkResult({
          done: deleted.length,
          kept: ids.length - deleted.length,
          one: "creator",
          many: "creators",
          verb: "deleted",
        })
      )
    } catch (error) {
      showErrorToast(getSocialCreatorsErrorMessage(error))
    } finally {
      setDeleteBusy(false)
      setDeleting(null)
    }
  }

  return (
    <>
      <DashboardTable
        title="Creators"
        icon={<UsersIcon />}
        count={list.rows.length}
        selectedCount={chosen.length}
        onClearSelection={clear}
        controls={
          <>
            {/* The multi-row action comes before the search and the filters,
                which is the toolbar's order everywhere. It is only here while
                something is ticked, so the row is unchanged otherwise. */}
            {chosen.length ? (
              <DashboardToolbarButton
                type="button"
                variant="destructive"
                disabled={deleteBusy}
                onClick={() => setDeleting(chosen)}
              >
                <Trash2Icon className="size-4" />
                Delete ({chosen.length})
              </DashboardToolbarButton>
            ) : null}
            {/* Its own full-width row on a phone: sharing a line with the
                filter button left about four characters of it visible. */}
            <div className="w-full sm:w-auto">
              <DashboardToolbarSearch
                value={typed}
                maxLength={MAX_SEARCH_LENGTH}
                placeholder="Search posts and names"
                aria-label="Search your creators"
                onChange={(event) => setTyped(event.target.value)}
              />
            </div>
            {desktop ? (
              <CreatorFilters query={query} onChange={change} />
            ) : (
              <CreatorFiltersButton query={query} onChange={change} />
            )}
            <DashboardToolbarButton
              type="button"
              onClick={() => setAdding(true)}
            >
              <UserPlusIcon className="size-4" />
              Add a creator
            </DashboardToolbarButton>
          </>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="select">
                <Checkbox
                  checked={selectAllState(visibleIds)}
                  onCheckedChange={() => toggleVisible(visibleIds)}
                  aria-label="Select every creator on screen"
                />
              </TableHead>
              {/* The main column's 320px floor is lifted below 640 pixels.
                  At 390 it pushed "Last post" off the side, so reading when
                  somebody last posted meant scrolling the card sideways — and
                  that is one of the three things this table is for. The name
                  truncates instead. */}
              <TableHead column="main" className="min-w-0 sm:min-w-80">
                {heading("handle")}
              </TableHead>
              {/* Hidden under 640 pixels, where three number columns beside a
                  name is a table you read sideways. Posts and the last post
                  are the two somebody came here for, so followers is the one
                  that goes. */}
              <TableHead column="meta" className="hidden sm:table-cell">
                {heading("followers")}
              </TableHead>
              <TableHead column="meta">{heading("posts")}</TableHead>
              <TableHead column="meta">{heading("last")}</TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={list.rows.length === 0}
        emptyText={
          list.total === 0
            ? "You are not tracking anybody yet. Use Add a creator, paste the address of an X account, and their dashboard opens ready for their posts."
            : "No creator matches that search. Try fewer words, or clear the filters above."
        }
        emptyColSpan={6}
        footer={{
          type: "summary",
          count: list.rows.length,
          label: "creators",
          // How many were left out, and the one click that brings them back.
          // The count and the total are two facts, so they are two slots: the
          // footer trims a trailing "s" on a single row, which turned
          // "1 of 5 creators" into "1 of 5 creator".
          action: narrowed ? (
            <button
              type="button"
              className={cn(
                "rounded-sm underline underline-offset-2 hover:text-foreground",
                focusRing
              )}
              onClick={() => ask(DEFAULT_CREATORS_QUERY)}
            >
              of {list.total.toLocaleString()} tracked. Show all.
            </button>
          ) : null,
        }}
      >
        {list.rows.map((creator) => (
          <TableRow
            key={creator.id}
            rowAction={() =>
              void router.navigate({
                to: "/social/$handle",
                params: { handle: creator.handle },
              })
            }
          >
            <TableCell column="select">
              <Checkbox
                checked={selected.has(creator.id)}
                onCheckedChange={() => toggle(creator.id)}
                aria-label={`Select @${creator.handle}`}
              />
            </TableCell>
            <TableCell
              column="main"
              className="max-w-40 min-w-0 sm:max-w-none sm:min-w-80"
            >
              <span className="flex min-w-0 items-center gap-3">
                {/* Gone below 640 pixels. The picture plus its gap is 36
                    pixels, and on a phone those 36 pixels are the difference
                    between reading a 15-character handle and reading
                    "@zzcheck…". Nobody is identified by the fallback letter. */}
                <Avatar size="sm" className="hidden sm:flex">
                  {creator.picture ? (
                    <AvatarImage src={creator.picture} alt="" />
                  ) : null}
                  <AvatarFallback>
                    {creator.handle.slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="flex min-w-0 flex-col gap-0 sm:flex-row sm:items-baseline sm:gap-2">
                  <span className="truncate text-sm font-medium">
                    @{creator.handle}
                  </span>
                  {creator.displayName ? (
                    <span className="truncate text-xs text-muted-foreground">
                      {creator.displayName}
                    </span>
                  ) : null}
                </span>
              </span>
            </TableCell>
            <TableCell
              column="mutedMeta"
              className="hidden tabular-nums sm:table-cell"
              title={
                creator.followersAt
                  ? `Read ${formatDateTime(new Date(creator.followersAt))}`
                  : undefined
              }
            >
              {/* A dash, not a zero. Nobody has told us the number; that is
                  not the same as nobody following them. */}
              {creator.followers === null
                ? "—"
                : creator.followers.toLocaleString()}
            </TableCell>
            <TableCell column="mutedMeta" className="tabular-nums">
              {creator.postsHeld.toLocaleString()}
            </TableCell>
            <TableCell
              column="mutedMeta"
              title={
                creator.lastPostAt
                  ? formatDateTime(new Date(creator.lastPostAt))
                  : undefined
              }
            >
              {creator.lastPostAt === null
                ? "nothing held"
                : formatTimeAgo(new Date(creator.lastPostAt))}
            </TableCell>
            {/* Marked as the actions cell so clicking the bin never also opens
                the creator's dashboard through the row's own click. */}
            <TableCell column="actions">
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete @${creator.handle}`}
                  onClick={() => setDeleting([creator.id])}
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={
          deleting && deleting.length > 1
            ? `Delete ${deleting.length} creators?`
            : `Delete ${deleting ? nameOf(deleting[0]) : "this creator"}?`
        }
        description={
          deleting && deleting.length > 1
            ? `Trade stops tracking those ${plural(deleting.length, "account", "accounts")} and lets go of every post it holds for them, the markets read out of those posts, and their place in any folder. Their posts on X are untouched. This cannot be undone, and adding the account again starts from nothing.`
            : "Trade stops tracking the account and lets go of every post it holds for them, the markets read out of those posts, and their place in any folder. Their posts on X are untouched. This cannot be undone, and adding the account again starts from nothing."
        }
        confirmLabel="Delete"
        loading={deleteBusy}
        onConfirm={() => {
          if (deleting) void runDelete(deleting)
        }}
      />
      <AddCreatorDialog
        open={adding}
        onOpenChange={setAdding}
        onAdded={(handle) => {
          setAdding(false)
          void navigate({ to: "/social/$handle", params: { handle } })
        }}
      />
    </>
  )
}
