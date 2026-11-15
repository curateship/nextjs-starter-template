import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { ArrowUpRightIcon, BanIcon, SmartphoneIcon, UserIcon } from "lucide-react"

import type { CrmFrame } from "@/components/crm/crm-frame"
import { CrmListHeader, CrmRowMenu, type RowMenuItem } from "@/components/crm/crm-row"
import { Chip, CrmTable, CrmTableRow, MainCell } from "@/components/crm/crm-table"
import { EmptyRecord, FooterState, RecordFrame } from "@/components/crm/record-frame"
import { FilterPick } from "@/components/dashboard-page/filter-pick"
import { FilterPopover } from "@/components/shared/filter-popover"
import { MiddleHeading, PanelReopenButton } from "@/components/shared/three-panels"
import { DetailNote, DetailRow, DetailRows } from "@/components/dashboard-page/detail-rows"
import { PanelCard } from "@/components/shared/panel-card"
import { BanCard } from "@/components/social/accounts/ban-card"
import { Button } from "@/components/ui/button"
import { TableCell } from "@/components/ui/table"
import { banWho } from "@/lib/anti-detect/rows"
import { BAN_SINCE, type AntiDetectSearch, type BanSince } from "@/lib/anti-detect/search"
import type { BanRow, BansPage } from "@/lib/api/bans"
import { getRedditAccountsErrorMessage, letRedditAccountRunAgain } from "@/lib/api/social/reddit-accounts"
import { appName, BAN_KIND_LABELS, BAN_KINDS } from "@/lib/bans/options"
import { formatDateTime } from "@/lib/format/format-time"
import { useListSearchNavigate, useOpenRecord } from "@/lib/nav/list-search"
import { NETWORK_NAMES, NETWORKS } from "@/lib/social/networks"
import { showErrorToast } from "@/lib/toast/error-toast"

/** The last four columns are read, not sorted. */
type Column = "account" | "at" | "app" | "kind" | "where" | "proxy" | "appeal" | "after"

const DAY_MS = 86_400_000

function compare(a: BanRow, b: BanRow, column: Column): number {
  switch (column) {
    case "app":
      return appName(a.app).localeCompare(appName(b.app))
    case "account":
      return (a.handle || "~").localeCompare(b.handle || "~")
    case "kind":
      return BAN_KIND_LABELS[a.kind].localeCompare(BAN_KIND_LABELS[b.kind])
    case "at":
      return new Date(a.at).getTime() - new Date(b.at).getTime()
    default:
      return new Date(a.at).getTime() - new Date(b.at).getTime()
  }
}


const appealWords = (row: BanRow) =>
  !row.appeal ? "None" : row.appeal.answer === "won" ? "Won" : row.appeal.answer === "lost" ? "Lost" : "Waiting"

const afterWords = (row: BanRow) =>
  row.cleanedUpAt ? "Cleaned up" : row.letRunAt ? "Let run again" : row.looksBackAt ? "Looks back" : row.stopped ? "Stopped" : "Retired"

/**
 * The Anti Detect dashboard's Bans (Tyler, 12 Nov 2026), where the Bans
 * screen used to be: every ban in one list, to spot patterns, in the
 * dashboard's one header and table shape. The brake, the screens Promo is
 * asking about and the sellers moved to Overview's Waiting on you and Bans
 * in 30 days (his answer: "Overview widgets").
 *
 * - **Header:** search, and Filter (App, Kind, Phone, Proxy, Seller, When);
 *   the project comes from the Projects block. No Select: nobody changes
 *   bans in bulk.
 * - **A row** opens the ban on the right (`BanRecord`): its picture, the
 *   screen's words, the appeal, Clean up or Let it run again, and the
 *   phone's last 20 actions before it.
 */
export function BansSection({
  page,
  search,
  projectId,
  frame,
}: {
  page: BansPage
  search: AntiDetectSearch
  /** The project picked in the Projects block: only its accounts' bans. */
  projectId: string
  frame: CrmFrame
}) {
  const router = useRouter()
  const navigate = useNavigate()
  const setListSearch = useListSearchNavigate()
  const setOpen = useOpenRecord()
  const q = search.q ?? ""
  const [sort, setSort] = React.useState<Column>("at")
  const [direction, setDirection] = React.useState<"asc" | "desc">("desc")
  const toggleSort = (column: Column) => {
    if (column === sort) setDirection(direction === "asc" ? "desc" : "asc")
    else {
      setSort(column)
      setDirection(column === "at" ? "desc" : "asc")
    }
  }
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  // "Last 30 days" counts from when the section was opened, so a list does not shift while it is read.
  const [openedAt] = React.useState(() => Date.now())
  const refresh = React.useCallback(async () => {
    await router.invalidate()
  }, [router])

  const options = React.useMemo(() => {
    const phones = new Map<string, string>()
    const proxies = new Map<string, string>()
    const sellers = new Set<string>()
    for (const row of page.bans) {
      if (row.phone) phones.set(row.phone.id, row.phone.name)
      if (row.proxy) proxies.set(row.proxy.id, row.proxy.label)
      if (row.seller) sellers.add(row.seller)
    }
    // A value in the address that is not among them stays as a choice, so a filter never changes on its own.
    if (search.phone && !phones.has(search.phone)) phones.set(search.phone, "A phone with no bans")
    if (search.proxy && !proxies.has(search.proxy)) proxies.set(search.proxy, "A proxy with no bans")
    if (search.seller) sellers.add(search.seller)
    const list = (map: Map<string, string>): [string, string][] => [...map].sort((a, b) => a[1].localeCompare(b[1]))
    return {
      phones: list(phones),
      proxies: list(proxies),
      sellers: [...sellers].sort((a, b) => a.localeCompare(b)).map((name): [string, string] => [name, name]),
    }
  }, [page.bans, search.phone, search.proxy, search.seller])

  const rows = React.useMemo(() => {
    const needle = q.trim().toLowerCase()
    const sign = direction === "asc" ? 1 : -1
    const since = search.since ? openedAt - search.since * DAY_MS : null
    return page.bans
      .filter((row) => {
        if (projectId && row.project?.id !== projectId) return false
        if (search.app && row.app !== search.app) return false
        if (search.kind && row.kind !== search.kind) return false
        if (search.phone && row.phone?.id !== search.phone) return false
        if (search.proxy && row.proxy?.id !== search.proxy) return false
        if (search.seller && row.seller.toLowerCase() !== search.seller.toLowerCase()) return false
        if (since !== null && new Date(row.at).getTime() < since) return false
        if (!needle) return true
        return [banWho(row), row.seller, row.phone?.name ?? "", row.proxy?.label ?? "", row.words].some((text) =>
          text.toLowerCase().includes(needle)
        )
      })
      .sort((a, b) => sign * compare(a, b, sort))
  }, [direction, openedAt, page.bans, projectId, q, search.app, search.kind, search.phone, search.proxy, search.seller, search.since, sort])
  const ids = rows.map((row) => row.id)
  const openId = search.open
  const openBan = page.bans.find((row) => row.id === openId) ?? null

  // The right panel is never left empty: a filter that leaves the open ban
  // out of the list opens the list's first row instead.
  const firstId = rows[0]?.id
  const openInList = Boolean(openId && rows.some((row) => row.id === openId))
  React.useEffect(() => {
    if (firstId && !openInList) setListSearch({ open: firstId })
  }, [firstId, openInList, setListSearch])
  const [pressedId, setPressedId] = React.useState<string>()
  const pick = (id: string) => {
    setPressedId(id)
    setOpen(id)
  }

  const openAccount = (row: BanRow) =>
    row.account ? void navigate({ to: "/admin/projects", search: { section: "accounts", open: row.account.id } }) : undefined
  const actionsFor = (row: BanRow): RowMenuItem[] =>
    row.account ? [{ label: "Open the account", icon: <ArrowUpRightIcon className="size-4" />, onSelect: () => openAccount(row) }] : []

  const filterCount = [search.app, search.kind, search.phone, search.proxy, search.seller, search.since].filter(Boolean).length
  const listKey = `${q}|${projectId}|${search.app}|${search.kind}|${search.phone}|${search.proxy}|${search.seller}|${search.since}`

  const middle = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <CrmListHeader
        tabs={<MiddleHeading icon={BanIcon} label="Bans" />}
        end={<PanelReopenButton side="right" label="Show the ban" />}
        menuLabel="More for bans"
        search={{
          name: "ban-search",
          label: "Search bans by account, seller, phone, proxy or the screen's words",
          placeholder: "Search bans",
          value: q,
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined }),
        }}
        massSelect={null}
        filter={
          <FilterPopover
            count={filterCount}
            onClear={() =>
              setListSearch({ app: undefined, kind: undefined, phone: undefined, proxy: undefined, seller: undefined, since: undefined })
            }
            save={null}
            contentClassName="w-60"
          >
            <FilterPick
              id="bans-app"
              label="App"
              value={search.app}
              any="All apps"
              options={NETWORKS.map((network) => [network, NETWORK_NAMES[network]])}
              onChange={(app) => setListSearch({ app })}
            />
            <FilterPick
              id="bans-kind"
              label="Kind"
              value={search.kind}
              any="All kinds"
              options={BAN_KINDS.map((kind) => [kind, BAN_KIND_LABELS[kind]])}
              onChange={(kind) => setListSearch({ kind })}
            />
            {options.phones.length ? (
              <FilterPick id="bans-phone" label="Phone" value={search.phone} any="All phones" options={options.phones} onChange={(phone) => setListSearch({ phone })} />
            ) : null}
            {options.proxies.length ? (
              <FilterPick id="bans-proxy" label="Proxy" value={search.proxy} any="All proxies" options={options.proxies} onChange={(proxy) => setListSearch({ proxy })} />
            ) : null}
            {options.sellers.length ? (
              <FilterPick id="bans-seller" label="Seller" value={search.seller} any="All sellers" options={options.sellers} onChange={(seller) => setListSearch({ seller })} />
            ) : null}
            <FilterPick
              id="bans-since"
              label="When"
              value={search.since ? String(search.since) : undefined}
              any="Any time"
              options={BAN_SINCE.map((days) => [String(days), `Last ${days} days`])}
              onChange={(value) => setListSearch({ since: value ? (Number(value) as BanSince) : undefined })}
            />
          </FilterPopover>
        }
      />
      <CrmTable<Column>
        columns={[
          { key: "account", label: "Account", column: "main", className: "min-w-40" },
          { key: "at", label: "When", column: "meta", className: "hidden md:hidden @lg:table-cell" },
          { key: "app", label: "App", column: "meta", className: "hidden md:hidden @xl:table-cell" },
          { key: "kind", label: "Kind", column: "meta", className: "hidden md:hidden @md:table-cell" },
          { key: "where", sortable: false, label: "Phone or profile", column: "meta", className: "hidden md:hidden @4xl:table-cell" },
          { key: "proxy", sortable: false, label: "Proxy or SIM", column: "meta", className: "hidden md:hidden @5xl:table-cell" },
          { key: "appeal", sortable: false, label: "Appeal", column: "meta", className: "hidden md:hidden @3xl:table-cell" },
          { key: "after", sortable: false, label: "Since", column: "preview", className: "hidden md:hidden @6xl:table-cell" },
        ]}
        sort={sort}
        direction={direction}
        onSort={toggleSort}
        actions={false}
        select={null}
        empty={rows.length > 0 ? null : page.bans.length ? "No bans match that." : "No account has been banned yet."}
      >
        {rows.map((row) => (
          <CrmTableRow
            key={row.id}
            open={row.id === openId}
            label={banWho(row)}
            onOpen={() => pick(row.id)}
            onRightClick={row.account ? (x, y) => setRightClick({ id: row.id, x, y }) : undefined}
          >
            <MainCell name={banWho(row)}>
              {row.counts ? null : (
                <Chip muted className="shrink-0 whitespace-nowrap">
                  Recorded, not counted
                </Chip>
              )}
            </MainCell>
            <TableCell column="mutedMeta" className="hidden whitespace-nowrap md:hidden @lg:table-cell">
              {formatDateTime(row.at)}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden md:hidden @xl:table-cell">
              {appName(row.app)}
            </TableCell>
            <TableCell column="meta" className="hidden text-sm md:hidden @md:table-cell">
              <span className={row.counts ? "text-destructive" : "text-muted-foreground"}>{BAN_KIND_LABELS[row.kind]}</span>
            </TableCell>
            <TableCell column="mutedMeta" className="hidden max-w-40 md:hidden @4xl:table-cell">
              <span className="flex min-w-0 items-center gap-1.5">
                {row.phone ? <SmartphoneIcon className="size-3.5 shrink-0" aria-hidden /> : null}
                <span className="truncate">{row.phone ? row.phone.name : "Browser profile"}</span>
              </span>
            </TableCell>
            <TableCell column="mutedMeta" className="hidden max-w-40 md:hidden @5xl:table-cell">
              <span className="block truncate">{row.proxy ? row.proxy.label : row.simCarrier ? `SIM: ${row.simCarrier}` : "None"}</span>
            </TableCell>
            <TableCell column="mutedMeta" className="hidden md:hidden @3xl:table-cell">
              {appealWords(row)}
            </TableCell>
            <TableCell column="preview" className="hidden md:hidden @6xl:table-cell">
              {afterWords(row)}
            </TableCell>
          </CrmTableRow>
        ))}
      </CrmTable>
      {rightClick ? (
        <CrmRowMenu
          key={`${rightClick.id}-${rightClick.x}-${rightClick.y}`}
          at={rightClick}
          massSelect={null}
          items={(() => {
            const row = page.bans.find((each) => each.id === rightClick.id)
            return row ? actionsFor(row) : []
          })()}
          onClose={() => setRightClick(null)}
        />
      ) : null}
    </div>
  )

  return frame({
    ids,
    showMiddleFor: listKey,
    showRightFor: pressedId && pressedId === search.open ? pressedId : undefined,
    middle,
    right: {
      label: "Ban",
      showLabel: "Show the ban",
      content: openBan ? (
        <BanRecord key={openBan.id} row={openBan} onOpenAccount={openBan.account ? () => openAccount(openBan) : null} onChanged={refresh} />
      ) : (
        <EmptyRecord
          title="Ban"
          icon={<BanIcon aria-hidden />}
          line={page.bans.length ? "Click a ban to see it here." : "No account has been banned yet."}
          hideLabel="Hide the ban"
        />
      ),
    },
  })
}

/**
 * One ban on the right (Bans task, parts 10, 12 and 25), where its window
 * used to open: who and where, then the ban card with its picture, the
 * screen's words, the appeal, Clean up or Let it run again, and the phone's
 * last 20 actions before it. Open the account at the foot goes to the
 * account on the Projects dashboard, where its own history is.
 */
function BanRecord({
  row,
  onOpenAccount,
  onChanged,
}: {
  row: BanRow
  onOpenAccount: (() => void) | null
  onChanged: () => Promise<void>
}) {
  const name = banWho(row)

  async function runAgain() {
    if (!row.account) return
    try {
      await letRedditAccountRunAgain(row.account.id)
      await onChanged()
    } catch (failure) {
      showErrorToast(getRedditAccountsErrorMessage(failure))
    }
  }

  return (
    <RecordFrame
      avatar={<BanIcon aria-hidden />}
      title={name}
      line={`${appName(row.app)} · ${BAN_KIND_LABELS[row.kind]}`}
      hideLabel="Hide the ban"
      body={
        <>
          <PanelCard icon={<UserIcon />} storageId="promo-ban-account" title="The account" meta={appName(row.app)}>
            <DetailRows>
              <DetailRow label="Kind" value={BAN_KIND_LABELS[row.kind]} />
              <DetailRow label="When" value={formatDateTime(row.at)} />
              <DetailRow label="Phone or profile" value={row.phone ? row.phone.name : "Browser profile"} />
              <DetailRow label="Proxy or SIM" value={row.proxy ? row.proxy.label : row.simCarrier ? `SIM: ${row.simCarrier}` : "None"} />
              <DetailRow label="Age then" value={row.ageDays === null ? "Not known" : `${row.ageDays} days`} />
              <DetailRow label="Posts in the week before" value={row.postsWeek.toLocaleString()} />
              <DetailRow label="Seller" value={row.seller || "None"} />
              <DetailRow label="Project" value={row.project?.name ?? "None"} />
              <DetailRow label="Since" value={afterWords(row)} />
            </DetailRows>
            {row.counts ? null : <DetailNote>Recorded, not counted toward the brake or the phone being kept off the app.</DetailNote>}
          </PanelCard>
          <BanCard
            ban={{
              id: row.id,
              kind: row.kind,
              at: row.at,
              words: row.words,
              hasPicture: row.hasPicture,
              appealedAt: row.appeal?.at ?? null,
              appealNote: row.appeal?.note ?? "",
              appealAnswer: row.appeal?.answer ?? "",
            }}
            accountName={name}
            stopped={row.stopped}
            cleanUpHeldBack={row.cleanUpHeldBack}
            phoneId={row.phone?.id ?? null}
            accountId={row.account?.id ?? null}
            onRunAgain={row.account ? runAgain : null}
            onChanged={onChanged}
            showActionsBefore
          />
        </>
      }
      footer={
        <>
          <FooterState>
            <span className="text-muted-foreground">{formatDateTime(row.at)}</span>
          </FooterState>
          {onOpenAccount ? (
            <Button type="button" onClick={onOpenAccount}>
              Open the account
              <ArrowUpRightIcon />
            </Button>
          ) : null}
        </>
      }
    />
  )
}
