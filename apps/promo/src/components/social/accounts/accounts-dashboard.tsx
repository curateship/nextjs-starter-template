import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowRightLeftIcon,
  BanIcon,
  EyeIcon,
  EyeOffIcon,
  HandHelpingIcon,
  Loader2Icon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  SettingsIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "lucide-react"
import { toast } from "sonner"

import { ProxyTestBadge } from "@/components/browser/proxy-test-badge"
import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/shared/dashboard-toolbar"
import {
  SelectAllTableHead,
  SortableTableHeader,
  type TableHeaderColumn,
} from "@/components/shared/sortable-table-header"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import {
  checkRedditAccounts,
  getRedditAccountsErrorMessage,
  loadRedditAccounts,
  pauseRedditAccounts,
  retireRedditAccounts,
  setRedditAccountVoice,
  setRedditAccountsStatus,
  type BulkAnswer,
  type RedditAccountRow,
  type RedditAccountsPage,
} from "@/lib/api/social/reddit-accounts"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { formatTimeAgo } from "@/lib/format/format-time"
import { useSelection } from "@/lib/hooks/use-selection"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import {
  ACCOUNT_STATUSES,
  ACCOUNT_STATUS_LABELS,
  type AccountStatus,
} from "@/lib/social/account-status"
import { ACCOUNT_IMPORTANCE, IMPORTANCE_WORDS } from "@/lib/social/importance"
import { handleWords, isNetwork, NETWORK_NAMES, NETWORKS, type Network } from "@/lib/social/networks"
import { countWords } from "@/lib/social/phone-apps"
import { accountAgeText, postedDateText } from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"

import { Hint } from "../hint"
import { AccountStatusBadge } from "./account-status-badge"
import { AddAccountDialog } from "./add-account-dialog"
import { HelpPostsDialog } from "./help-posts-dialog"
import { AccountSettingsDialog } from "./account-settings-dialog"
import { MediumSignInButton } from "../medium/medium-sign-in-button"

type SortColumn = "account" | "status" | "project" | "profile" | "age" | "karma" | "last"

const COLUMNS: TableHeaderColumn<SortColumn>[] = [
  { key: "account", label: "Account", column: "main" },
  { key: "status", label: "Status", column: "meta" },
  { key: "project", label: "Project", column: "meta", className: "hidden lg:table-cell" },
  { key: "profile", label: "Runs on", column: "meta", className: "hidden md:table-cell" },
  { key: "proxy", label: "Proxy", column: "meta", className: "hidden lg:table-cell", sortable: false },
  { key: "voice", label: "Voice", column: "meta", className: "hidden xl:table-cell", sortable: false },
  // Under 1536px these three fold into a line under the account's name, or
  // the row is wider than the window and its buttons go off the edge.
  { key: "age", label: "Age", column: "meta", className: "hidden 2xl:table-cell" },
  // Karma on Reddit, followers on Instagram and TikTok.
  { key: "karma", label: "Karma or followers", column: "meta", className: "hidden 2xl:table-cell text-right" },
  { key: "last", label: "Last comment or post", column: "meta", className: "hidden 2xl:table-cell" },
]

/** Status order when sorting: the four in Tyler's order, then never read. */
const STATUS_ORDER: Record<AccountStatus, number> = { warming_up: 0, ready: 1, working: 2, banned: 3 }

const time = (value: Date | null) => (value ? new Date(value).getTime() : Number.NEGATIVE_INFINITY)

function compare(a: RedditAccountRow, b: RedditAccountRow, column: SortColumn): number {
  switch (column) {
    case "status":
      return (a.status.status ? STATUS_ORDER[a.status.status] : 4) - (b.status.status ? STATUS_ORDER[b.status.status] : 4)
    case "project":
      return (a.project?.name ?? "").localeCompare(b.project?.name ?? "")
    case "profile":
      return (a.profile?.name ?? a.phone?.name ?? "").localeCompare(b.profile?.name ?? b.phone?.name ?? "")
    // Older first when sorting up, so an account made earlier sorts above.
    case "age":
      return time(b.redditCreatedAt) - time(a.redditCreatedAt)
    case "karma":
      return (a.karma ?? a.followers ?? Number.NEGATIVE_INFINITY) - (b.karma ?? b.followers ?? Number.NEGATIVE_INFINITY)
    case "last":
      return time(a.lastPostedAt) - time(b.lastPostedAt)
    default:
      return (a.handle || "~").localeCompare(b.handle || "~")
  }
}

const ALL = "all"
/** The bulk status menu's value for "let the app decide". */
const APP_DECIDES = "app"
/** The voice menu's value for "no voice". */
const NO_VOICE = "none"

/** A network's name, or the stored word for one Promo no longer offers. */
function platformName(platform: string): string {
  return isNetwork(platform) ? NETWORK_NAMES[platform] : platform
}

/**
 * Every account, on every platform: its status, the project it comments for,
 * the browser profile or phone it runs on and how that goes online. Tyler, 15
 * Oct 2026: "I think accounts should be on its own dashboard with platform
 * filtering". The Platform filter is the address's `?platform=`, which Manage
 * accounts in a project's Comment as dropdown sets to Reddit, and each row
 * names its platform beside the account.
 *
 * Copied from the Comments dashboard and built from the shell's table. The
 * status is worked out by the app each time the list is read (Warming up,
 * Ready, Working, Banned) and a person can set another by hand, which the row
 * says. Rows group under their profile's or phone's folder, the folders the
 * Browser profiles and Phones dashboards share, and filter by its tags;
 * nothing new is stored for either.
 *
 * Retiring takes an account out of every list and picker. It never posts and
 * never warms up again, and its comments stay. "Show retired" brings the
 * retired ones back into the list, with Bring back on each.
 */
export function RedditAccountsDashboard({
  initial,
  platform,
  onPlatformChange,
}: {
  initial: RedditAccountsPage
  /** The platform filtered to, read from the address, or null for every one. */
  platform: Network | null
  /** Puts a platform in the address, or null for every one. */
  onPlatformChange: (platform: Network | null) => void
}) {
  const [page, setPage] = React.useState(initial)
  // The address holds the filter, so a link to the page, a reload or the left
  // menu's own link always shows what the address says.
  const platformFilter: string = platform ?? ALL
  const [showRetired, setShowRetired] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<string>(ALL)
  const [tagFilter, setTagFilter] = React.useState(ALL)
  const [kindFilter, setKindFilter] = React.useState<string>(ALL)
  const { sort, direction, toggleSort } = useTableSort<SortColumn>("account")
  const selection = useSelection()
  const [busy, setBusy] = React.useState(false)
  const [rowBusy, setRowBusy] = React.useState<string | null>(null)
  const [adding, setAdding] = React.useState(false)
  /** The account whose help-only posts are open. */
  const [helpFor, setHelpFor] = React.useState<string | null>(null)
  /** The account whose "Runs on" window is open. */
  const [runsOnFor, setRunsOnFor] = React.useState<RedditAccountRow | null>(null)

  const refresh = React.useCallback(
    (retired: boolean): Promise<void> =>
      loadRedditAccounts(retired).then(
        (next) => {
          setPage(next)
          setError(null)
        },
        (failure: unknown) => setError(getRedditAccountsErrorMessage(failure))
      ),
    []
  )

  const accounts = page.accounts
  const tags = React.useMemo(
    () =>
      Array.from(new Set(accounts.flatMap((row) => row.profile?.tags ?? row.phone?.tags ?? []))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [accounts]
  )

  const shown = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    const factor = direction === "asc" ? 1 : -1
    return accounts
      .filter((row) => {
        if (platformFilter !== ALL && row.platform !== platformFilter) return false
        if (statusFilter !== ALL && row.status.status !== statusFilter) return false
        if (kindFilter !== ALL && row.importance !== kindFilter) return false
        if (tagFilter !== ALL && !(row.profile?.tags ?? row.phone?.tags ?? []).includes(tagFilter)) return false
        if (!query) return true
        return [row.handle, row.project?.name, row.profile?.name, row.phone?.name, row.voice?.name]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query))
      })
      .sort((a, b) => factor * compare(a, b, sort))
  }, [accounts, direction, kindFilter, platformFilter, search, sort, statusFilter, tagFilter])

  /**
   * The rows under their profile's or phone's folder, folders by name and "No folder"
   * last. With no folder anywhere there is one group and no heading.
   */
  const groups = React.useMemo(() => {
    const byFolder = new Map<string, { name: string | null; rows: RedditAccountRow[] }>()
    for (const row of shown) {
      const folder = row.profile?.folder ?? row.phone?.folder ?? null
      const key = folder?.id ?? ""
      const group = byFolder.get(key) ?? { name: folder?.name ?? null, rows: [] }
      group.rows.push(row)
      byFolder.set(key, group)
    }
    return [...byFolder.values()].sort((a, b) =>
      a.name === null ? 1 : b.name === null ? -1 : a.name.localeCompare(b.name)
    )
  }, [shown])
  const headings = groups.some((group) => group.name !== null)

  const visibleIds = shown.map((row) => row.id)
  const selectedIds = Array.from(selection.selected).filter((id) => visibleIds.includes(id))
  const columnCount = COLUMNS.length + 2

  /** Runs one action over the ticked rows and says what it did, in one line. */
  async function bulk(run: () => Promise<BulkAnswer>, verb: string, keptReason?: string) {
    setBusy(true)
    try {
      const answer = await run()
      toast.success(
        describeBulkResult({
          done: answer.completed.length,
          kept: answer.skipped.length,
          one: "account",
          many: "accounts",
          verb,
          keptReason,
        })
      )
      selection.clear()
      await refresh(showRetired)
    } catch (failure) {
      showErrorToast(getRedditAccountsErrorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  async function oneRow(id: string, run: () => Promise<unknown>, success: string) {
    setRowBusy(id)
    try {
      await run()
      toast.success(success)
      await refresh(showRetired)
    } catch (failure) {
      showErrorToast(getRedditAccountsErrorMessage(failure))
    } finally {
      setRowBusy(null)
    }
  }

  return (
    <>
      <DashboardTable
        title="Accounts"
        icon={<UsersIcon />}
        count={shown.length}
        error={error ? { message: error, onRetry: () => void refresh(showRetired) } : null}
        selectedCount={selectedIds.length}
        onClearSelection={selection.clear}
        controls={
          <>
            {selectedIds.length ? (
              <>
                <Select
                  value=""
                  disabled={busy}
                  onValueChange={(value) => {
                    const status = value === APP_DECIDES ? null : (value as AccountStatus)
                    void bulk(
                      () => setRedditAccountsStatus(selectedIds, status),
                      status ? `set to ${ACCOUNT_STATUS_LABELS[status]}` : "left for the app to decide"
                    )
                  }}
                >
                  <DashboardToolbarSelectTrigger aria-label="Set the ticked accounts' status">
                    <SelectValue placeholder="Set status" />
                  </DashboardToolbarSelectTrigger>
                  <SelectContent>
                    {ACCOUNT_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {ACCOUNT_STATUS_LABELS[status]}
                      </SelectItem>
                    ))}
                    <SelectItem value={APP_DECIDES}>Let the app decide</SelectItem>
                  </SelectContent>
                </Select>
                <DashboardToolbarButton
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void bulk(
                      () => checkRedditAccounts(selectedIds),
                      "queued to be checked",
                      "already being checked, or retired"
                    )
                  }
                >
                  <RefreshCwIcon className="size-4" />
                  Check now
                </DashboardToolbarButton>
                <DashboardToolbarButton
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void bulk(() => pauseRedditAccounts(selectedIds, true), "paused", "retired")
                  }
                >
                  <PauseIcon className="size-4" />
                  Pause
                </DashboardToolbarButton>
                <DashboardToolbarButton
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void bulk(() => pauseRedditAccounts(selectedIds, false), "resumed", "retired")
                  }
                >
                  <PlayIcon className="size-4" />
                  Resume
                </DashboardToolbarButton>
                {showRetired ? (
                  <DashboardToolbarButton
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void bulk(() => retireRedditAccounts(selectedIds, false), "brought back", "not retired")
                    }
                  >
                    <ArchiveRestoreIcon className="size-4" />
                    Bring back
                  </DashboardToolbarButton>
                ) : null}
                <DashboardToolbarButton
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void bulk(() => retireRedditAccounts(selectedIds, true), "retired", "already retired")
                  }
                >
                  <ArchiveIcon className="size-4" />
                  Retire ({selectedIds.length})
                </DashboardToolbarButton>
              </>
            ) : null}
            <DashboardToolbarSearch
              name="reddit-account-search"
              aria-label="Search accounts"
              placeholder="Search accounts…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Select
              value={platformFilter}
              onValueChange={(value) => onPlatformChange(isNetwork(value) ? value : null)}
            >
              <DashboardToolbarSelectTrigger aria-label="Filter by platform" className="hidden sm:flex">
                <SelectValue />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All platforms</SelectItem>
                {NETWORKS.map((network) => (
                  <SelectItem key={network} value={network}>
                    {NETWORK_NAMES[network]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <DashboardToolbarSelectTrigger aria-label="Filter by status" className="hidden sm:flex">
                <SelectValue />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                {ACCOUNT_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {ACCOUNT_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={kindFilter} onValueChange={setKindFilter}>
              <DashboardToolbarSelectTrigger aria-label="Filter by important or throwaway" className="hidden sm:flex">
                <SelectValue />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Important and throwaway</SelectItem>
                {ACCOUNT_IMPORTANCE.map((importance) => (
                  <SelectItem key={importance} value={importance}>
                    {IMPORTANCE_WORDS[importance]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {tags.length ? (
              <Select value={tagFilter} onValueChange={setTagFilter}>
                <DashboardToolbarSelectTrigger aria-label="Filter by tag" className="hidden sm:flex">
                  <SelectValue />
                </DashboardToolbarSelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All tags</SelectItem>
                  {tags.map((tag) => (
                    <SelectItem key={tag} value={tag}>
                      {tag}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <span className="flex h-8 items-center gap-2">
              <Switch
                id="reddit-accounts-retired"
                checked={showRetired}
                onCheckedChange={(checked) => {
                  setShowRetired(checked)
                  selection.clear()
                  void refresh(checked)
                }}
              />
              <Label htmlFor="reddit-accounts-retired" className="text-sm font-normal whitespace-nowrap">
                Show retired
              </Label>
            </span>
            <DashboardToolbarButton type="button" onClick={() => setAdding(true)}>
              <PlusIcon className="size-4" />
              Add account
            </DashboardToolbarButton>
          </>
        }
        header={
          <SortableTableHeader
            columns={COLUMNS}
            sort={sort}
            direction={direction}
            onSort={toggleSort}
            leading={
              <SelectAllTableHead
                noun="accounts"
                checked={selection.selectAllState(visibleIds)}
                onCheckedChange={() => selection.toggleVisible(visibleIds)}
              />
            }
            trailing={<TableHead column="meta">Actions</TableHead>}
          />
        }
        isEmpty={shown.length === 0}
        emptyText={
          accounts.length
            ? "No accounts match that."
            : "No accounts yet. Press Add account, pick the network and where it runs, then sign in there."
        }
        emptyColSpan={columnCount}
        footer={{ type: "summary", count: shown.length, label: "accounts" }}
      >
        <>
          {groups.map((group) => (
            <React.Fragment key={group.name ?? ""}>
              {headings ? (
                <TableRow className="hover:bg-muted/50">
                  <TableCell colSpan={columnCount} className="bg-muted/50 py-1.5 text-xs font-medium">
                    {group.name ?? "No folder"}
                    <span className="ml-2 font-normal text-muted-foreground">{group.rows.length}</span>
                  </TableCell>
                </TableRow>
              ) : null}
              {group.rows.map((row) => (
                <AccountRow
                  key={row.id}
                  row={row}
                  voices={page.voices}
                  ticked={selection.selected.has(row.id)}
                  busy={rowBusy === row.id}
                  onTick={() => selection.toggle(row.id)}
                  onVoice={(voiceId) =>
                    void oneRow(
                      row.id,
                      () => setRedditAccountVoice(row.id, voiceId),
                      voiceId ? "Voice changed." : "No voice now. Drafts are plain."
                    )
                  }
                  onCheck={() =>
                    void oneRow(
                      row.id,
                      () => checkRedditAccounts([row.id]),
                      "Queued to be checked."
                    )
                  }
                  onHelp={() => setHelpFor(row.id)}
                  onRunsOn={() => setRunsOnFor(row)}
                  onPause={(paused) =>
                    void oneRow(
                      row.id,
                      () => pauseRedditAccounts([row.id], paused),
                      paused
                        ? "Paused. It does not post, warm up or take readings until you resume it."
                        : "Resumed."
                    )
                  }
                  onRetire={(retire) =>
                    void oneRow(
                      row.id,
                      () => retireRedditAccounts([row.id], retire),
                      retire ? "Retired. Its comments stay." : "Brought back."
                    )
                  }
                />
              ))}
            </React.Fragment>
          ))}
        </>
      </DashboardTable>
      <HelpPostsDialog accountId={helpFor} onClose={() => setHelpFor(null)} />
      <AccountSettingsDialog
        key={runsOnFor?.id ?? "closed"}
        account={runsOnFor ? (accounts.find((row) => row.id === runsOnFor.id) ?? runsOnFor) : null}
        profiles={runsOnFor && isNetwork(runsOnFor.platform) ? page.freeProfiles[runsOnFor.platform] : page.freeProfiles.reddit}
        phones={runsOnFor && isNetwork(runsOnFor.platform) ? page.freePhones[runsOnFor.platform] : page.freePhones.reddit}
        onClose={() => setRunsOnFor(null)}
        onSaved={async () => {
          setRunsOnFor(null)
          await refresh(showRetired)
        }}
        onChanged={() => refresh(showRetired)}
      />
      <AddAccountDialog
        // Opened again on another network's filter, it starts on that network.
        key={platform ?? ALL}
        open={adding}
        initialPlatform={platform ?? "reddit"}
        profiles={page.freeProfiles}
        phones={page.freePhones}
        voices={page.voices}
        onClose={() => setAdding(false)}
        onAdded={async () => {
          setAdding(false)
          await refresh(showRetired)
        }}
      />
    </>
  )
}

function AccountRow({
  row,
  voices,
  ticked,
  busy,
  onTick,
  onVoice,
  onCheck,
  onHelp,
  onRunsOn,
  onPause,
  onRetire,
}: {
  row: RedditAccountRow
  voices: RedditAccountsPage["voices"]
  ticked: boolean
  busy: boolean
  onTick: () => void
  onVoice: (voiceId: string | null) => void
  onCheck: () => void
  /** Opens the account's help-only posts. */
  onHelp: () => void
  /** Opens the window that moves it to another profile or phone. */
  onRunsOn: () => void
  onPause: (paused: boolean) => void
  onRetire: (retire: boolean) => void
}) {
  const reddit = row.platform === "reddit"
  const medium = row.platform === "medium"
  const name = row.handle ? handleWords(row.platform, row.handle) : "Not signed in"
  const lastWord = reddit ? "comment" : medium ? "response or article" : "post"
  // Instagram and TikTok show no account age; their reading is followers and
  // posts. Medium's is when it joined and its followers.
  const age = reddit
    ? row.redditCreatedAt
      ? accountAgeText(new Date(row.redditCreatedAt))
      : "Age not read yet"
    : medium
      ? row.mediumJoinedAt
        ? `${accountAgeText(new Date(row.mediumJoinedAt))} on Medium`
        : "Joined date not read yet"
      : row.postCount === null
      ? "posts not read yet"
      : `${countWords(row.postCount)} posts`
  const karma = reddit
    ? row.karma === null
      ? "karma not read yet"
      : `${row.karma} karma`
    : row.followers === null
      ? "followers not read yet"
      : `${countWords(row.followers)} followers`
  const lastComment = row.lastPostedAt
    ? `last ${lastWord} ${postedDateText(new Date(row.lastPostedAt)).toLowerCase()}`
    : `no ${lastWord} yet`
  return (
    <TableRow className="group">
      <TableCell column="select">
        <Checkbox checked={ticked} onCheckedChange={onTick} aria-label={`Select ${name}`} />
      </TableCell>
      <TableCell column="main" className="max-w-0">
        <span className={row.handle ? "block truncate text-sm font-medium" : "block truncate text-sm text-muted-foreground"}>
          {name}
          <span className="font-normal text-muted-foreground"> · {platformName(row.platform)}</span>
        </span>
        <span className="block truncate text-xs text-muted-foreground 2xl:hidden">
          {[age, karma, lastComment].join(" · ")}
        </span>
        {row.retiredAt ? (
          <span className="block truncate text-xs text-muted-foreground">
            Retired {formatTimeAgo(row.retiredAt)}
          </span>
        ) : null}
      </TableCell>
      <TableCell column="meta">
        <span className="grid gap-0.5">
          <AccountStatusBadge view={row.status} />
          {row.status.byHand ? <span className="text-xs text-muted-foreground">Set by hand</span> : null}
          {row.paused ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <PauseIcon className="size-3" aria-hidden="true" />
              {row.paused === "account" ? "Paused" : row.paused === "network" ? "Network paused" : "Project paused"}
            </span>
          ) : null}
          {row.importance === "important" ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <ShieldCheckIcon className="size-3" aria-hidden="true" />
              Important
            </span>
          ) : null}
          {row.move ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <ArrowRightLeftIcon className="size-3" aria-hidden="true" />
              Moving to {row.move.phone.name}
            </span>
          ) : null}
          {row.banScreen ? (
            <Hint label={row.banScreen.words}>
              <span className="flex items-center gap-1 text-xs text-destructive">
                <BanIcon className="size-3" aria-hidden="true" />
                Stopped by a ban screen
              </span>
            </Hint>
          ) : null}
          {row.shadowbanned === false ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <EyeIcon className="size-3" aria-hidden="true" />
              Not shadowbanned
            </span>
          ) : null}
          {row.shadowbanned ? (
            <Hint label={row.shadowbanWords || "The app's Account status page says its posts are hidden from people who do not follow it."}>
              <span className="flex items-center gap-1 text-xs text-destructive">
                <EyeOffIcon className="size-3" aria-hidden="true" />
                Shadowbanned
              </span>
            </Hint>
          ) : row.status.warning ? (
            <Hint label={row.status.warning}>
              <span className="block max-w-48 truncate text-xs text-amber-600 dark:text-amber-400">
                {row.status.warning}
              </span>
            </Hint>
          ) : null}
        </span>
      </TableCell>
      <TableCell column="meta" className="hidden max-w-40 lg:table-cell">
        {row.project ? (
          <Link
            to="/admin/projects/$projectId"
            params={{ projectId: row.project.id }}
            className="block truncate hover:underline"
          >
            {row.project.name}
          </Link>
        ) : (
          <span className="text-muted-foreground">No project</span>
        )}
      </TableCell>
      <TableCell column="meta" className="hidden max-w-40 md:table-cell">
        {row.profile ? (
          <Link
            to="/admin/profiles"
            search={{ open: row.profile.id }}
            className="block truncate hover:underline"
          >
            {row.profile.name}
          </Link>
        ) : row.phone ? (
          <Link
            to="/admin/phones"
            search={{ open: row.phone.id }}
            className="block truncate hover:underline"
          >
            Phone: {row.phone.name}
          </Link>
        ) : (
          <span className="text-destructive">Nowhere</span>
        )}
      </TableCell>
      <TableCell column="meta" className="hidden lg:table-cell">
        {!row.profile && !row.phone ? (
          <span className="text-muted-foreground">—</span>
        ) : row.phone?.connection === "sim" ? (
          <span className="block max-w-32 truncate">{row.phone.simCarrier || "Its own SIM"}</span>
        ) : row.proxy ? (
          <span className="flex items-center gap-2">
            <Hint label={row.proxy.label}>
              <span className="max-w-32 truncate">{row.proxy.label || "A proxy with no name"}</span>
            </Hint>
            <ProxyTestBadge result={row.proxy.lastTestResult} compact />
          </span>
        ) : (
          <span className="text-muted-foreground">{row.phone ? "House Wi-Fi" : "No proxy"}</span>
        )}
      </TableCell>
      <TableCell column="meta" className="hidden xl:table-cell">
        <Select
          value={row.voice?.id ?? NO_VOICE}
          disabled={busy}
          onValueChange={(value) => onVoice(value === NO_VOICE ? null : value)}
        >
          <SelectTrigger aria-label={`Voice for ${name}`} className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_VOICE}>No voice</SelectItem>
            {voices.map((voice) => (
              <SelectItem key={voice.id} value={voice.id}>
                {voice.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell column="meta" className="hidden text-muted-foreground 2xl:table-cell">
        {reddit ? (row.redditCreatedAt ? accountAgeText(new Date(row.redditCreatedAt)) : "Not read yet") : age}
      </TableCell>
      <TableCell column="meta" className="hidden text-right tabular-nums 2xl:table-cell">
        {(reddit ? row.karma : row.followers) === null ? (
          <Hint label="Not read yet">
            <span className="text-muted-foreground">-</span>
          </Hint>
        ) : reddit ? (
          row.karma
        ) : (
          <Hint label={`${row.following === null ? "Following not read" : `Following ${countWords(row.following)}`}`}>
            <span>{countWords(row.followers)} followers</span>
          </Hint>
        )}
      </TableCell>
      <TableCell column="meta" className="hidden text-muted-foreground 2xl:table-cell">
        {row.lastPostedAt ? postedDateText(new Date(row.lastPostedAt)) : "Never"}
      </TableCell>
      <TableCell column="actions">
        {row.retiredAt ? (
          <Hint label="Bring it back">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={busy}
              onClick={() => onRetire(false)}
              aria-label={`Bring ${name} back`}
            >
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : <ArchiveRestoreIcon className="size-4" />}
            </Button>
          </Hint>
        ) : (
          <>
            <Hint
              label={
                reddit
                  ? "Check now: read its karma, age and profile again"
                  : medium
                    ? "Check now: read who is signed in, when it joined Medium and its followers"
                    : "Check now: read its followers, posts and Account status page again"
              }
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={busy}
                onClick={onCheck}
                aria-label={`Check ${name} now`}
              >
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : <RefreshCwIcon className="size-4" />}
              </Button>
            </Hint>
            {medium && row.profile ? <MediumSignInButton accountId={row.id} name={name} /> : null}
            {reddit ? (
              <Hint label="Help-only posts: answer posts in its own subreddits, never mentioning what you make">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onHelp}
                  aria-label={`Help-only posts for ${name}`}
                >
                  <HandHelpingIcon className="size-4" />
                </Button>
              </Hint>
            ) : null}
            {/* A paused project's accounts are resumed from the project, so
                the row offers Resume only when the account itself is paused. */}
            <Hint
              label={
                row.paused === "account"
                  ? "Resume: posts, warms up and takes readings again"
                  : "Pause: no posting, warm-up or readings until you resume it"
              }
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={busy}
                onClick={() => onPause(row.paused !== "account")}
                aria-label={row.paused === "account" ? `Resume ${name}` : `Pause ${name}`}
              >
                {row.paused === "account" ? <PlayIcon className="size-4" /> : <PauseIcon className="size-4" />}
              </Button>
            </Hint>
            <Hint
              label={
                reddit
                  ? "Settings: important or throwaway, where it runs, and its two-factor code"
                  : "Settings: its profile, important or throwaway, its phone, and its two-factor code"
              }
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={busy}
                onClick={onRunsOn}
                aria-label={`Settings for ${name}`}
              >
                <SettingsIcon className="size-4" />
              </Button>
            </Hint>
            <Hint label="Retire: out of every list and picker, its comments stay">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={busy}
                onClick={() => onRetire(true)}
                aria-label={`Retire ${name}`}
              >
                <ArchiveIcon className="size-4" />
              </Button>
            </Hint>
          </>
        )}
      </TableCell>
    </TableRow>
  )
}
