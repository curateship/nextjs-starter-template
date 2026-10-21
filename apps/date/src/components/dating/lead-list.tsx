import * as React from "react"
import { Loader2Icon, PlayIcon, TriangleAlertIcon } from "lucide-react"

import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { DashboardTabs } from "@/components/shared/dashboard-tabs"
import { FilterPopover } from "@/components/shared/filter-popover"
import { MassSelectChip, SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
import { SaveViewDialog, SavedViewsControls, type EditFields, type SavedViewsScreen } from "@/components/shared/saved-views"
import { SearchToggle } from "@/components/shared/search-toggle"
import { SortableTableHeader, SelectAllTableHead, type TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableRow, TableSortButton } from "@/components/ui/table"
import type { DatingDashboard } from "@/lib/api/dating/dashboard"
import type { SavedView } from "@/lib/api/saved-views"
import { DATING_SAVED_VIEW_KIND, describeLeadView } from "@/lib/dating/lead-views"
import {
  LEAD_GROUP_WORDS,
  LEAD_GROUPS,
  LEAD_OVER_WORDS,
  LEAD_SCORE_FLOORS,
  LEAD_STATUS_WORDS,
  defaultLeadDirection,
  leadFilterCount,
  readLeadView,
  shownLeads,
  type LeadListItem,
  type LeadSort,
  type LeadTab,
  type LeadView,
} from "@/lib/dating/leads"
import { STOP_REASON_WORDS } from "@/lib/dating/options"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSort, useSearchBoxText } from "@/lib/nav/list-search"
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

/**
 * The Dating dashboard's middle panel: every lead and its status (Tyler,
 * 20 Oct 2026). The header holds the All, Matches and Dates tabs, then the
 * "N selected" button while rows are ticked, the search, Filter and Views, as
 * Tyler's mock of 20 Oct 2026 draws it
 * (`workspace/docs/assets/pasted-image-1792550342758871000.png`). Each row
 * is the lead's letter, name and line, its status, what it needs from the
 * member, its score, who swiped and when it last changed. A red line across the top says when a Tinder screen stopped the
 * phone, with Resume. Leads waiting on the member come first unless a column
 * is sorted, and over leads stay out until Filter's Show over.
 *
 * The columns after Lead hide by the panel's own width. Pressing a row opens
 * the lead on the right. Mass select, beside the Lead heading, ticks chats
 * for Moved to text or Clear dead; cards cannot be swiped together, because
 * Tinder swipes only the card on the phone's screen.
 */
export function LeadList({
  data,
  leads,
  view,
  views,
  openId,
  busy,
  onView,
  onOpen,
  onResume,
  onOpenPicture,
  onMovedToText,
  onClearDead,
}: {
  data: DatingDashboard
  /** The leads to show, filtered and in order. */
  leads: LeadListItem[]
  view: LeadView
  views: SavedView[]
  openId: string | undefined
  busy: string | null
  onView: (patch: Record<string, unknown>) => void
  onOpen: (id: string) => void
  onResume: () => void
  onOpenPicture: (picture: { id: string; title: string; description?: string }) => void
  /** Resolves true once the ticked chats moved. */
  onMovedToText: (matchIds: string[]) => Promise<boolean>
  onClearDead: (ticked: LeadListItem[]) => void
}) {
  const [searchText, setSearchText] = useSearchBoxText(view.q ?? "", (text) => onView({ q: text.trim() ? text : undefined }))
  const sort: LeadSort = view.sort ?? "changed"
  const direction = view.direction ?? defaultLeadDirection(sort)
  const toggleSort = useListSort<LeadSort>({ sort, direction }, defaultLeadDirection)
  const [filterOpen, setFilterOpen] = React.useState(false)
  const [savingView, setSavingView] = React.useState(false)
  const here = React.useMemo(() => viewsHere(data.profile.id), [data.profile.id])

  const [massSelect, setMassSelect] = React.useState(false)
  const selection = useSelection()
  useClearSelectionOnListChange(selection.setSelected, JSON.stringify(view))
  const visibleIds = leads.map((lead) => lead.id)
  const ticked = leads.filter((lead) => selection.selected.has(lead.id))
  const tickedChats = ticked.filter((lead) => lead.matchId)

  const tabCount = (tab: LeadTab) => shownLeads(data.leads, { ...view, tab: tab === "all" ? undefined : tab, q: undefined }).length
  const filters = readLeadView({ ...view, tab: undefined, q: undefined, sort: undefined, direction: undefined })
  const currentView = readLeadView(view) as SavedViewValues

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
    {
      key: "name",
      sortable: false,
      column: "main",
      // The preset 320px minimum is for a full page; this table sits in a panel.
      className: "group/title min-w-40",
      label: (
        <span className="flex items-center gap-2">
          <TableSortButton active={sort === "name"} direction={direction} onClick={() => toggleSort("name")}>
            Lead
          </TableSortButton>
          <MassSelectChip
            on={massSelect}
            onToggle={() => {
              if (massSelect) selection.clear()
              setMassSelect(!massSelect)
            }}
          />
        </span>
      ),
    },
    { key: "status", label: "Status", sortable: false, column: "meta", className: "hidden @md/list:table-cell" },
    { key: "needs", label: "Needs", sortable: false, column: "meta", className: "hidden @xl/list:table-cell" },
    { key: "score", label: "Score", column: "meta", className: "hidden text-right @lg/list:table-cell" },
    { key: "by", label: "Swiped by", sortable: false, column: "meta", className: "hidden @3xl/list:table-cell" },
    { key: "changed", label: "Last change", column: "meta", className: "hidden text-right @2xl/list:table-cell" },
  ]

  const stopped = data.phone?.paired ? data.phone.stoppedReason : null

  return (
    <div className="@container/list flex min-h-0 flex-1 flex-col">
      <DashboardCardHeader className="@container">
        <DashboardTabs
          value={view.tab ?? "all"}
          onValueChange={(next) => onView({ tab: next === "all" ? undefined : next })}
          tabs={[
            { value: "all", label: "All", count: tabCount("all") },
            { value: "matches", label: "Matches", count: tabCount("matches") },
            { value: "dates", label: "Dates", count: tabCount("dates") },
          ]}
        />
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {massSelect && ticked.length ? (
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
                  <>
                    <p className="px-2 py-1.5 text-sm text-muted-foreground">
                      None of these is a chat. Cards are swiped one at a time, because Tinder swipes only the card on the phone's screen.
                    </p>
                  </>
                )
              }
              pages={{}}
            />
          ) : null}
          <SearchToggle name="lead-search" label="Search leads" placeholder="Search names and lines" value={searchText} onChange={setSearchText} />
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
          <SavedViewsControls
            here={here}
            views={views}
            filters={currentView}
            onOpen={(saved) => {
              const next = readLeadView(saved.filters)
              onView({ tab: undefined, q: undefined, group: undefined, by: undefined, score: undefined, over: undefined, real: undefined, sort: undefined, direction: undefined, ...next })
            }}
            editFields={editViewFields}
            saveButton={false}
            buttonVariant="ghost"
          />
        </div>
      </DashboardCardHeader>
      {stopped && data.phone ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 border-b bg-destructive/10 px-3 py-2 text-sm">
          <TriangleAlertIcon className="size-4 shrink-0 text-destructive" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="font-medium">{STOP_REASON_WORDS[stopped]}.</span> Nothing runs on the phone until you sort it out there and press Resume.
          </span>
          {data.phone.stoppedPictureId ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenPicture({ id: data.phone?.stoppedPictureId as string, title: "What Tinder showed", description: STOP_REASON_WORDS[stopped] })}
            >
              See what Tinder showed
            </Button>
          ) : null}
          <Button type="button" size="sm" disabled={busy === "resume"} onClick={onResume}>
            {busy === "resume" ? <Loader2Icon className="animate-spin" /> : <PlayIcon />}
            Resume
          </Button>
        </div>
      ) : null}
      <DatesSplit month={view.tab === "dates" ? <DatesMonth leads={data.leads} onOpen={onOpen} /> : null}>
        <ScrollArea className="h-full min-h-0 flex-1" viewportClassName="h-full">
          <Table
            containerClassName="overflow-visible"
            className="[&_td]:py-3 [&_td:first-child]:pl-4 [&_td:last-child]:pr-3 [&_th:first-child]:pl-4 [&_th:last-child]:pr-3"
          >
            <SortableTableHeader
              columns={columns}
              sort={sort}
              direction={direction}
              onSort={toggleSort}
              leading={
                massSelect ? (
                  <SelectAllTableHead
                    noun="leads"
                    disabled={visibleIds.length === 0}
                    checked={selection.selectAllState(visibleIds)}
                    onCheckedChange={() => selection.toggleVisible(visibleIds)}
                  />
                ) : null
              }
            />
            <TableBody>
              {leads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length + 1} className="py-10 text-center text-sm whitespace-normal text-muted-foreground">
                    <EmptyWords data={data} view={view} />
                  </TableCell>
                </TableRow>
              ) : (
                leads.map((lead) => (
                  <TableRow
                    key={lead.id}
                    className={cn("group", lead.id === openId && "bg-muted/60 [&>td:first-child]:shadow-[inset_2px_0_0_0_var(--foreground)]")}
                    rowAction={() => onOpen(lead.id)}
                  >
                    {massSelect ? (
                      <TableCell column="select">
                        <Checkbox checked={selection.selected.has(lead.id)} onCheckedChange={() => selection.toggle(lead.id)} aria-label={`Select ${lead.name}`} />
                      </TableCell>
                    ) : null}
                    <TableCell column="main" className="min-w-40">
                      <div className="flex min-w-0 items-center gap-3">
                        <LeadAvatar name={lead.name} />
                        <div className="grid min-w-0 gap-0.5">
                          <span className="flex min-w-0 items-center gap-1.5">
                            {/* The same action the row carries, so it is reachable by keyboard. */}
                            <button type="button" className="min-w-0 truncate text-left font-medium group-hover:underline" onClick={() => onOpen(lead.id)}>
                              {nameAndAge(lead.name, lead.age)}
                            </button>
                            {lead.unreadCount ? (
                              <span
                                className="size-1.5 shrink-0 rounded-full bg-foreground"
                                role="img"
                                aria-label={`${lead.unreadCount} unread`}
                              />
                            ) : null}
                          </span>
                          <span className="truncate text-sm text-muted-foreground">
                            {/* The status under the name once its own column has gone. */}
                            <span className="@md/list:hidden">{LEAD_STATUS_WORDS[lead.status]} · </span>
                            {lead.overWhy ? `${LEAD_OVER_WORDS[lead.overWhy]} · ` : ""}
                            {secondLine(lead)}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell column="meta" className="hidden @md/list:table-cell">
                      <StatusPill status={lead.status} />
                    </TableCell>
                    <TableCell column="meta" className="hidden @xl/list:table-cell">
                      <NeedsBadge lead={lead} />
                    </TableCell>
                    <TableCell
                      column="meta"
                      className={cn("hidden text-right font-semibold tabular-nums @lg/list:table-cell", (lead.status === "passed" || lead.status === "over") && "font-normal text-muted-foreground")}
                    >
                      {lead.score ?? <span className="font-normal text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell column="mutedMeta" className="hidden @3xl/list:table-cell">
                      {lead.swipedBy === "ai" ? "The AI" : lead.swipedBy === "member" ? "You" : "Nobody yet"}
                    </TableCell>
                    <TableCell column="mutedMeta" className="hidden text-right whitespace-nowrap @2xl/list:table-cell">
                      {whenWords(lead.changedAt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </DatesSplit>
      <SaveViewDialog open={savingView} here={here} filters={currentView} onClose={() => setSavingView(false)} />
    </div>
  )
}

/** What the grey line under a name says: the chat's last line, or what happened to the card. */
function secondLine(lead: LeadListItem): string {
  // The date's day and time are in Needs, so the line holds the place.
  if (lead.status === "date") return lead.datePlace || lead.lastLine || "Said yes to a date"
  if (lead.matchId) return lead.lastLine || "No messages yet"
  return lead.status === "new" ? "Not swiped yet" : `Read ${whenWords(lead.changedAt)}`
}

function EmptyWords({ data, view }: { data: DatingDashboard; view: LeadView }) {
  if (!data.leads.length) {
    return data.phone?.paired
      ? "No leads yet. Start, in the left panel, has the AI read cards and swipe by your rules."
      : "No leads yet. Press Pair one, on the left, to pair a phone or to add sample data to look around first."
  }
  if (view.q || leadFilterCount(view)) return "No lead matches that."
  if (view.tab === "dates") return "No dates yet. When someone says yes to the drink or coffee the AI offered, they show here."
  if (view.tab === "matches") return "No matches yet."
  return "Every lead is over. Filter's Show over brings them back."
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
