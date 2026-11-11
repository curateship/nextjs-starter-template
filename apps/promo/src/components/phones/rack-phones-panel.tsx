import * as React from "react"
import { BookmarkPlusIcon } from "lucide-react"

import { NewPhoneDropdown } from "@/components/phones/new-phone-dropdown"
import { PhoneJobsPanel } from "@/components/phones/phone-jobs-panel"
import { PhoneStatusText } from "@/components/phones/phone-status"
import { RackWall } from "@/components/phones/rack-wall"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { DashboardTabs } from "@/components/shared/dashboard-tabs"
import { FilterPopover } from "@/components/shared/filter-popover"
import { MassSelectChip, SelectedMenu, SelectedMenuRow, SelectedMenuSeparator } from "@/components/shared/mass-select"
import { SavedViewsControls, SaveViewDialog, type SavedViewsScreen } from "@/components/shared/saved-views"
import { SearchToggle } from "@/components/shared/search-toggle"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableGroupRow, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { changePhones, getPhoneErrorMessage, type BulkPhoneAction, type PhoneRecord, type RackPage } from "@/lib/api/phones/phones"
import type { SavedView } from "@/lib/api/saved-views"
import { bannedOnWords } from "@/lib/bans/options"
import { LABEL_DOT } from "@/lib/browser/sorting"
import { signedInWords } from "@/lib/browser/wording"
import { formatTimeAgo } from "@/lib/format/format-time"
import { PHONE_KIND_WORDS, PHONE_KINDS, PHONE_STATUS_WORDS, systemWords } from "@/lib/phones/options"
import {
  describeRackFilters,
  keptRackFilters,
  NO_GROUP,
  PHONE_STATUS_FILTERS,
  RACK_FILTER_KEYS,
  RACK_VIEW_KIND,
  rackFilterCount,
  readRackFilters,
  type RackSearch,
} from "@/lib/phones/rack-search"
import { carrierOf, rackRows } from "@/lib/phones/rack-rows"
import { appVersionWords, connectionWords, setupWarning } from "@/lib/phones/wording"
import { NETWORK_NAMES, NETWORKS, isNetwork } from "@/lib/social/networks"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

const ANY = "any"

/**
 * The middle panel of a rack's page: the rack's phones (Racks dashboard,
 * parts 95 to 105; Tyler, 5 Nov 2026: "middle phones (header create new
 * phone)"). The header holds the Phones, Wall and Jobs tabs, then, as the UI
 * standard orders them: "N selected" while phones are ticked, Mass select,
 * the search, Filter, Views and New phone.
 *
 * Filter is the shell's popover with a row per filter and the Group row, then
 * Clear and Save as view; Views shows the picked view's name in the moving
 * rainbow edge (Tyler, 5 Nov 2026: "Use the ui standard filter and save
 * filter feature with saved filter rainbow button"). Every filter lives in
 * the address, so a view is the same as picking the filters by hand.
 *
 * The list sorts by shelf slot, so it reads like the shelf. Its columns fold
 * by the panel's own width, not the window's (part 101).
 */
export function RackPhonesPanel({
  page,
  search,
  views,
  onSearch,
  onOpen,
  onChanged,
}: {
  page: RackPage
  search: RackSearch
  views: SavedView[]
  onSearch: (patch: Partial<RackSearch>) => void
  onOpen: (phoneId: string) => void
  onChanged: () => Promise<void>
}) {
  const [selecting, setSelecting] = React.useState(false)
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [filterOpen, setFilterOpen] = React.useState(false)
  const [savingView, setSavingView] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [tag, setTag] = React.useState("")
  const groups = rackRows(page, search)
  const shownCount = groups.reduce((sum, group) => sum + group.phones.length, 0)
  const list = search.list ?? "phones"

  const here: SavedViewsScreen = {
    screen: `${RACK_VIEW_KIND}:${page.rack.id}`,
    describe: (filters, names) => describeRackFilters(filters, names),
    kept: (filters) => keptRackFilters(filters),
  }
  const viewFilters = keptRackFilters(search)

  // The carriers and projects seen on the phones. A value in the address that
  // is not among them stays as an option, so a filter never changes on its own.
  const carriers = React.useMemo(() => {
    const seen = new Set(page.phones.map(carrierOf).filter(Boolean))
    if (search.carrier) seen.add(search.carrier)
    return [...seen].sort((a, b) => a.localeCompare(b))
  }, [page.phones, search.carrier])
  const tags = React.useMemo(() => {
    const seen = new Set(page.phones.flatMap((phone) => phone.tags))
    if (search.tag) seen.add(search.tag)
    return [...seen].sort((a, b) => a.localeCompare(b))
  }, [page.phones, search.tag])

  async function bulk(action: BulkPhoneAction) {
    setBusy(true)
    dismissErrorToast()
    try {
      await changePhones(action)
      await onChanged()
    } catch (error) {
      showErrorToast(getPhoneErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  const ids = [...selected]

  return (
    <div className="@container flex min-h-0 flex-1 flex-col">
      <DashboardCardHeader className="group/title">
        <DashboardTabs
          value={list}
          onValueChange={(next) => onSearch({ list: next === "phones" ? undefined : (next as RackSearch["list"]) })}
          tabs={[
            { value: "phones", label: "Phones", count: shownCount },
            { value: "wall", label: "Wall" },
            { value: "jobs", label: "Jobs" },
          ]}
        />
        <div className="flex shrink-0 items-center gap-1">
          {selected.size ? (
            <SelectedMenu
              count={selected.size}
              busy={busy}
              onClear={() => setSelected(new Set())}
              main={(menu) => (
                <>
                  <SelectedMenuRow
                    onClick={() => {
                      menu.close()
                      void bulk({ action: "hold", ids, held: true })
                    }}
                  >
                    Hold
                  </SelectedMenuRow>
                  <SelectedMenuRow
                    onClick={() => {
                      menu.close()
                      void bulk({ action: "hold", ids, held: false })
                    }}
                  >
                    Release
                  </SelectedMenuRow>
                  <SelectedMenuRow page="folder" onClick={() => menu.step("folder")}>
                    Move to folder
                  </SelectedMenuRow>
                  <SelectedMenuRow page="label" onClick={() => menu.step("label")}>
                    Set label
                  </SelectedMenuRow>
                  <SelectedMenuRow page="tag" onClick={() => menu.step("tag")}>
                    Add tag
                  </SelectedMenuRow>
                </>
              )}
              pages={{
                folder: {
                  title: "Move to folder",
                  content: (menu) => (
                    <>
                      {[{ id: null, name: "No folder" }, ...page.folders].map((folder) => (
                        <SelectedMenuRow
                          key={folder.id ?? "none"}
                          onClick={() => {
                            menu.close()
                            void bulk({ action: "folder", ids, folderId: folder.id })
                          }}
                        >
                          {folder.name}
                        </SelectedMenuRow>
                      ))}
                    </>
                  ),
                },
                label: {
                  title: "Set label",
                  content: (menu) => (
                    <>
                      {[{ id: null, name: "No label", color: "" }, ...page.labels].map((label) => (
                        <SelectedMenuRow
                          key={label.id ?? "none"}
                          onClick={() => {
                            menu.close()
                            void bulk({ action: "label", ids, labelId: label.id })
                          }}
                        >
                          {label.id ? <span aria-hidden className={`size-1.5 rounded-full ${LABEL_DOT[label.color] ?? LABEL_DOT.slate}`} /> : null}
                          {label.name}
                        </SelectedMenuRow>
                      ))}
                    </>
                  ),
                },
                tag: {
                  title: "Add tag",
                  content: (menu) => (
                    <form
                      className="grid gap-2 p-1.5"
                      onSubmit={(event) => {
                        event.preventDefault()
                        if (!tag.trim()) {
                          showErrorToast("A tag needs a word in it.")
                          return
                        }
                        menu.close()
                        void bulk({ action: "tag", ids, tag }).then(() => setTag(""))
                      }}
                    >
                      <Label htmlFor="rack-bulk-tag" className="sr-only">
                        Tag
                      </Label>
                      <Input id="rack-bulk-tag" value={tag} placeholder="important" onChange={(event) => setTag(event.target.value)} />
                      <SelectedMenuSeparator />
                      <Button type="submit" size="sm">
                        Add tag
                      </Button>
                    </form>
                  ),
                },
              }}
            />
          ) : null}
          {list === "phones" ? (
            <MassSelectChip
              on={selecting}
              onToggle={() => {
                if (selecting) setSelected(new Set())
                setSelecting(!selecting)
              }}
            />
          ) : null}
          <SearchToggle
            name="rack-phone-search"
            label="Search phones"
            placeholder="Search phones…"
            value={search.q ?? ""}
            onChange={(q) => onSearch({ q: q || undefined, list: undefined })}
          />
          <FilterPopover
            count={rackFilterCount(search)}
            open={filterOpen}
            onOpenChange={setFilterOpen}
            onClear={() =>
              onSearch(Object.fromEntries(RACK_FILTER_KEYS.filter((key) => key !== "q" && key !== "group").map((key) => [key, undefined])))
            }
            save={
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (!Object.keys(viewFilters).length) {
                    showErrorToast("Search or pick a filter first, then save it as a view.")
                    return
                  }
                  setFilterOpen(false)
                  setSavingView(true)
                }}
              >
                <BookmarkPlusIcon className="size-4" />
                Save as view
              </Button>
            }
          >
            <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
              <FilterRow
                id="rack-filter-status"
                label="Status"
                value={search.status}
                anyLabel="Every status"
                options={PHONE_STATUS_FILTERS.map((status) => [status, PHONE_STATUS_WORDS[status]])}
                onChange={(status) => onSearch({ status: readRackFilters({ status }).status })}
              />
              <FilterRow
                id="rack-filter-kind"
                label="Kind"
                value={search.kind}
                anyLabel="Every kind"
                options={PHONE_KINDS.map((kind) => [kind, PHONE_KIND_WORDS[kind]])}
                onChange={(kind) => onSearch({ kind: readRackFilters({ kind }).kind })}
              />
              <FilterRow
                id="rack-filter-carrier"
                label="Carrier"
                value={search.carrier}
                anyLabel="Every carrier"
                options={carriers.map((carrier) => [carrier, carrier])}
                onChange={(carrier) => onSearch({ carrier })}
              />
              <FilterRow
                id="rack-filter-project"
                label="Project"
                value={search.project}
                anyLabel="Every project"
                options={[
                  ...page.projects.map((project): [string, string] => [project.id, project.name]),
                  ...(search.project && !page.projects.some((project) => project.id === search.project)
                    ? [[search.project, "A project no longer here"] as [string, string]]
                    : []),
                ]}
                onChange={(project) => onSearch({ project })}
              />
              <FilterRow
                id="rack-filter-banned"
                label="Banned on"
                value={search.banned}
                anyLabel="Any app or none"
                options={NETWORKS.map((network) => [network, NETWORK_NAMES[network]])}
                onChange={(banned) => onSearch({ banned: isNetwork(banned) ? banned : undefined })}
              />
              <FilterRow
                id="rack-filter-wipe"
                label="Wiping"
                value={search.wipe}
                anyLabel="Every phone"
                options={[["needed", "Needs wiping"]]}
                onChange={(wipe) => onSearch({ wipe: wipe === "needed" ? "needed" : undefined })}
              />
              <FilterRow
                id="rack-filter-folder"
                label="Folder"
                value={search.folder}
                anyLabel="Every folder"
                options={[[NO_GROUP, "No folder"], ...page.folders.map((folder): [string, string] => [folder.id, folder.name])]}
                onChange={(folder) => onSearch({ folder })}
              />
              <FilterRow
                id="rack-filter-label"
                label="Label"
                value={search.label}
                anyLabel="Every label"
                options={[[NO_GROUP, "No label"], ...page.labels.map((label): [string, string] => [label.id, label.name])]}
                onChange={(label) => onSearch({ label })}
              />
              {tags.length ? (
                <FilterRow
                  id="rack-filter-tag"
                  label="Tag"
                  value={search.tag}
                  anyLabel="Every tag"
                  options={tags.map((one) => [one, `#${one}`])}
                  onChange={(one) => onSearch({ tag: one })}
                />
              ) : null}
              <FilterRow
                id="rack-filter-group"
                label="Group"
                value={search.group}
                anyLabel="No groups"
                options={[
                  ["status", "By status"],
                  ["kind", "By kind"],
                ]}
                onChange={(group) => onSearch({ group: readRackFilters({ group }).group })}
              />
            </div>
          </FilterPopover>
          <SavedViewsControls
            here={here}
            views={views}
            filters={viewFilters}
            saveButton={false}
            buttonVariant="ghost"
            onOpen={(saved) =>
              onSearch({
                ...Object.fromEntries(RACK_FILTER_KEYS.map((key) => [key, undefined])),
                ...readRackFilters(saved.filters),
                list: undefined,
              })
            }
            onClose={() => onSearch(Object.fromEntries(RACK_FILTER_KEYS.map((key) => [key, undefined])))}
          />
          <NewPhoneDropdown
            rackId={page.rack.id}
            onCreated={async (phoneId) => {
              await onChanged()
              onOpen(phoneId)
            }}
          />
        </div>
      </DashboardCardHeader>

      {list === "wall" ? (
        <ScrollArea className="min-h-0 flex-1">
          <div className="p-3">
            <RackWall rackId={page.rack.id} onOpenScreen={(phoneId) => onOpen(phoneId)} />
          </div>
        </ScrollArea>
      ) : list === "jobs" ? (
        <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
          <PhoneJobsPanel rackId={page.rack.id} flush />
        </ScrollArea>
      ) : !page.phones.length ? (
        <p className="p-4 text-sm text-muted-foreground">
          No phones on this rack yet. Plug a phone into this rack, or add one with New phone.
        </p>
      ) : (
        <PhoneRows
          groups={groups}
          page={page}
          openId={search.open}
          selecting={selecting}
          selected={selected}
          onSelected={setSelected}
          onOpen={(phoneId) => onOpen(phoneId)}
        />
      )}

      <SaveViewDialog open={savingView} here={here} filters={viewFilters} onClose={() => setSavingView(false)} />
    </div>
  )
}

/**
 * The phones as a table: the slot first, then the phone with its model,
 * accounts, app versions and amber setup line, its status, carrier and when
 * the rack last saw it. The columns fold by the panel's own width (part 101):
 * below 768px of panel the account moves under the name and the carrier and
 * last seen go; last seen shows from 1024px.
 */
function PhoneRows({
  groups,
  page,
  openId,
  selecting,
  selected,
  onSelected,
  onOpen,
}: {
  groups: Array<{ group: string; phones: PhoneRecord[] }>
  page: RackPage
  openId: string | undefined
  selecting: boolean
  selected: Set<string>
  onSelected: (next: Set<string>) => void
  onOpen: (phoneId: string) => void
}) {
  const shown = groups.flatMap((group) => group.phones)
  if (!shown.length) return <p className="p-4 text-sm text-muted-foreground">No phones match that.</p>
  const label = (id: string | null) => page.labels.find((one) => one.id === id)
  const folderName = (id: string | null) => page.folders.find((folder) => folder.id === id)?.name
  const allTicked = shown.every((phone) => selected.has(phone.id))
  const someTicked = shown.some((phone) => selected.has(phone.id))
  const columns = (selecting ? 1 : 0) + 6
  const toggle = (phoneId: string) => {
    const next = new Set(selected)
    if (next.has(phoneId)) next.delete(phoneId)
    else next.add(phoneId)
    onSelected(next)
  }

  return (
    <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
      <Table containerClassName="overflow-visible">
        <TableHeader>
          <TableRow>
            {selecting ? (
              <TableHead column="select">
                <Checkbox
                  checked={allTicked ? true : someTicked ? "indeterminate" : false}
                  onCheckedChange={() => onSelected(allTicked ? new Set() : new Set(shown.map((phone) => phone.id)))}
                  aria-label="Select every phone shown"
                />
              </TableHead>
            ) : null}
            <TableHead column="meta" className="w-12">
              Slot
            </TableHead>
            <TableHead column="main">Phone</TableHead>
            <TableHead column="meta" className="hidden @3xl:table-cell">
              Account
            </TableHead>
            <TableHead column="meta">Status</TableHead>
            <TableHead column="meta" className="hidden @3xl:table-cell">
              Carrier
            </TableHead>
            <TableHead column="meta" className="hidden @5xl:table-cell">
              Last seen
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => (
            <React.Fragment key={group.group || "all"}>
              {group.group ? <TableGroupRow label={`${group.group} · ${group.phones.length}`} colSpan={columns} /> : null}
              {group.phones.map((phone) => {
                const phoneLabel = label(phone.labelId)
                const banned = bannedOnWords(phone.bannedOn)
                const warning = setupWarning(phone)
                return (
                  <TableRow
                    key={phone.id}
                    className={cn("group", phone.id === openId && "bg-accent hover:bg-accent")}
                    aria-selected={phone.id === openId}
                    rowAction={() => (selecting ? toggle(phone.id) : onOpen(phone.id))}
                  >
                    {selecting ? (
                      <TableCell column="select">
                        <Checkbox checked={selected.has(phone.id)} onCheckedChange={() => toggle(phone.id)} aria-label={`Select ${phone.name}`} />
                      </TableCell>
                    ) : null}
                    <TableCell column="meta" className="text-sm text-muted-foreground tabular-nums">
                      {phone.shelfSlot.trim() || "–"}
                    </TableCell>
                    <TableCell column="main" className="max-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <button
                          type="button"
                          className="truncate text-left text-sm font-medium group-hover:underline"
                          onClick={() => (selecting ? toggle(phone.id) : onOpen(phone.id))}
                        >
                          {phone.name}
                        </button>
                        {phoneLabel ? (
                          <Badge variant="outline" className="gap-1.5">
                            <span className={`size-1.5 rounded-full ${LABEL_DOT[phoneLabel.color] ?? LABEL_DOT.slate}`} />
                            {phoneLabel.name}
                          </Badge>
                        ) : null}
                      </div>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[phone.model, systemWords(phone.kind, phone.androidVersion), folderName(phone.folderId), ...phone.tags.map((one) => `#${one}`)]
                          .filter(Boolean)
                          .join(" · ") || "No model read yet"}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground @3xl:hidden">
                        {phone.accounts.length ? phone.accounts.map(signedInWords).join(", ") : "No account on it"}
                      </span>
                      {banned ? <span className="block truncate text-xs text-destructive @3xl:hidden">Banned on: {banned}</span> : null}
                      <span className="block truncate text-xs text-muted-foreground">
                        {phone.id === page.testPhoneId || phone.id === page.testPhoneIphoneId ? "Self-test phone · " : ""}
                        {appVersionWords(phone)}
                      </span>
                      {warning ? <span className="block truncate text-xs text-amber-600 dark:text-amber-400">{warning}</span> : null}
                    </TableCell>
                    <TableCell column="meta" className="hidden text-sm @3xl:table-cell">
                      {phone.accounts.length ? (
                        <span className="grid">
                          {phone.accounts.map((account) => (
                            <span key={account.id}>{signedInWords(account)}</span>
                          ))}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Nobody</span>
                      )}
                      {banned ? <span className="block text-xs text-destructive">Banned on: {banned}</span> : null}
                    </TableCell>
                    <TableCell column="meta" className="text-sm">
                      <PhoneStatusText phone={{ ...phone, shelfSlot: "" }} />
                    </TableCell>
                    <TableCell column="meta" className="hidden max-w-48 text-sm @3xl:table-cell">
                      <span className="line-clamp-2">{connectionWords(phone)}</span>
                    </TableCell>
                    <TableCell column="meta" className="hidden text-sm text-muted-foreground @5xl:table-cell">
                      {phone.lastSeenAt ? formatTimeAgo(phone.lastSeenAt) : "Never"}
                    </TableCell>
                  </TableRow>
                )
              })}
            </React.Fragment>
          ))}
        </TableBody>
      </Table>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}

function FilterRow({
  id,
  label,
  value,
  anyLabel,
  options,
  onChange,
}: {
  id: string
  label: string
  value: string | undefined
  anyLabel: string
  options: [string, string][]
  onChange: (value: string | undefined) => void
}) {
  return (
    <>
      <Label htmlFor={id}>{label}</Label>
      <Select value={value ?? ANY} onValueChange={(next) => onChange(next === ANY ? undefined : next)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{anyLabel}</SelectItem>
          {options.map(([optionValue, optionLabel]) => (
            <SelectItem key={optionValue} value={optionValue}>
              {optionLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  )
}
