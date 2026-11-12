import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "lucide-react"

import { FilterRow } from "@/components/admin-dashboard/list-parts"
import type { CrmFrame } from "@/components/crm/crm-frame"
import { CrmListHeader, CrmRowMenu, type RowMenuItem } from "@/components/crm/crm-row"
import { Chip, CrmGroupRow, CrmTable, CrmTableRow, MainCell, useFolds } from "@/components/crm/crm-table"
import { EmptyRecord } from "@/components/crm/record-frame"
import { DashboardTabs } from "@/components/shared/dashboard-tabs"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { FilterPopover } from "@/components/shared/filter-popover"
import { SelectedMenu, SelectedMenuRow, SelectedMenuSeparator } from "@/components/shared/mass-select"
import { PanelReopenButton } from "@/components/shared/three-panels"
import { ViewMenu } from "@/components/shared/view-menu"
import { AccountRecord, accountName } from "@/components/social/accounts/account-record"
import { AccountStatusBadge } from "@/components/social/accounts/account-status-badge"
import { AddAccountDialog } from "@/components/social/accounts/add-account-dialog"
import { HelpPostsDialog } from "@/components/social/accounts/help-posts-dialog"
import { RetireDialog } from "@/components/social/accounts/retire-dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableCell } from "@/components/ui/table"
import {
  checkRedditAccounts,
  getRedditAccountsErrorMessage,
  loadRedditAccounts,
  pauseRedditAccounts,
  retireRedditAccounts,
  setRedditAccountsStatus,
  type RedditAccountRow,
  type RedditAccountsPage,
} from "@/lib/api/social/reddit-accounts"
import { RETIRED_REASON_LABELS, RETIRED_REASONS } from "@/lib/bans/options"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useOpenRecord } from "@/lib/nav/list-search"
import { ACCOUNT_STATUSES, ACCOUNT_STATUS_LABELS, type AccountStatus } from "@/lib/social/account-status"
import { IMPORTANCE_WORDS } from "@/lib/social/importance"
import { handleWords, isNetwork, NETWORK_NAMES, NETWORKS } from "@/lib/social/networks"
import { REASON_NOT_RECORDED, type ProjectsSearch } from "@/lib/social/projects-dashboard-search"
import { postedDateText } from "@/lib/social/wording"

type Column = "account" | "status" | "project" | "runsOn" | "last"

/** Status order when sorting: the five in Tyler's order, then never read. */
const STATUS_ORDER: Record<AccountStatus, number> = { warming_up: 0, ready: 1, working: 2, at_risk: 3, banned: 4 }
const ALL = "all"
const time = (value: Date | string | null) => (value ? new Date(value).getTime() : Number.NEGATIVE_INFINITY)

function platformName(platform: string) {
  return isNetwork(platform) ? NETWORK_NAMES[platform] : platform
}

/**
 * The Accounts section (Tyler, 12 Nov 2026): every account on every
 * platform, in the dashboard's one header and table shape, in place of the
 * Accounts table with its counts strip, icon buttons, selects in each row and
 * settings window (`workspace/docs/reddit/accounts-dashboard.md`).
 *
 * - **Header:** In use and Retired as tabs; search, Select, Filter
 *   (Platform, Status, Important or throwaway, Tag, and on Retired the
 *   reason) and New account. The counts strip went: its figures are in
 *   Filter's choices and Overview's Accounts by status, so the middle keeps
 *   one header.
 * - **Table:** each account's name and platform, its status, project, where
 *   it runs and its last comment or post, under its profile's or phone's
 *   folder when there are folders.
 * - **Right:** the account (`AccountRecord`), its project, voice, where it
 *   runs and its status set from its ⋮, with every card its window held.
 *
 * The Projects block narrows the list to one project's accounts.
 */
export function AccountsSection({
  initial,
  projects,
  search,
  projectId,
  frame,
}: {
  initial: RedditAccountsPage
  projects: { id: string; name: string }[]
  search: ProjectsSearch
  projectId: string
  frame: CrmFrame
}) {
  const router = useRouter()
  const setListSearch = useListSearchNavigate()
  const setOpen = useOpenRecord()
  const retiredTab = search.show === "retired"
  const [inUsePage, setInUsePage] = React.useState(initial)
  // Read with the retired accounts only once the Retired tab, or a link to a retired account, asks.
  const [allPage, setAllPage] = React.useState<RedditAccountsPage | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const page = retiredTab ? allPage : inUsePage
  const q = search.q ?? ""
  const [sort, setSort] = React.useState<Column>("account")
  const [direction, setDirection] = React.useState<"asc" | "desc">("asc")
  const toggleSort = (column: Column) => {
    if (column === sort) setDirection(direction === "asc" ? "desc" : "asc")
    else {
      setSort(column)
      setDirection(column === "last" ? "desc" : "asc")
    }
  }
  const folds = useFolds()
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const [massSelect, setMassSelect] = React.useState(false)
  const selection = useSelection()
  const [run, busy] = useAsyncAction(getRedditAccountsErrorMessage)
  const [adding, setAdding] = React.useState(false)
  const [helpFor, setHelpFor] = React.useState<string | null>(null)
  const [retiring, setRetiring] = React.useState<RedditAccountRow[] | null>(null)

  const refresh = React.useCallback(async () => {
    try {
      const [inUse, all] = await Promise.all([loadRedditAccounts(false), allPage || retiredTab ? loadRedditAccounts(true) : null])
      setInUsePage(inUse)
      if (all) setAllPage(all)
      setError(null)
      // The left page's counts and Overview read the route's copy.
      void router.invalidate()
    } catch (failure) {
      setError(getRedditAccountsErrorMessage(failure))
    }
  }, [allPage, retiredTab, router])

  React.useEffect(() => {
    if (!retiredTab || allPage) return
    let live = true
    loadRedditAccounts(true).then(
      (next) => {
        if (live) setAllPage(next)
      },
      (failure: unknown) => {
        if (live) setError(getRedditAccountsErrorMessage(failure))
      }
    )
    return () => {
      live = false
    }
  }, [allPage, retiredTab])

  // A link to a retired account (from the Bans dashboard or a phone's
  // History tab) finds it only with the retired accounts read, so they are
  // read once and the Retired tab opens on it. Until that read is back, the
  // first row does not take the link's place.
  const openId = search.open
  const [lookup, setLookup] = React.useState<"looking" | "done">(() =>
    !retiredTab && openId && !inUsePage.accounts.some((row) => row.id === openId) ? "looking" : "done"
  )
  React.useEffect(() => {
    if (lookup !== "looking") return
    let live = true
    loadRedditAccounts(true)
      .then(
        (next) => {
          if (!live || !next.accounts.some((row) => row.id === openId && row.retiredAt)) return
          setAllPage(next)
          setListSearch({ show: "retired" })
        },
        () => {}
      )
      .finally(() => {
        if (live) setLookup("done")
      })
    return () => {
      live = false
    }
  }, [lookup, openId, setListSearch])

  const accounts = React.useMemo(
    () => (page?.accounts ?? []).filter((row) => Boolean(row.retiredAt) === retiredTab),
    [page, retiredTab]
  )
  const tags = React.useMemo(
    () => [...new Set(accounts.flatMap((row) => row.profile?.tags ?? row.phone?.tags ?? []))].sort((a, b) => a.localeCompare(b)),
    [accounts]
  )

  const rows = React.useMemo(() => {
    const sign = direction === "asc" ? 1 : -1
    const needle = q.trim().toLowerCase()
    return accounts
      .filter((row) => !projectId || row.project?.id === projectId)
      .filter((row) => !search.platform || row.platform === search.platform)
      .filter((row) => !search.status || row.status.status === search.status)
      .filter((row) => !search.importance || row.importance === search.importance)
      .filter((row) => !search.tag || (row.profile?.tags ?? row.phone?.tags ?? []).includes(search.tag))
      .filter(
        (row) =>
          !retiredTab ||
          !search.reason ||
          row.retiredReason.key === (search.reason === REASON_NOT_RECORDED ? "" : search.reason)
      )
      .filter(
        (row) =>
          !needle ||
          [row.handle, row.project?.name, row.profile?.name, row.phone?.name, row.voice?.name]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(needle))
      )
      .sort((a, b) => {
        switch (sort) {
          case "status":
            return ((a.status.status ? STATUS_ORDER[a.status.status] : 5) - (b.status.status ? STATUS_ORDER[b.status.status] : 5)) * sign
          case "project":
            return (a.project?.name ?? "").localeCompare(b.project?.name ?? "") * sign
          case "runsOn":
            return (a.profile?.name ?? a.phone?.name ?? "").localeCompare(b.profile?.name ?? b.phone?.name ?? "") * sign
          case "last":
            return (time(a.lastPostedAt) - time(b.lastPostedAt)) * sign
          default:
            return (a.handle || "~").localeCompare(b.handle || "~") * sign
        }
      })
  }, [accounts, direction, projectId, q, retiredTab, search.importance, search.platform, search.reason, search.status, search.tag, sort])

  /** The rows under their profile's or phone's folder, by name, and "No folder" last. */
  const groups = React.useMemo(() => {
    const byFolder = new Map<string, { label: string | null; rows: RedditAccountRow[] }>()
    for (const row of rows) {
      const folder = row.profile?.folder ?? row.phone?.folder ?? null
      const key = folder?.id ?? ""
      const group = byFolder.get(key) ?? { label: folder?.name ?? null, rows: [] }
      group.rows.push(row)
      byFolder.set(key, group)
    }
    const list = [...byFolder.values()].sort((a, b) =>
      a.label === null ? 1 : b.label === null ? -1 : a.label.localeCompare(b.label)
    )
    // With no folder anywhere there is one group and no heading.
    return list.some((group) => group.label !== null)
      ? list.map((group) => ({ label: group.label ?? "No folder", rows: group.rows }))
      : [{ label: null, rows }]
  }, [rows])

  const ids = groups.flatMap((group) => (group.label && folds.folded(group.label) ? [] : group.rows)).map((row) => row.id)
  const openRow = accounts.find((row) => row.id === openId) ?? null

  const firstId = rows[0]?.id
  const openInList = Boolean(openId && rows.some((row) => row.id === openId))
  React.useEffect(() => {
    // Wait for the Retired tab's read, and for a link to a retired account to be looked for.
    if (!page || lookup === "looking") return
    if (firstId && !openInList) setListSearch({ open: firstId })
  }, [firstId, lookup, openInList, page, setListSearch])
  const [pressedId, setPressedId] = React.useState<string>()
  const pick = (id: string) => {
    setPressedId(id)
    setOpen(id)
  }

  const filterKey = `${retiredTab}|${q}|${projectId}|${search.platform}|${search.status}|${search.importance}|${search.tag}|${search.reason}`
  useClearSelectionOnListChange(selection.setSelected, filterKey)
  const selected = rows.filter((row) => selection.selected.has(row.id))
  const toggleMassSelect = (tickId?: string) => {
    if (massSelect) {
      selection.clear()
      setMassSelect(false)
      return
    }
    setMassSelect(true)
    if (tickId) selection.setSelected(new Set([tickId]))
  }

  async function bulk(work: () => Promise<unknown>) {
    const ok = await run(async () => {
      await work()
      await refresh()
    })
    if (ok) selection.clear()
    return ok
  }
  const idsOf = (list: RedditAccountRow[]) => list.map((row) => row.id)

  /** What an account can do, for its right-click menu. Its ⋮ on the right holds these and more. */
  const actionsFor = (row: RedditAccountRow): RowMenuItem[] =>
    row.retiredAt
      ? [{ label: "Bring back", icon: <ArchiveRestoreIcon className="size-4" />, onSelect: () => void bulk(() => retireRedditAccounts([row.id], false)) }]
      : [
          { label: "Check now", icon: <RefreshCwIcon className="size-4" />, onSelect: () => void bulk(() => checkRedditAccounts([row.id])) },
          row.paused === "account"
            ? { label: "Resume", icon: <PlayIcon className="size-4" />, onSelect: () => void bulk(() => pauseRedditAccounts([row.id], false)) }
            : { label: "Pause", icon: <PauseIcon className="size-4" />, onSelect: () => void bulk(() => pauseRedditAccounts([row.id], true)) },
          { label: "Retire", icon: <ArchiveIcon className="size-4" />, destructive: true, onSelect: () => setRetiring([row]) },
        ]

  const filterCount = [search.platform, search.status, search.importance, search.tag, retiredTab ? search.reason : undefined].filter(Boolean).length
  const tabs = [
    { value: "inuse", label: "In use", count: inUsePage.accounts.filter((row) => !row.retiredAt && (!projectId || row.project?.id === projectId)).length },
    { value: "retired", label: "Retired" },
  ]
  const pickTab = (value: string) => setListSearch({ show: value === "retired" ? "retired" : undefined, reason: undefined, open: undefined })

  const middle = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <CrmListHeader
        tabs={
          <>
            <PanelReopenButton side="left" label="Show the page" />
            <span className="hidden @2xl:contents">
              <DashboardTabs value={retiredTab ? "retired" : "inuse"} onValueChange={pickTab} tabs={tabs} />
            </span>
            <span className="shrink-0 @2xl:hidden">
              <ViewMenu value={retiredTab ? "retired" : "inuse"} onValueChange={pickTab} choices={tabs} label="Which accounts" />
            </span>
          </>
        }
        end={<PanelReopenButton side="right" label="Show the account" />}
        selected={
          massSelect && selected.length ? (
            <SelectedMenu
              count={selected.length}
              busy={busy}
              onClear={selection.clear}
              pages={{
                status: {
                  title: "Set status",
                  content: (menu) => (
                    <>
                      {/* At risk is worked out on each read from its signs, so it is never set by hand. */}
                      {ACCOUNT_STATUSES.filter((status) => status !== "at_risk").map((status) => (
                        <SelectedMenuRow
                          key={status}
                          onClick={() => {
                            menu.close()
                            void bulk(() => setRedditAccountsStatus(idsOf(selected), status))
                          }}
                        >
                          {ACCOUNT_STATUS_LABELS[status]}
                        </SelectedMenuRow>
                      ))}
                      <SelectedMenuSeparator />
                      <SelectedMenuRow
                        onClick={() => {
                          menu.close()
                          void bulk(() => setRedditAccountsStatus(idsOf(selected), null))
                        }}
                      >
                        Let the app decide
                      </SelectedMenuRow>
                    </>
                  ),
                },
              }}
              main={(menu) =>
                retiredTab ? (
                  <SelectedMenuRow
                    onClick={() => {
                      menu.close()
                      void bulk(() => retireRedditAccounts(idsOf(selected), false))
                    }}
                  >
                    <ArchiveRestoreIcon className="size-4 text-muted-foreground" />
                    Bring back
                  </SelectedMenuRow>
                ) : (
                  <>
                    <SelectedMenuRow
                      onClick={() => {
                        menu.close()
                        void bulk(() => checkRedditAccounts(idsOf(selected)))
                      }}
                    >
                      <RefreshCwIcon className="size-4 text-muted-foreground" />
                      Check now
                    </SelectedMenuRow>
                    <SelectedMenuRow page="status" onClick={() => menu.step("status")}>
                      <ShieldCheckIcon className="size-4 text-muted-foreground" />
                      Set status
                    </SelectedMenuRow>
                    <SelectedMenuRow
                      onClick={() => {
                        menu.close()
                        void bulk(() => pauseRedditAccounts(idsOf(selected), true))
                      }}
                    >
                      <PauseIcon className="size-4 text-muted-foreground" />
                      Pause
                    </SelectedMenuRow>
                    <SelectedMenuRow
                      onClick={() => {
                        menu.close()
                        void bulk(() => pauseRedditAccounts(idsOf(selected), false))
                      }}
                    >
                      <PlayIcon className="size-4 text-muted-foreground" />
                      Resume
                    </SelectedMenuRow>
                    <SelectedMenuRow
                      className="text-destructive"
                      onClick={() => {
                        menu.close()
                        setRetiring(selected)
                      }}
                    >
                      <ArchiveIcon className="size-4" />
                      Retire
                    </SelectedMenuRow>
                  </>
                )
              }
            />
          ) : null
        }
        menuLabel="More for accounts"
        search={{
          name: "account-search",
          label: "Search accounts by name, project, profile or voice",
          placeholder: "Search accounts",
          value: q,
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined }),
        }}
        massSelect={{ on: massSelect, onToggle: () => toggleMassSelect() }}
        filter={
          <FilterPopover
            count={filterCount}
            onClear={() => setListSearch({ platform: undefined, status: undefined, importance: undefined, tag: undefined, reason: undefined })}
            save={null}
            contentClassName="w-60"
          >
            <FilterPick
              id="accounts-platform"
              label="Platform"
              value={search.platform}
              any="All platforms"
              options={NETWORKS.map((network) => [network, NETWORK_NAMES[network]])}
              onChange={(platform) => setListSearch({ platform })}
            />
            <FilterPick
              id="accounts-status"
              label="Status"
              value={search.status}
              any="All statuses"
              options={ACCOUNT_STATUSES.map((status) => [status, ACCOUNT_STATUS_LABELS[status]])}
              onChange={(status) => setListSearch({ status })}
            />
            <FilterPick
              id="accounts-importance"
              label="Important or throwaway"
              value={search.importance}
              any="Both"
              options={[
                ["important", IMPORTANCE_WORDS.important],
                ["throwaway", IMPORTANCE_WORDS.throwaway],
              ]}
              onChange={(importance) => setListSearch({ importance })}
            />
            {tags.length ? (
              <FilterPick
                id="accounts-tag"
                label="Tag"
                value={search.tag}
                any="All tags"
                options={tags.map((tag) => [tag, tag])}
                onChange={(tag) => setListSearch({ tag })}
              />
            ) : null}
            {retiredTab ? (
              <FilterPick
                id="accounts-reason"
                label="Why it was retired"
                value={search.reason}
                any="Every reason"
                options={[
                  ...RETIRED_REASONS.map((reason): [string, string] => [reason, RETIRED_REASON_LABELS[reason]]),
                  [REASON_NOT_RECORDED, "Not recorded"],
                ]}
                onChange={(reason) => setListSearch({ reason })}
              />
            ) : null}
          </FilterPopover>
        }
        primary={
          <DashboardToolbarButton type="button" onClick={() => setAdding(true)}>
            <PlusIcon className="size-4" />
            <span className="@max-3xl:sr-only">New account</span>
          </DashboardToolbarButton>
        }
      />
      {error ? (
        <div className="px-6 py-3">
          <ErrorRow message={error} onRetry={() => void refresh()} />
        </div>
      ) : null}
      {!page ? (
        <div className="px-6 py-3">
          <LoadingRow label="Reading the retired accounts…" />
        </div>
      ) : (
        <CrmTable<Column>
          columns={[
            { key: "account", label: "Account", column: "main", className: "min-w-40" },
            { key: "status", label: "Status", column: "preview", className: "hidden md:hidden @lg:table-cell" },
            { key: "project", label: "Project", column: "preview", className: "hidden md:hidden @2xl:table-cell" },
            { key: "runsOn", label: "Runs on", column: "preview", className: "hidden md:hidden @3xl:table-cell" },
            { key: "last", label: "Last comment or post", column: "meta", className: "hidden md:hidden @4xl:table-cell" },
          ]}
          sort={sort}
          direction={direction}
          onSort={toggleSort}
          actions={false}
          select={
            massSelect
              ? {
                  noun: "accounts",
                  disabled: ids.length === 0,
                  checked: selection.selectAllState(ids),
                  onToggle: () => selection.toggleVisible(ids),
                }
              : null
          }
          empty={
            rows.length > 0
              ? null
              : q || filterCount
                ? "No accounts match that."
                : retiredTab
                  ? "No retired accounts."
                  : projectId
                    ? "No accounts in this project yet. Put one in from its ⋮, or make one with New account."
                    : "No accounts yet. Press New account, pick the network and where it runs, then sign in there."
          }
        >
          {groups.map((group) => (
            <React.Fragment key={group.label ?? "all"}>
              {group.label ? (
                <CrmGroupRow
                  label={group.label}
                  count={group.rows.length}
                  folded={folds.folded(group.label)}
                  onToggle={() => folds.toggle(group.label!)}
                />
              ) : null}
              {group.label && folds.folded(group.label)
                ? null
                : group.rows.map((row) => (
                    <CrmTableRow
                      key={row.id}
                      open={row.id === openId}
                      label={accountName(row)}
                      tick={{ shown: massSelect, ticked: selection.selected.has(row.id), onToggle: () => selection.toggle(row.id) }}
                      onOpen={() => pick(row.id)}
                      onRightClick={(x, y) => setRightClick({ id: row.id, x, y })}
                    >
                      <MainCell name={row.handle ? handleWords(row.platform, row.handle) : "Not signed in"}>
                        <span className="shrink-0 text-xs text-muted-foreground">{platformName(row.platform)}</span>
                        {row.paused ? (
                          <Chip muted className="hidden shrink-0 @xl:inline-flex">
                            Paused
                          </Chip>
                        ) : null}
                      </MainCell>
                      <TableCell column="preview" className="hidden md:hidden @lg:table-cell">
                        <AccountStatusBadge view={row.status} />
                      </TableCell>
                      <TableCell column="preview" className="hidden md:hidden @2xl:table-cell">
                        {row.project ? (
                          <span className="block truncate">{row.project.name}</span>
                        ) : (
                          <span className="text-muted-foreground">No project</span>
                        )}
                      </TableCell>
                      <TableCell column="preview" className="hidden md:hidden @3xl:table-cell">
                        {row.profile ? (
                          <span className="block truncate">{row.profile.name}</span>
                        ) : row.phone ? (
                          <span className="block truncate">Phone: {row.phone.name}</span>
                        ) : (
                          <span className="text-destructive">Nowhere</span>
                        )}
                      </TableCell>
                      <TableCell column="mutedMeta" className="hidden md:hidden @4xl:table-cell">
                        {row.lastPostedAt ? postedDateText(new Date(row.lastPostedAt)) : "Never"}
                      </TableCell>
                    </CrmTableRow>
                  ))}
            </React.Fragment>
          ))}
        </CrmTable>
      )}
      {rightClick ? (
        <CrmRowMenu
          key={`${rightClick.id}-${rightClick.x}-${rightClick.y}`}
          at={rightClick}
          massSelect={{ on: massSelect, onToggle: () => toggleMassSelect(!massSelect ? rightClick.id : undefined) }}
          items={(() => {
            const row = accounts.find((each) => each.id === rightClick.id)
            return row ? actionsFor(row) : []
          })()}
          onClose={() => setRightClick(null)}
        />
      ) : null}
    </div>
  )

  return frame({
    ids,
    showMiddleFor: filterKey,
    showRightFor: pressedId && pressedId === search.open ? pressedId : undefined,
    middle,
    right: {
      label: "Account",
      showLabel: "Show the account",
      content:
        openRow && page ? (
          <AccountRecord
            key={openRow.id}
            row={openRow}
            page={page}
            projects={projects}
            onChanged={refresh}
            onHelp={() => setHelpFor(openRow.id)}
            onRetire={() => setRetiring([openRow])}
            onBringBack={() => void bulk(() => retireRedditAccounts([openRow.id], false))}
          />
        ) : (
          <EmptyRecord
            title="Account"
            icon={<UsersIcon aria-hidden />}
            loading={!page}
            line={accounts.length ? "Click an account to see it here." : "Make an account with New account to see it here."}
            hideLabel="Hide the account"
          />
        ),
    },
    windows: (
      <>
        <HelpPostsDialog accountId={helpFor} onClose={() => setHelpFor(null)} />
        <RetireDialog
          // A fresh window each time, so a reason picked before never carries over.
          key={retiring ? `retire-${retiring.map((row) => row.id).join(",")}` : "retire-closed"}
          names={retiring ? retiring.map((row) => (row.handle ? handleWords(row.platform, row.handle) : "an account not signed in")) : null}
          onClose={() => setRetiring(null)}
          onRetire={async (why) => {
            const done = await bulk(() => retireRedditAccounts(idsOf(retiring ?? []), true, why))
            if (done) setRetiring(null)
            return done
          }}
        />
        <AddAccountDialog
          // Opened again on another network's filter, it starts on that network.
          key={search.platform ?? ALL}
          open={adding}
          initialPlatform={search.platform ?? "reddit"}
          profiles={inUsePage.freeProfiles}
          phones={inUsePage.freePhones}
          voices={inUsePage.voices}
          onClose={() => setAdding(false)}
          onAdded={async () => {
            setAdding(false)
            await refresh()
          }}
        />
      </>
    ),
  })
}

/** One of Filter's rows: a label, then a select whose first choice is "any". */
function FilterPick<T extends string>({
  id,
  label,
  value,
  any,
  options,
  onChange,
}: {
  id: string
  label: string
  value: T | undefined
  any: string
  options: [string, string][]
  onChange: (value: T | undefined) => void
}) {
  return (
    <FilterRow id={id} label={label}>
      <Select value={value ?? ALL} onValueChange={(next) => onChange(next === ALL ? undefined : (next as T))}>
        <SelectTrigger id={id} className="h-8 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{any}</SelectItem>
          {options.map(([optionValue, optionLabel]) => (
            <SelectItem key={optionValue} value={optionValue}>
              {optionLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FilterRow>
  )
}
