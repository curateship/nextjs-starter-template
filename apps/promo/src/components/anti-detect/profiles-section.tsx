import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import {
  CopyIcon,
  FolderCogIcon,
  FolderIcon,
  Loader2Icon,
  MonitorIcon,
  PlusIcon,
  SquareIcon,
  TagIcon,
  Trash2Icon,
} from "lucide-react"

import { ProfileRecord } from "@/components/anti-detect/profile-record"
import { BrowserWindowDialog } from "@/components/browser/browser-window-dialog"
import { ProfileDialog } from "@/components/browser/profile-dialog"
import { ProfileGroupsDialog } from "@/components/browser/profile-groups-dialog"
import { ProxyTestBadge } from "@/components/browser/proxy-test-badge"
import type { CrmFrame } from "@/components/crm/crm-frame"
import { CrmListHeader, CrmRowMenu, type RowMenuItem } from "@/components/crm/crm-row"
import { Chip, CrmTable, CrmTableRow, MainCell } from "@/components/crm/crm-table"
import { EmptyRecord } from "@/components/crm/record-frame"
import { FilterPick } from "@/components/dashboard-page/filter-pick"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { FilterPopover } from "@/components/shared/filter-popover"
import { SelectedMenu, SelectedMenuRow, SelectedMenuSeparator } from "@/components/shared/mass-select"
import { MiddleHeading, PanelReopenButton } from "@/components/shared/three-panels"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TableCell } from "@/components/ui/table"
import type { ProjectReach } from "@/lib/anti-detect/project-reach"
import { browserWords } from "@/lib/anti-detect/rows"
import { NO_GROUP, type AntiDetectSearch } from "@/lib/anti-detect/search"
import {
  changeProfiles,
  copyProfile,
  getProfileErrorMessage,
  loadProfilesPage,
  profileJob,
  removeProfiles,
  type BulkProfileAction,
  type ProfileRow,
  type ProfilesPage,
} from "@/lib/api/browser/profiles"
import { LABEL_DOT } from "@/lib/browser/sorting"
import { deleteSignOutWords, signedInWords } from "@/lib/browser/wording"
import { formatTimeAgo } from "@/lib/format/format-time"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useSelection } from "@/lib/hooks/use-selection"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { useListSearchNavigate, useOpenRecord } from "@/lib/nav/list-search"
import { showErrorToast } from "@/lib/toast/error-toast"

type Column = "name" | "proxy" | "browser" | "accounts" | "lastRan"

const BROWSER_ORDER = { open: 0, opening: 1, stopped: 2 } as const

function compare(a: ProfileRow, b: ProfileRow, column: Column): number {
  switch (column) {
    case "proxy":
      return (a.proxy?.label ?? "").localeCompare(b.proxy?.label ?? "")
    case "browser":
      return BROWSER_ORDER[a.browser] - BROWSER_ORDER[b.browser]
    case "accounts":
      return a.accounts.length - b.accounts.length
    case "lastRan":
      return (a.lastRanAt ? new Date(a.lastRanAt).getTime() : 0) - (b.lastRanAt ? new Date(b.lastRanAt).getTime() : 0)
    default:
      return a.name.localeCompare(b.name)
  }
}

/** How often the list is read again while a browser is opening or closing. */
const POLL_MS = 2_000

/**
 * The Anti Detect dashboard's Profiles (Tyler, 12 Nov 2026), where the
 * Browser profiles screen used to be: every isolated browser with its proxy,
 * whether it is open, who is signed in inside it and when it last ran, in
 * the dashboard's one header and table shape.
 *
 * - **Header:** search, Select, Filter (Folder, Label, Tag), New profile; its
 *   ⋮ holds Folders and labels. Ticked rows move to a folder, take a label or
 *   a tag, or are deleted.
 * - **A row** opens the profile on the right (`ProfileRecord`). Its actions
 *   column opens the browser, or shows it while it runs, and has the bin;
 *   its right-click menu adds Stop and Duplicate.
 * - The live browser, Folders and labels and a new profile stay windows.
 *
 * Open and Stop write a job for the browser program, and the rows follow
 * what it saves: the list is read again every two seconds while a browser
 * opens, closes, is checked or backed up.
 */
export function ProfilesSection({
  initial,
  search,
  reach,
  frame,
}: {
  initial: ProfilesPage
  search: AntiDetectSearch
  /** The project picked in the Projects block: only the profiles its accounts use. */
  reach: ProjectReach | null
  frame: CrmFrame
}) {
  const router = useRouter()
  const setListSearch = useListSearchNavigate()
  const setOpen = useOpenRecord()
  // Its own copy, read again while a browser changes; a new read of the route replaces it.
  const [page, setPage] = useSyncedDraft(initial)
  const [error, setError] = React.useState<string | null>(null)
  const profiles = page.profiles
  const q = search.q ?? ""

  const [sort, setSort] = React.useState<Column>("name")
  const [direction, setDirection] = React.useState<"asc" | "desc">("asc")
  const toggleSort = (column: Column) => {
    if (column === sort) setDirection(direction === "asc" ? "desc" : "asc")
    else {
      setSort(column)
      setDirection(column === "lastRan" ? "desc" : "asc")
    }
  }
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const [massSelect, setMassSelect] = React.useState(false)
  const selection = useSelection()
  const [busy, setBusy] = React.useState(false)
  const [creating, setCreating] = React.useState(false)
  const [groupsOpen, setGroupsOpen] = React.useState(false)
  const [windowFor, setWindowFor] = React.useState<string | null>(null)
  const [deleteTargets, setDeleteTargets] = React.useState<ProfileRow[]>([])
  const [tagging, setTagging] = React.useState(false)
  const [tagText, setTagText] = React.useState("")

  /** Reads the profiles again; `everywhere` also reads the route, so the left page's counts and Overview follow. */
  const refresh = React.useCallback(
    async (everywhere = true) => {
      try {
        setPage(await loadProfilesPage())
        setError(null)
        if (everywhere) void router.invalidate()
      } catch (failure) {
        setError(getProfileErrorMessage(failure))
      }
    },
    [router, setPage]
  )

  // A browser takes a minute to open and a close waits its turn, so the list
  // is read again every two seconds until nothing is changing.
  const changing = profiles.some(
    (profile) => profile.browser === "opening" || profile.closing || profile.checking || profile.siteChecking || profile.backingUp
  )
  React.useEffect(() => {
    if (!changing) return
    const timer = setInterval(() => void refresh(false), POLL_MS)
    return () => clearInterval(timer)
  }, [changing, refresh])

  const tags = React.useMemo(
    () => Array.from(new Set(profiles.flatMap((profile) => profile.tags))).sort((a, b) => a.localeCompare(b)),
    [profiles]
  )
  const folderName = (id: string | null) => page.folders.find((folder) => folder.id === id)?.name
  const labelOf = (id: string | null) => page.labels.find((one) => one.id === id)

  const rows = React.useMemo(() => {
    const needle = q.trim().toLowerCase()
    const sign = direction === "asc" ? 1 : -1
    return profiles
      .filter((profile) => !reach || reach.profiles.has(profile.id))
      .filter((profile) => {
        if (search.folder && (search.folder === NO_GROUP ? profile.folderId : profile.folderId !== search.folder)) return false
        if (search.label && (search.label === NO_GROUP ? profile.labelId : profile.labelId !== search.label)) return false
        if (search.tag && !profile.tags.includes(search.tag)) return false
        if (!needle) return true
        return (
          profile.name.toLowerCase().includes(needle) ||
          profile.notes.toLowerCase().includes(needle) ||
          profile.tags.some((tag) => tag.toLowerCase().includes(needle)) ||
          profile.accounts.some((account) => account.handle.toLowerCase().includes(needle))
        )
      })
      .sort((a, b) => sign * compare(a, b, sort) || a.name.localeCompare(b.name))
  }, [direction, profiles, q, reach, search.folder, search.label, search.tag, sort])
  const ids = rows.map((profile) => profile.id)
  const openId = search.open
  const openProfile = profiles.find((profile) => profile.id === openId) ?? null

  // The right panel is never left empty: a filter that leaves the open
  // profile out of the list opens the list's first row instead.
  const firstId = rows[0]?.id
  const openInList = Boolean(openId && rows.some((profile) => profile.id === openId))
  React.useEffect(() => {
    if (firstId && !openInList) setListSearch({ open: firstId })
  }, [firstId, openInList, setListSearch])
  const [pressedId, setPressedId] = React.useState<string>()
  const pick = (id: string) => {
    setPressedId(id)
    setOpen(id)
  }

  const listKey = `${q}|${search.folder}|${search.label}|${search.tag}|${reach ? [...reach.profiles].join(",") : ""}`
  useClearSelectionOnListChange(selection.setSelected, listKey)
  const selected = profiles.filter((profile) => selection.selected.has(profile.id))
  const selectedIds = selected.map((profile) => profile.id)
  const toggleMassSelect = (tickId?: string) => {
    if (massSelect) {
      selection.clear()
      setMassSelect(false)
      return
    }
    setMassSelect(true)
    if (tickId) selection.setSelected(new Set([tickId]))
  }

  async function openBrowser(profile: ProfileRow) {
    // The job is written before the window opens, so the window's first read
    // already says "opening" rather than "not running".
    try {
      if (profile.browser === "stopped") await profileJob(profile.id, "open")
      setWindowFor(profile.id)
      await refresh()
    } catch (failure) {
      showErrorToast(getProfileErrorMessage(failure))
    }
  }

  async function stopBrowser(profile: ProfileRow) {
    try {
      await profileJob(profile.id, "close")
      await refresh()
    } catch (failure) {
      showErrorToast(getProfileErrorMessage(failure))
    }
  }

  async function restart(profile: ProfileRow) {
    try {
      await profileJob(profile.id, "restart")
      await refresh()
    } catch (failure) {
      showErrorToast(getProfileErrorMessage(failure))
    }
  }

  async function bulk(action: BulkProfileAction) {
    setBusy(true)
    try {
      await changeProfiles(action)
      await refresh()
      return true
    } catch (failure) {
      showErrorToast(getProfileErrorMessage(failure))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function remove(targets: ProfileRow[]) {
    setBusy(true)
    try {
      const { kept } = await removeProfiles(targets.map((profile) => profile.id))
      if (kept.length) {
        showErrorToast(
          kept.map((one) => `${one.name} was kept: ${one.reason.replace(/\.$/, "")}.`).join(" ") +
            (kept.some((one) => one.reason === "its browser is open") ? " Stop its browser first." : "")
        )
      }
      selection.setSelected(new Set(kept.map((one) => one.id)))
      setDeleteTargets([])
      await refresh()
    } catch (failure) {
      showErrorToast(getProfileErrorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  async function duplicate(profile: ProfileRow) {
    try {
      const { id } = await copyProfile(profile.id)
      await refresh()
      pick(id)
    } catch (failure) {
      showErrorToast(getProfileErrorMessage(failure))
    }
  }

  /** What a profile can do, for its right-click menu and its ⋮ on the right. */
  const actionsFor = (profile: ProfileRow): RowMenuItem[] => [
    profile.browser === "stopped"
      ? { label: "Open the browser", icon: <MonitorIcon className="size-4" />, onSelect: () => void openBrowser(profile) }
      : { label: "Show the browser", icon: <MonitorIcon className="size-4" />, onSelect: () => setWindowFor(profile.id) },
    ...(profile.browser !== "stopped" && !profile.closing
      ? [{ label: "Stop the browser", icon: <SquareIcon className="size-4" />, onSelect: () => void stopBrowser(profile) }]
      : []),
    { label: "Duplicate", icon: <CopyIcon className="size-4" />, onSelect: () => void duplicate(profile) },
    { label: "Delete", icon: <Trash2Icon className="size-4" />, destructive: true, onSelect: () => setDeleteTargets([profile]) },
  ]

  const signedOut = deleteSignOutWords(deleteTargets.flatMap((profile) => profile.accounts))
  const groupOptions = (list: { id: string; name: string }[], none: string): [string, string][] => [
    [NO_GROUP, none],
    ...list.map((one): [string, string] => [one.id, one.name]),
  ]
  const filterCount = [search.folder, search.label, search.tag].filter(Boolean).length

  const middle = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <CrmListHeader
        tabs={<MiddleHeading icon={MonitorIcon} label="Profiles" />}
        end={<PanelReopenButton side="right" label="Show the profile" />}
        selected={
          massSelect && selected.length ? (
            <SelectedMenu
              count={selected.length}
              busy={busy}
              onClear={selection.clear}
              pages={{
                folder: {
                  title: "Move to folder",
                  content: (menu) => (
                    <>
                      {page.folders.map((folder) => (
                        <SelectedMenuRow
                          key={folder.id}
                          onClick={() => {
                            menu.close()
                            void bulk({ action: "folder", ids: selectedIds, folderId: folder.id })
                          }}
                        >
                          {folder.name}
                        </SelectedMenuRow>
                      ))}
                      {page.folders.length ? <SelectedMenuSeparator /> : null}
                      <SelectedMenuRow
                        onClick={() => {
                          menu.close()
                          void bulk({ action: "folder", ids: selectedIds, folderId: null })
                        }}
                      >
                        No folder
                      </SelectedMenuRow>
                    </>
                  ),
                },
                label: {
                  title: "Set label",
                  content: (menu) => (
                    <>
                      {page.labels.map((one) => (
                        <SelectedMenuRow
                          key={one.id}
                          onClick={() => {
                            menu.close()
                            void bulk({ action: "label", ids: selectedIds, labelId: one.id })
                          }}
                        >
                          <span aria-hidden className={`size-2 rounded-full ${LABEL_DOT[one.color] ?? LABEL_DOT.slate}`} />
                          {one.name}
                        </SelectedMenuRow>
                      ))}
                      {page.labels.length ? <SelectedMenuSeparator /> : null}
                      <SelectedMenuRow
                        onClick={() => {
                          menu.close()
                          void bulk({ action: "label", ids: selectedIds, labelId: null })
                        }}
                      >
                        No label
                      </SelectedMenuRow>
                    </>
                  ),
                },
              }}
              main={(menu) => (
                <>
                  <SelectedMenuRow page="folder" onClick={() => menu.step("folder")}>
                    <FolderIcon className="size-4 text-muted-foreground" />
                    Move to folder
                  </SelectedMenuRow>
                  <SelectedMenuRow page="label" onClick={() => menu.step("label")}>
                    <TagIcon className="size-4 text-muted-foreground" />
                    Set label
                  </SelectedMenuRow>
                  <SelectedMenuRow
                    onClick={() => {
                      menu.close()
                      setTagging(true)
                    }}
                  >
                    <TagIcon className="size-4 text-muted-foreground" />
                    Add tag
                  </SelectedMenuRow>
                  <SelectedMenuRow
                    className="text-destructive"
                    onClick={() => {
                      menu.close()
                      setDeleteTargets(selected)
                    }}
                  >
                    <Trash2Icon className="size-4" />
                    Delete
                  </SelectedMenuRow>
                </>
              )}
            />
          ) : null
        }
        menuLabel="More for profiles"
        menuItems={[{ label: "Folders and labels", icon: <FolderCogIcon className="size-4" />, onClick: () => setGroupsOpen(true) }]}
        search={{
          name: "profile-search",
          label: "Search profiles by name, notes, tag or who is signed in",
          placeholder: "Search profiles",
          value: q,
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined }),
        }}
        massSelect={{ on: massSelect, onToggle: () => toggleMassSelect() }}
        filter={
          <FilterPopover
            count={filterCount}
            onClear={() => setListSearch({ folder: undefined, label: undefined, tag: undefined })}
            save={null}
            contentClassName="w-60"
          >
            <FilterPick
              id="profiles-folder"
              label="Folder"
              value={search.folder}
              any="All folders"
              options={groupOptions(page.folders, "No folder")}
              onChange={(folder) => setListSearch({ folder })}
            />
            <FilterPick
              id="profiles-label"
              label="Label"
              value={search.label}
              any="All labels"
              options={groupOptions(page.labels, "No label")}
              onChange={(label) => setListSearch({ label })}
            />
            {tags.length ? (
              <FilterPick
                id="profiles-tag"
                label="Tag"
                value={search.tag}
                any="All tags"
                options={tags.map((tag) => [tag, tag])}
                onChange={(tag) => setListSearch({ tag })}
              />
            ) : null}
          </FilterPopover>
        }
        primary={
          <DashboardToolbarButton type="button" onClick={() => setCreating(true)}>
            <PlusIcon className="size-4" />
            <span className="@max-3xl:sr-only">New profile</span>
          </DashboardToolbarButton>
        }
      />
      {error ? (
        <div className="px-6 py-3">
          <ErrorRow message={error} onRetry={() => void refresh()} />
        </div>
      ) : null}
      <CrmTable<Column>
        columns={[
          { key: "name", label: "Profile", column: "main", className: "min-w-40" },
          { key: "proxy", label: "Proxy", column: "meta", className: "hidden md:hidden @xl:table-cell" },
          { key: "browser", label: "Browser", column: "meta", className: "hidden md:hidden @lg:table-cell" },
          { key: "accounts", label: "Signed in", column: "meta", className: "hidden md:hidden @3xl:table-cell" },
          { key: "lastRan", label: "Last ran", column: "preview", className: "hidden md:hidden @4xl:table-cell" },
        ]}
        sort={sort}
        direction={direction}
        onSort={toggleSort}
        actions
        select={
          massSelect
            ? {
                noun: "profiles",
                disabled: ids.length === 0,
                checked: selection.selectAllState(ids),
                onToggle: () => selection.toggleVisible(ids),
              }
            : null
        }
        empty={
          rows.length > 0
            ? null
            : profiles.length
              ? "No profiles match that."
              : "No browser profiles yet. Make one with New profile, give it a proxy, and pick it for an account."
        }
      >
        {rows.map((profile) => {
          const label = labelOf(profile.labelId)
          const folder = folderName(profile.folderId)
          return (
            <CrmTableRow
              key={profile.id}
              open={profile.id === openId}
              label={profile.name}
              tick={{ shown: massSelect, ticked: selection.selected.has(profile.id), onToggle: () => selection.toggle(profile.id) }}
              onOpen={() => pick(profile.id)}
              cog={
                profile.browser === "stopped"
                  ? { label: `Open the browser of ${profile.name}`, icon: <MonitorIcon className="size-4" />, onPress: () => void openBrowser(profile) }
                  : { label: `Show the browser of ${profile.name}`, icon: <MonitorIcon className="size-4" />, onPress: () => setWindowFor(profile.id) }
              }
              onDelete={() => setDeleteTargets([profile])}
              onRightClick={(x, y) => setRightClick({ id: profile.id, x, y })}
            >
              <MainCell name={profile.name}>
                {label ? (
                  <Chip className="shrink-0 gap-1.5 whitespace-nowrap">
                    <span aria-hidden className={`size-1.5 rounded-full ${LABEL_DOT[label.color] ?? LABEL_DOT.slate}`} />
                    {label.name}
                  </Chip>
                ) : null}
                {folder ? <Chip muted className="hidden shrink-0 whitespace-nowrap @2xl:inline-flex">{folder}</Chip> : null}
              </MainCell>
              <TableCell column="meta" className="hidden max-w-48 md:hidden @xl:table-cell">
                {profile.proxy ? (
                  <span className="grid min-w-0 gap-0.5">
                    <span className="truncate text-sm">{profile.proxy.label || profile.proxy.host}</span>
                    <ProxyTestBadge result={profile.proxy.lastTestResult} compact />
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">This computer</span>
                )}
              </TableCell>
              <TableCell column="meta" className="hidden text-sm whitespace-nowrap md:hidden @lg:table-cell">
                {profile.closing || profile.browser === "opening" ? (
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <Loader2Icon className="size-3.5 animate-spin" />
                    {browserWords(profile)}
                  </span>
                ) : (
                  <span className={profile.browser === "open" ? undefined : "text-muted-foreground"}>{browserWords(profile)}</span>
                )}
              </TableCell>
              <TableCell column="meta" className="hidden max-w-48 text-sm md:hidden @3xl:table-cell">
                {profile.accounts.length ? (
                  <span className="block truncate">{profile.accounts.map(signedInWords).join(", ")}</span>
                ) : (
                  <span className="text-muted-foreground">Nobody</span>
                )}
              </TableCell>
              <TableCell column="preview" className="hidden md:hidden @4xl:table-cell">
                {profile.lastRanAt ? formatTimeAgo(profile.lastRanAt) : <span className="text-muted-foreground">Never</span>}
              </TableCell>
            </CrmTableRow>
          )
        })}
      </CrmTable>
      {rightClick ? (
        <CrmRowMenu
          key={`${rightClick.id}-${rightClick.x}-${rightClick.y}`}
          at={rightClick}
          massSelect={{ on: massSelect, onToggle: () => toggleMassSelect(!massSelect ? rightClick.id : undefined) }}
          items={(() => {
            const profile = profiles.find((each) => each.id === rightClick.id)
            return profile ? actionsFor(profile) : []
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
      label: "Profile",
      showLabel: "Show the profile",
      content: openProfile ? (
        <ProfileRecord
          key={openProfile.id}
          profile={openProfile}
          page={page}
          actions={actionsFor(openProfile)}
          onOpenBrowser={() => (openProfile.browser === "stopped" ? void openBrowser(openProfile) : setWindowFor(openProfile.id))}
          onRestart={restart}
          onChanged={() => refresh()}
        />
      ) : (
        <EmptyRecord
          title="Profile"
          icon={<MonitorIcon aria-hidden />}
          line={profiles.length ? "Click a profile to see it here." : "Make a profile with New profile to see it here."}
          hideLabel="Hide the profile"
        />
      ),
    },
    windows: (
      <>
        <ProfileDialog
          key={creating ? "new-profile" : "closed"}
          open={creating}
          page={page}
          onClose={() => setCreating(false)}
          onSaved={async (id) => {
            setCreating(false)
            await refresh()
            pick(id)
          }}
        />
        <BrowserWindowDialog
          profile={profiles.find((profile) => profile.id === windowFor) ?? null}
          onClose={() => setWindowFor(null)}
          onChanged={() => refresh()}
        />
        <ProfileGroupsDialog
          open={groupsOpen}
          folders={page.folders}
          labels={page.labels}
          onClose={() => setGroupsOpen(false)}
          onChanged={() => refresh()}
        />
        <ConfirmDialog
          open={tagging}
          onOpenChange={(next) => {
            if (!next) {
              setTagging(false)
              setTagText("")
            }
          }}
          title={`Add a tag to ${selected.length} ${selected.length === 1 ? "profile" : "profiles"}?`}
          description="A profile that already has the tag, or already has twenty, is left as it is."
          confirmLabel="Add tag"
          destructive={false}
          loading={busy}
          disabled={!tagText.trim()}
          onConfirm={async () => {
            if (await bulk({ action: "tag", ids: selectedIds, tag: tagText })) {
              setTagging(false)
              setTagText("")
            }
          }}
        >
          <div className="grid gap-2 pt-4">
            <Label htmlFor="bulk-tag">Tag</Label>
            <Input id="bulk-tag" value={tagText} onChange={(event) => setTagText(event.target.value)} />
          </div>
        </ConfirmDialog>
        <ConfirmDialog
          open={deleteTargets.length > 0}
          onOpenChange={(next) => {
            if (!next) setDeleteTargets([])
          }}
          title={deleteTargets.length === 1 ? `Delete ${deleteTargets[0].name}?` : `Delete ${deleteTargets.length} profiles?`}
          description={[
            deleteTargets.length === 1
              ? "Its cookies and its backups go with it, so every sign-in inside is lost for good."
              : "Their cookies and their backups go with them, so every sign-in inside is lost for good.",
            signedOut ?? "Nothing is signed in inside.",
            "A profile whose browser is open is kept until it is stopped.",
          ].join(" ")}
          confirmLabel={deleteTargets.length === 1 ? "Delete profile" : "Delete profiles"}
          loading={busy}
          onConfirm={() => void remove(deleteTargets)}
        />
      </>
    ),
  })
}
