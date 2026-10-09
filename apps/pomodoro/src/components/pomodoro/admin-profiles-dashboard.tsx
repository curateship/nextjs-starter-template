import * as React from "react"
import { getRouteApi, useNavigate } from "@tanstack/react-router"
import { EyeIcon, EyeOffIcon, IdCardIcon, Loader2Icon, SettingsIcon } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/shared/dashboard-toolbar"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { AdminListTable, AdminSelectCell, useAdminList } from "@/components/pomodoro/admin-list"
import {
  AdminBulkDeleteButton,
  AdminDeleteConfirm,
  AdminRowDeleteButton,
  useAdminDelete,
} from "@/components/pomodoro/admin-delete"
import { MemberName } from "@/components/pomodoro/admin-member-name"
import { hidePomodoroProfiles } from "@/lib/api/pomodoro/admin-members"
import {
  getAdminProfileErrorMessage,
  listPomodoroProfiles,
  loadPomodoroAdminProfile,
  savePomodoroAdminProfile,
  type AdminProfile,
  type AdminProfileRow,
} from "@/lib/api/pomodoro/admin-profiles"
import { liftPomodoroSafety } from "@/lib/api/pomodoro/admin-safety"
import { formatDateTime } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useListSort, useSearchBoxText } from "@/lib/nav/list-search"
import type { ProfileSortColumn } from "@/lib/pomodoro/admin-lists"
import {
  BIO_MAX_LENGTH,
  HANDLE_MAX_LENGTH,
  HANDLE_RESERVED_MESSAGE,
  HANDLE_SHAPE_MESSAGE,
  isHandleAvailableShape,
  isHandleShape,
  normalizeHandle,
} from "@/lib/pomodoro/public-profile"
import { showErrorToast } from "@/lib/toast/error-toast"

const route = getRouteApi("/_authenticated/admin/pomodoro-profiles")

type SortColumn = ProfileSortColumn

const COLUMNS: TableHeaderColumn<SortColumn | "page" | "board">[] = [
  { key: "name", label: "Member", column: "main" },
  { key: "handle", label: "Address", column: "meta" },
  { key: "page", label: "Page", column: "meta", sortable: false },
  { key: "board", label: "Leaderboard", column: "meta", sortable: false },
  { key: "followers", label: "Followers", column: "meta" },
  { key: "updated", label: "Changed", column: "meta", className: "hidden 2xl:table-cell" },
]

/**
 * Every public profile with a handle (admin task 06, part 2). The cog opens a
 * window to fix the handle, display name or bio, and to hide or show the
 * profile. See `workspace/docs/admin-members.md`.
 */
export function AdminProfilesDashboard({
  initial,
  initialPageSize,
}: {
  initial: { rows: AdminProfileRow[]; total: number }
  initialPageSize: number
}) {
  const search = route.useSearch()
  const setListSearch = useListSearchNavigate()
  const query = search.q ?? ""
  const visibility = search.visibility ?? "all"
  const sort: SortColumn = search.sort ?? "updated"
  const direction = search.direction ?? "desc"
  const page = search.page ?? 1
  const setPage = React.useCallback(
    (next: number) => setListSearch({ page: next > 1 ? next : undefined }),
    [setListSearch]
  )
  const [searchText, setSearchText] = useSearchBoxText(query, (text) =>
    setListSearch({ q: text.trim() ? text : undefined, page: undefined })
  )
  const load = React.useCallback(
    (pageSize: number) =>
      listPomodoroProfiles({ search: query, visibility, sort, direction, page, pageSize }),
    [direction, page, query, sort, visibility]
  )
  const list = useAdminList({ initial, initialPageSize, page, onPageChange: setPage, load })
  const toggleSort = useListSort<SortColumn>({ sort, direction }, (column) =>
    column === "name" || column === "handle" ? "asc" : "desc"
  )
  const selection = useSelection()
  const rowIds = React.useMemo(() => list.rows.map((row) => row.userId), [list.rows])
  const selectedIds = rowIds.filter((id) => selection.selected.has(id))
  const showingIds = selectedIds.filter((id) => !list.rows.find((row) => row.userId === id)?.hiddenAt)

  const hide = useAdminDelete({
    one: "profile",
    many: "profiles",
    run: async (ids) => {
      const { changed, skipped } = await hidePomodoroProfiles(ids)
      return { deleted: changed, skipped }
    },
    verb: "hidden",
    keptReason: "already hidden",
    selection,
    onDone: list.refresh,
  })
  const hiding = list.rows.filter((row) => hide.ids.includes(row.userId))

  const navigate = useNavigate()
  const setOpen = React.useCallback(
    (id: string | undefined) => {
      // Not `replace`: Back closes the window, the way every record window does.
      void navigate({
        to: ".",
        search: (previous: Record<string, unknown>) => {
          const next = { ...previous }
          if (id) next.open = id
          else delete next.open
          return next
        },
      })
    },
    [navigate]
  )

  return (
    <>
      <AdminListTable
        title="Public profiles"
        icon={<IdCardIcon />}
        noun="profiles"
        columns={COLUMNS}
        sort={sort}
        direction={direction}
        onSort={(column) => {
          if (column !== "page" && column !== "board") toggleSort(column)
        }}
        trailing={<TableHead column="meta">Actions</TableHead>}
        selection={{ noun: "profiles", rowIds, state: selection }}
        list={list}
        page={page}
        onPageChange={setPage}
        controls={
          <>
            <AdminBulkDeleteButton del={hide} ids={showingIds} label="Hide" icon={<EyeOffIcon className="size-4" />} />
            <DashboardToolbarSearch
              name="profile-search"
              aria-label="Search profiles"
              placeholder="Search name, email or handle…"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <Select
              value={visibility}
              onValueChange={(value) =>
                setListSearch({ visibility: value === "all" ? undefined : value, page: undefined })
              }
            >
              <DashboardToolbarSelectTrigger aria-label="Filter by who can see the page">
                <SelectValue placeholder="Page" />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">Every page</SelectItem>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="private">Switched off</SelectItem>
                <SelectItem value="hidden">Hidden by an admin</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
      >
        {list.rows.map((row) => (
          <TableRow key={row.userId} className="group" rowAction={() => setOpen(row.userId)}>
            <AdminSelectCell selection={selection} id={row.userId} label={`Select ${row.name}`} />
            <TableCell column="main">
              <div className="min-w-0">
                <MemberName id={row.userId} name={row.name} />
                <span className="block max-w-96 truncate text-xs text-muted-foreground" title={row.email}>
                  {row.publicDisplayName ? `Shown as ${row.publicDisplayName}` : row.email}
                </span>
              </div>
            </TableCell>
            <TableCell column="meta">
              <span className="block max-w-48 truncate" title={`/u/${row.handle}`}>
                /u/{row.handle}
              </span>
            </TableCell>
            <TableCell column="meta">
              {row.hiddenAt ? (
                <Badge variant="destructive">Hidden</Badge>
              ) : row.profilePublic ? (
                <Badge variant="secondary">Public</Badge>
              ) : (
                <Badge variant="outline">Off</Badge>
              )}
            </TableCell>
            <TableCell column="meta">
              {row.leaderboardHiddenAt ? (
                <Badge variant="destructive">Taken off</Badge>
              ) : row.leaderboardOptIn ? (
                <Badge variant="secondary">On</Badge>
              ) : (
                <Badge variant="outline">Off</Badge>
              )}
            </TableCell>
            <TableCell column="meta">{row.followers.toLocaleString()}</TableCell>
            <TableCell column="mutedMeta" className="hidden 2xl:table-cell">
              {formatDateTime(row.updatedAt)}
            </TableCell>
            <TableCell column="actions">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Settings for ${row.name}'s profile`}
                onClick={() => setOpen(row.userId)}
              >
                <SettingsIcon className="size-4" />
              </Button>
              {row.hiddenAt ? null : (
                <AdminRowDeleteButton
                  del={hide}
                  id={row.userId}
                  label={`Hide ${row.name}'s profile`}
                  icon={<EyeOffIcon className="size-4" />}
                />
              )}
            </TableCell>
          </TableRow>
        ))}
      </AdminListTable>
      <AdminDeleteConfirm
        del={hide}
        title={
          hiding.length === 1
            ? `Hide ${hiding[0].name}'s profile?`
            : `Hide ${hide.ids.length} ${plural(hide.ids.length, "profile", "profiles")}?`
        }
        description="The page answers as if it did not exist, and its owner is told in the bell and on their Settings card. Show it again from its window, or with Lift under Bans."
        confirmLabel="Hide"
      />
      <AdminProfileDialog openId={search.open} onClose={() => setOpen(undefined)} onSaved={list.refresh} />
    </>
  )
}

type Draft = { handle: string; publicDisplayName: string; bio: string }

function draftOf(profile: AdminProfile): Draft {
  return {
    handle: profile.handle ?? "",
    publicDisplayName: profile.publicDisplayName ?? "",
    bio: profile.bio ?? "",
  }
}

/**
 * Fixes one profile's handle, display name or bio, and hides or shows it.
 * The owner is told which fields changed, never which admin changed them.
 */
function AdminProfileDialog({
  openId,
  onClose,
  onSaved,
}: {
  openId: string | undefined
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [loaded, setLoaded] = React.useState<AdminProfile | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState<Draft | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [switching, setSwitching] = React.useState(false)
  const [handleInvalid, setHandleInvalid] = React.useState(false)
  const handleId = React.useId()
  const nameId = React.useId()
  const bioId = React.useId()

  // Closing clears nothing, so the window fades out as it was.
  const [shownFor, setShownFor] = React.useState<string | undefined>(undefined)
  if (shownFor !== openId && openId === undefined) setShownFor(undefined)
  else if (shownFor !== openId) {
    setShownFor(openId)
    setLoaded(null)
    setLoadError(null)
    setDraft(null)
    setHandleInvalid(false)
  }

  React.useEffect(() => {
    if (!openId) return
    let live = true
    loadPomodoroAdminProfile(openId).then(
      (profile) => {
        if (!live) return
        setLoaded(profile)
        setDraft(draftOf(profile))
      },
      (error) => {
        if (live) setLoadError(getAdminProfileErrorMessage(error))
      }
    )
    return () => {
      live = false
    }
  }, [openId])

  const initial = loaded ? draftOf(loaded) : null
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  const handle = draft ? normalizeHandle(draft.handle) : ""
  const handleChanged = Boolean(loaded && draft && handle !== loaded.handle)
  const update = (key: keyof Draft, value: string) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current))

  const save = async () => {
    if (!draft || !loaded) return
    if (!isHandleAvailableShape(handle)) {
      setHandleInvalid(true)
      showErrorToast(isHandleShape(handle) ? HANDLE_RESERVED_MESSAGE : HANDLE_SHAPE_MESSAGE)
      return
    }
    setSaving(true)
    try {
      const { changed } = await savePomodoroAdminProfile({
        userId: loaded.userId,
        handle,
        publicDisplayName: draft.publicDisplayName.trim() || null,
        bio: draft.bio.trim() || null,
      })
      toast.success(
        changed.length
          ? `Saved. ${loaded.name} is told their ${changed.join(", ")} changed.`
          : "Nothing had changed."
      )
      await onSaved()
      onClose()
    } catch (error) {
      if (error instanceof Error && error.message.includes("HANDLE")) setHandleInvalid(true)
      showErrorToast(getAdminProfileErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  // Hiding or showing takes effect at once, apart from Save, and tells the
  // owner either way.
  const setHidden = async (hidden: boolean) => {
    if (!loaded) return
    setSwitching(true)
    try {
      if (hidden) await hidePomodoroProfiles([loaded.userId])
      else await liftPomodoroSafety("hidden", [loaded.userId])
      setLoaded({ ...loaded, hiddenAt: hidden ? new Date() : null })
      toast.success(hidden ? `${loaded.name}'s profile is hidden. They are told.` : `${loaded.name}'s profile shows again. They are told.`)
      await onSaved()
    } catch (error) {
      showErrorToast(getAdminProfileErrorMessage(error))
    } finally {
      setSwitching(false)
    }
  }

  return (
    <FormDialog open={openId !== undefined} dirty={dirty} busy={saving || switching} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>{loaded ? `${loaded.name}'s profile` : "Profile"}</DialogTitle>
            <DialogDescription>
              {loaded
                ? loaded.hiddenAt
                  ? "Hidden: the page answers as if it did not exist. The owner is told about every change."
                  : loaded.profilePublic
                    ? "Public. The owner is told about every change, never by whom."
                    : "Switched off by its owner. The owner is told about every change, never by whom."
                : "Reading the profile…"}
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
          >
            <DialogBody>
              {loadError ? (
                <p role="alert" className="text-sm text-destructive">
                  {loadError}
                </p>
              ) : !draft || !loaded ? (
                <div className="flex justify-center py-10">
                  <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Profile</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="grid gap-2">
                      <FieldLabel htmlFor={handleId}>Handle</FieldLabel>
                      <Input
                        id={handleId}
                        maxLength={HANDLE_MAX_LENGTH}
                        value={draft.handle}
                        autoComplete="off"
                        aria-invalid={handleInvalid || undefined}
                        onChange={(event) => {
                          setHandleInvalid(false)
                          update("handle", event.target.value)
                        }}
                      />
                      {handleChanged ? (
                        <p className="text-sm text-muted-foreground">
                          Old links to /u/{loaded.handle} stop working the moment you save, including any the
                          owner has shared. The new address is /u/{handle || "…"}.
                        </p>
                      ) : null}
                    </div>
                    <div className="grid gap-2">
                      <FieldLabel htmlFor={nameId}>Display name</FieldLabel>
                      <Input
                        id={nameId}
                        maxLength={50}
                        value={draft.publicDisplayName}
                        placeholder="Empty shows their handle"
                        onChange={(event) => update("publicDisplayName", event.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <FieldLabel htmlFor={bioId}>Bio</FieldLabel>
                      <Textarea
                        id={bioId}
                        rows={1}
                        maxLength={BIO_MAX_LENGTH}
                        value={draft.bio}
                        onChange={(event) => update("bio", event.target.value)}
                      />
                    </div>
                  </CardContent>
                </Card>
              )}
            </DialogBody>
            <DialogFooter>
              {loaded ? (
                loaded.hiddenAt ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="mr-auto"
                    disabled={saving || switching}
                    onClick={() => void setHidden(false)}
                  >
                    {switching ? <Loader2Icon className="size-4 animate-spin" /> : <EyeIcon className="size-4" />}
                    Show profile
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="destructive"
                    className="mr-auto"
                    disabled={saving || switching}
                    onClick={() => void setHidden(true)}
                  >
                    {switching ? <Loader2Icon className="size-4 animate-spin" /> : <EyeOffIcon className="size-4" />}
                    Hide profile
                  </Button>
                )
              ) : null}
              <Button type="button" variant="outline" onClick={requestClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !draft}>
                {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
