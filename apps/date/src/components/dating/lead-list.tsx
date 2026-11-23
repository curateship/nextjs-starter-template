import * as React from "react"
import { Loader2Icon, MessageSquareShareIcon, PlayIcon, RefreshCwIcon, SquareIcon, TriangleAlertIcon, UserRoundXIcon } from "lucide-react"

import { CrmListHeader, CrmRowMenu, type RowMenuItem } from "@/components/crm/crm-row"
import { CrmGroupRow, CrmTable, CrmTableRow, OpenBar } from "@/components/crm/crm-table"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { FilterPopover } from "@/components/shared/filter-popover"
import { SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
import { SaveViewDialog, SavedViewsControls, type EditFields, type SavedViewsScreen } from "@/components/shared/saved-views"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { TableCell } from "@/components/ui/table"
import type { DatingDashboard } from "@/lib/api/dating/dashboard"
import type { SavedView } from "@/lib/api/saved-views"
import { DATING_SAVED_VIEW_KIND, describeLeadView } from "@/lib/dating/lead-views"
import {
  LEAD_GROUP_WORDS,
  LEAD_GROUPS,
  LEAD_OVER_WORDS,
  LEAD_SCORE_FLOORS,
  LEAD_STATUS_WORDS,
  LEAD_STATUSES,
  defaultLeadDirection,
  leadFilterCount,
  readLeadView,
  type LeadGroup,
  type LeadListItem,
  type LeadSort,
  type LeadView,
} from "@/lib/dating/leads"
import { DATING_APP_WORDS, stopReasonWords } from "@/lib/dating/options"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSort } from "@/lib/nav/list-search"
import { savedViewScreen, type SavedViewValues } from "@/lib/saved-views"
import { cn } from "@/lib/utils"

import { DatesMonth, DatesSplit } from "./dates-month"
import { LeadAvatar } from "./lead-avatar"
import { NeedsBadge, StatusPill } from "./lead-status"
import { nameAndAge, whenWords } from "./words"

/** The open profile's saved views: each profile keeps its own. */
function viewsHere(accountId: string): SavedViewsScreen {
  return {
    screen: savedViewScreen(DATING_SAVED_VIEW_KIND, accountId),
    describe: (filters) => describeLeadView(readLeadView(filters)),
    kept: (filters) => readLeadView(filters) as SavedViewValues,
  }
}

/** "Any" in a Select, since a Select item cannot hold an empty value. */
const ANY = "any"

/** What a row's right-click can ask of the dashboard. */
export type LeadRowAction = "read-chat" | "moved" | "back" | "unmatch"

/**
 * The headings the list folds under (part 4 of task
 * "features/07-three-panel-design"): leads waiting on the member first, then
 * each status in the order a lead goes through them. A lead waiting on the
 * member shows under Waiting on you only.
 */
const HEADINGS: LeadGroup[] = ["waiting", ...LEAD_STATUSES]

function headingOf(lead: LeadListItem): LeadGroup {
  return lead.waiting !== null && lead.status !== "over" ? "waiting" : lead.status
}

/**
 * The Leads, Matches and Dates sections' middle panel, in the Admin 3 panel
 * design (task "features/07-three-panel-design"): the shell's one list
 * header (`CrmListHeader`) and table (`CrmTable`). Every lead and its status
 * (Tyler, 20 Oct 2026: "middle is a list of all the leads and its status").
 *
 * - **Header:** the reopen button for a shut left panel, the section's icon
 *   and name, the "N selected" button while rows are ticked, the search box,
 *   Select, Filter and Views, then Start swiping as the one primary button
 *   (Tyler, 18 Nov 2026: "move the start swiping button here", after Views),
 *   then the reopen button for a shut right panel.
 * - **Rows** fold under status headings with counts (Over starts folded), or
 *   run as one list once a column is sorted. Each is the lead's photo, name
 *   and line, its status, what it needs from the member, its score, who
 *   swiped and the last change; the columns drop out as the panel narrows.
 * - **Right-click** a row: Mass select, Read the chat again, Moved to text,
 *   then Unmatch in red (part 9). Cards are never swiped together, because
 *   the app swipes only the card on the phone's screen.
 * - A lead is read as the pointer heads for its row, so it opens at once
 *   (part 7).
 */
export function LeadList({
  data,
  leads,
  view,
  views,
  openId,
  busy,
  heading,
  headingEnd,
  onView,
  onOpen,
  onRows,
  onPrefetch,
  onResume,
  onOpenPicture,
  onMovedToText,
  onClearDead,
  onRowAction,
  onStartOrStop,
}: {
  data: DatingDashboard
  /** The leads to show, filtered and in order. */
  leads: LeadListItem[]
  view: LeadView
  views: SavedView[]
  openId: string | undefined
  busy: string | null
  /** The reopen button for a shut left panel, then the section's icon and name. */
  heading: React.ReactNode
  /** The reopen button for a shut right panel. */
  headingEnd: React.ReactNode
  onView: (patch: Record<string, unknown>) => void
  onOpen: (id: string) => void
  /** The rows as shown, folded headings left out, for the arrow keys and the first row on arrival. */
  onRows: (ids: string[]) => void
  /** The pointer is heading for this lead's row. */
  onPrefetch: (id: string) => void
  onResume: () => void
  onOpenPicture: (picture: { id: string; title: string; description?: string }) => void
  /** Resolves true once the ticked chats moved. */
  onMovedToText: (matchIds: string[]) => Promise<boolean>
  onClearDead: (ticked: LeadListItem[]) => void
  onRowAction: (action: LeadRowAction, lead: LeadListItem) => void
  /** Start swiping, or Stop while the phone swipes. */
  onStartOrStop: (run: boolean) => void
}) {
  const sort: LeadSort = view.sort ?? "changed"
  const direction = view.direction ?? defaultLeadDirection(sort)
  const toggleSort = useListSort<LeadSort>({ sort, direction }, defaultLeadDirection)
  const [filterOpen, setFilterOpen] = React.useState(false)
  const [savingView, setSavingView] = React.useState(false)
  const here = React.useMemo(() => viewsHere(data.profile.id), [data.profile.id])
  const appName = DATING_APP_WORDS[data.profile.app].name

  const [massSelect, setMassSelect] = React.useState(false)
  const selection = useSelection()
  useClearSelectionOnListChange(selection.setSelected, JSON.stringify(view))
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const toggleMassSelect = (tickId?: string) => {
    if (massSelect) {
      selection.clear()
      setMassSelect(false)
      return
    }
    // Turned on from a row, that row starts ticked; from the header, nothing is.
    selection.setSelected(new Set(tickId ? [tickId] : []))
    setMassSelect(true)
  }

  // Grouped under headings unless a column is sorted. Over starts folded.
  const grouped = view.sort === undefined
  const [folded, setFolded] = React.useState<Set<LeadGroup>>(() => new Set(["over"]))
  const toggleFold = (group: LeadGroup) =>
    setFolded((current) => {
      const next = new Set(current)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  const groups = grouped
    ? HEADINGS.map((group) => ({ group, rows: leads.filter((lead) => headingOf(lead) === group) })).filter((entry) => entry.rows.length)
    : []
  const visible = grouped ? groups.flatMap((entry) => (folded.has(entry.group) ? [] : entry.rows)) : leads
  const visibleIds = visible.map((lead) => lead.id)
  const idsText = visibleIds.join("\n")
  // The latest callback, so the rows are reported when they change and not on every draw.
  const onRowsRef = React.useRef(onRows)
  React.useEffect(() => {
    onRowsRef.current = onRows
  })
  React.useEffect(() => {
    onRowsRef.current(idsText ? idsText.split("\n") : [])
  }, [idsText])

  const ticked = leads.filter((lead) => selection.selected.has(lead.id))
  const tickedChats = ticked.filter((lead) => lead.matchId)

  const filters = readLeadView({ ...view, tab: undefined, q: undefined, sort: undefined, direction: undefined })
  const currentView = readLeadView({ ...view, tab: undefined }) as SavedViewValues

  const editViewFields: EditFields = ({ filters: values, change }) => (
    <>
      <div className="grid gap-2">
        <Label htmlFor="edit-lead-view-search">Search</Label>
        <Input
          id="edit-lead-view-search"
          value={typeof values.q === "string" ? values.q : ""}
          maxLength={200}
          placeholder="Names and last lines"
          onChange={(event) => change({ q: event.target.value || undefined })}
        />
      </div>
      <LeadFilterRows idPrefix="edit-lead-view" view={readLeadView(values)} onChange={change} />
    </>
  )

  const columns: TableHeaderColumn<LeadSort>[] = [
    // The preset 320px minimum is for a full page; this table sits in a panel.
    { key: "name", label: "Lead", column: "main", className: "min-w-40" },
    { key: "status", label: "Status", sortable: false, column: "meta", className: "hidden @md/list:table-cell" },
    { key: "needs", label: "Needs", sortable: false, column: "meta", className: "hidden @2xl/list:table-cell" },
    { key: "score", label: "Score", column: "meta", className: "hidden text-right @lg/list:table-cell" },
    { key: "by", label: "Swiped by", sortable: false, column: "meta", className: "hidden @5xl/list:table-cell" },
    { key: "changed", label: "Last change", column: "meta", className: "hidden text-right @4xl/list:table-cell" },
  ]

  const stopped = data.phone?.paired ? data.phone.stoppedReason : null
  const running = Boolean(data.phone?.running)
  const rowMenuItems = (lead: LeadListItem): RowMenuItem[] => {
    if (!lead.matchId || lead.overWhy === "unmatched-them" || lead.overWhy === "unmatched-you") return []
    const moved = lead.overWhy === "moved"
    return [
      { label: "Read the chat again", icon: <RefreshCwIcon className="size-4" />, onSelect: () => onRowAction("read-chat", lead) },
      {
        label: moved ? `Back on ${appName}` : "Moved to text",
        icon: <MessageSquareShareIcon className="size-4" />,
        onSelect: () => onRowAction(moved ? "back" : "moved", lead),
      },
      { label: "Unmatch", icon: <UserRoundXIcon className="size-4" />, destructive: true, onSelect: () => onRowAction("unmatch", lead) },
    ]
  }
  const rightClickLead = rightClick ? leads.find((lead) => lead.id === rightClick.id) : undefined

  const row = (lead: LeadListItem) => (
    <CrmTableRow
      key={lead.id}
      open={lead.id === openId}
      label={lead.name}
      tick={massSelect ? { shown: true, ticked: selection.selected.has(lead.id), onToggle: () => selection.toggle(lead.id) } : null}
      onOpen={() => onOpen(lead.id)}
      onRightClick={(x, y) => setRightClick({ id: lead.id, x, y })}
    >
      <TableCell column="main" className="min-w-40">
        <span className="flex min-w-0 items-center gap-2" data-lead-id={lead.id}>
          <OpenBar />
          <LeadAvatar name={lead.name} photoId={lead.photoId} className="size-7 text-xs" />
          <span className="grid min-w-0 leading-tight">
            <span className="flex min-w-0 items-center gap-1.5">
              <span data-row-name="" className={cn("line-clamp-1 min-w-0 break-all", lead.unreadCount ? "font-semibold" : "font-medium")}>
                {nameAndAge(lead.name, lead.age)}
              </span>
              {lead.unreadCount ? (
                <span className="size-1.5 shrink-0 rounded-full bg-foreground" role="img" aria-label={`${lead.unreadCount} unread`} />
              ) : null}
            </span>
            <span className="line-clamp-1 min-w-0 break-all text-xs text-muted-foreground">
              {/* The status under the name once its own column has gone. */}
              <span className="@md/list:hidden">{LEAD_STATUS_WORDS[lead.status]}, </span>
              {lead.overWhy ? `${LEAD_OVER_WORDS[lead.overWhy]}, ` : ""}
              {secondLine(lead)}
            </span>
          </span>
        </span>
      </TableCell>
      <TableCell column="meta" className="hidden @md/list:table-cell">
        <StatusPill status={lead.status} />
      </TableCell>
      <TableCell column="meta" className="hidden @2xl/list:table-cell">
        <NeedsBadge lead={lead} />
      </TableCell>
      <TableCell
        column="meta"
        className={cn(
          "hidden text-right font-semibold tabular-nums @lg/list:table-cell",
          (lead.status === "passed" || lead.status === "over") && "font-normal text-muted-foreground"
        )}
      >
        {lead.score ?? <span className="font-normal text-muted-foreground">-</span>}
      </TableCell>
      <TableCell column="mutedMeta" className="hidden @5xl/list:table-cell">
        {lead.swipedBy === "ai" ? "The AI" : lead.swipedBy === "member" ? "You" : "Nobody yet"}
      </TableCell>
      <TableCell column="mutedMeta" className="hidden text-right whitespace-nowrap @4xl/list:table-cell">
        {whenWords(lead.changedAt)}
      </TableCell>
    </CrmTableRow>
  )

  // A lead is read as the pointer or the keyboard reaches its row (part 7).
  const prefetchFrom = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return
    const id = target.closest("tr")?.querySelector<HTMLElement>("[data-lead-id]")?.dataset.leadId
    if (id && id !== openId) onPrefetch(id)
  }

  return (
    <div className="@container/list flex min-h-0 flex-1 flex-col">
      <CrmListHeader
        tabs={heading}
        end={headingEnd}
        menuLabel="More for leads"
        search={{
          name: "lead-search",
          label: "Search leads",
          placeholder: "Search names and lines",
          value: view.q ?? "",
          onChange: (text) => onView({ q: text.trim() ? text : undefined }),
        }}
        massSelect={{ on: massSelect, onToggle: () => toggleMassSelect() }}
        selected={
          massSelect && ticked.length ? (
            <SelectedMenu
              count={ticked.length}
              busy={busy === "mass" || busy === "clear-dead"}
              onClear={selection.clear}
              main={(menu) =>
                tickedChats.length ? (
                  <>
                    <SelectedMenuRow
                      onClick={() => {
                        menu.close()
                        void onMovedToText(tickedChats.map((lead) => lead.matchId as string)).then((ok) => ok && selection.clear())
                      }}
                    >
                      Moved to text{tickedChats.length < ticked.length ? `, ${tickedChats.length} of them are chats` : ""}
                    </SelectedMenuRow>
                    <SelectedMenuRow
                      onClick={() => {
                        menu.close()
                        onClearDead(tickedChats)
                      }}
                    >
                      Clear dead
                    </SelectedMenuRow>
                  </>
                ) : (
                  <p className="px-2 py-1.5 text-sm text-muted-foreground">
                    None of these is a chat. Cards are swiped one at a time, because {appName} swipes only the card on the phone's screen.
                  </p>
                )
              }
              pages={{}}
            />
          ) : null
        }
        filter={
          <FilterPopover
            count={leadFilterCount(filters)}
            open={filterOpen}
            onOpenChange={setFilterOpen}
            onClear={() => onView({ group: undefined, by: undefined, score: undefined, over: undefined, real: undefined })}
            save={
              <Button
                type="button"
                onClick={() => {
                  setFilterOpen(false)
                  setSavingView(true)
                }}
              >
                Save as view
              </Button>
            }
          >
            <LeadFilterRows idPrefix="lead-filter" view={filters} onChange={onView} />
          </FilterPopover>
        }
        primary={
          <DashboardToolbarButton type="button" disabled={busy === "loop"} onClick={() => onStartOrStop(!running)}>
            {busy === "loop" ? <Loader2Icon className="animate-spin" /> : running ? <SquareIcon /> : <PlayIcon />}
            {/* In a narrow header the words drop and the icon stays, as Filter's do. */}
            <span className="@max-3xl:sr-only">{running ? "Stop swiping" : "Start swiping"}</span>
          </DashboardToolbarButton>
        }
        view={
          <SavedViewsControls
            here={here}
            views={views}
            filters={currentView}
            onOpen={(saved) => {
              const next = readLeadView(saved.filters)
              onView({ q: undefined, group: undefined, by: undefined, score: undefined, over: undefined, real: undefined, sort: undefined, direction: undefined, ...next, tab: view.tab })
            }}
            editFields={editViewFields}
            saveButton={false}
            buttonVariant="ghost"
          />
        }
      />
      {stopped && data.phone ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 border-b bg-destructive/10 px-4 py-2 text-sm">
          <TriangleAlertIcon className="size-4 shrink-0 text-destructive" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="font-medium">{stopReasonWords(stopped, data.profile.app)}.</span> Nothing runs for this profile until you sort it out on the phone and press Resume.
          </span>
          {data.phone.stoppedPictureId ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                onOpenPicture({ id: data.phone?.stoppedPictureId as string, title: `What ${appName} showed`, description: stopReasonWords(stopped, data.profile.app) })
              }
            >
              See what {appName} showed
            </Button>
          ) : null}
          <Button type="button" size="sm" disabled={busy === "resume"} onClick={onResume}>
            {busy === "resume" ? <Loader2Icon className="animate-spin" /> : <PlayIcon />}
            Resume
          </Button>
        </div>
      ) : null}
      <DatesSplit month={view.tab === "dates" ? <DatesMonth leads={data.leads} onOpen={onOpen} /> : null}>
        <div
          className="flex h-full min-h-0 flex-1 flex-col"
          onPointerOver={(event) => prefetchFrom(event.target)}
          onFocusCapture={(event) => prefetchFrom(event.target)}
        >
          <CrmTable
            columns={columns}
            sort={sort}
            direction={direction}
            onSort={toggleSort}
            select={
              massSelect
                ? {
                    noun: "leads",
                    disabled: visibleIds.length === 0,
                    checked: selection.selectAllState(visibleIds),
                    onToggle: () => selection.toggleVisible(visibleIds),
                  }
                : null
            }
            empty={leads.length ? undefined : <EmptyWords data={data} view={view} onView={onView} />}
          >
            {grouped
              ? groups.map((entry) => (
                  <React.Fragment key={entry.group}>
                    <CrmGroupRow
                      label={LEAD_GROUP_WORDS[entry.group]}
                      count={entry.rows.length}
                      folded={folded.has(entry.group)}
                      onToggle={() => toggleFold(entry.group)}
                    />
                    {folded.has(entry.group) ? null : entry.rows.map(row)}
                  </React.Fragment>
                ))
              : leads.map(row)}
          </CrmTable>
        </div>
      </DatesSplit>
      {rightClick && rightClickLead ? (
        <CrmRowMenu
          key={`${rightClick.id}-${rightClick.x}-${rightClick.y}`}
          at={rightClick}
          massSelect={{ on: massSelect, onToggle: () => toggleMassSelect(massSelect ? undefined : rightClick.id) }}
          items={rowMenuItems(rightClickLead)}
          onClose={() => setRightClick(null)}
        />
      ) : null}
      <SaveViewDialog open={savingView} here={here} filters={currentView} onClose={() => setSavingView(false)} />
    </div>
  )
}

/** What the grey line under a name says: the chat's last line, or what happened to the card. */
function secondLine(lead: LeadListItem): string {
  // The date's day and time are in Needs, so the line holds the place.
  if (lead.status === "date") return lead.datePlace || lead.lastLine || "Said yes to a date"
  if (lead.matchId) return lead.lastLine || (lead.source === "weekly" ? "Weekly surprise match" : "No messages yet")
  if (lead.waiting === "decide") return "Met on another profile"
  if (lead.status === "new") return lead.source === "likes_you" ? "Liked you first" : "Not swiped yet"
  return `Read ${whenWords(lead.changedAt)}`
}

/** What the list says with no rows, with the button that brings rows back where one does. */
function EmptyWords({ data, view, onView }: { data: DatingDashboard; view: LeadView; onView: (patch: Record<string, unknown>) => void }) {
  if (!data.leads.length) {
    return (
      <>
        {data.phone?.paired
          ? "No leads yet. Start swiping, at the top of this list, has the AI read cards and swipe by your rules."
          : "No leads yet. Press the Phone block on the left to pair a phone, or to add sample data to look around first."}
      </>
    )
  }
  if (view.q || leadFilterCount(view)) {
    return (
      <span className="grid justify-items-center gap-2">
        <span>{view.q ? `No lead matches "${view.q}".` : "No lead matches these filters."}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onView({ q: undefined, group: undefined, by: undefined, score: undefined, over: undefined, real: undefined })}
        >
          Clear filters
        </Button>
      </span>
    )
  }
  if (view.tab === "dates") return <>No dates yet. When someone says yes to the drink or coffee the AI offered, they show here.</>
  if (view.tab === "matches") return <>No matches yet.</>
  return (
    <span className="grid justify-items-center gap-2">
      <span>Every lead is over.</span>
      <Button type="button" variant="outline" size="sm" onClick={() => onView({ over: true })}>
        Show over
      </Button>
    </span>
  )
}

/** Filter's rows, also Edit view's: status, who swiped, the lowest score, Show over and No samples. */
function LeadFilterRows({ idPrefix, view, onChange }: { idPrefix: string; view: LeadView; onChange: (patch: Record<string, string | number | boolean | undefined>) => void }) {
  return (
    <>
      <FilterRow id={`${idPrefix}-group`} label="Status">
        <Select value={view.group ?? ANY} onValueChange={(next) => onChange({ group: next === ANY ? undefined : next })}>
          <SelectTrigger id={`${idPrefix}-group`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any</SelectItem>
            {LEAD_GROUPS.map((group) => (
              <SelectItem key={group} value={group}>
                {LEAD_GROUP_WORDS[group]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterRow>
      <FilterRow id={`${idPrefix}-by`} label="Swiped by">
        <Select value={view.by ?? ANY} onValueChange={(next) => onChange({ by: next === ANY ? undefined : next })}>
          <SelectTrigger id={`${idPrefix}-by`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Anybody</SelectItem>
            <SelectItem value="member">You</SelectItem>
            <SelectItem value="ai">The AI</SelectItem>
          </SelectContent>
        </Select>
      </FilterRow>
      <FilterRow id={`${idPrefix}-score`} label="Score">
        <Select value={view.score ? String(view.score) : ANY} onValueChange={(next) => onChange({ score: next === ANY ? undefined : Number(next) })}>
          <SelectTrigger id={`${idPrefix}-score`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any score</SelectItem>
            {LEAD_SCORE_FLOORS.map((floor) => (
              <SelectItem key={floor} value={String(floor)}>
                {floor} or more
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterRow>
      <FilterRow id={`${idPrefix}-over`} label="Show over">
        <Switch className="justify-self-start" id={`${idPrefix}-over`} checked={Boolean(view.over)} onCheckedChange={(on) => onChange({ over: on || undefined })} />
      </FilterRow>
      <FilterRow id={`${idPrefix}-real`} label="No samples">
        <Switch className="justify-self-start" id={`${idPrefix}-real`} checked={Boolean(view.real)} onCheckedChange={(on) => onChange({ real: on || undefined })} />
      </FilterRow>
    </>
  )
}

function FilterRow({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2">
      <Label htmlFor={id} className="text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}
