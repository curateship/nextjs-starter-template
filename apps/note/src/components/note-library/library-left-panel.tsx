import * as React from "react"
import {
  ArchiveIcon,
  FileIcon,
  FilesIcon,
  FileUpIcon,
  FolderIcon,
  ListChecksIcon,
  LibraryIcon,
  Loader2Icon,
  PinIcon,
  PlusIcon,
  QuoteIcon,
  SettingsIcon,
  TextCursorInputIcon,
  Trash2Icon,
} from "lucide-react"
import { useRouter } from "@tanstack/react-router"
import { toast } from "sonner"

import type { DashboardActions } from "@/components/note-library/library-dashboard"
import { LibraryDot } from "@/components/note-library/library-dot"
import { LibrarySettingsDialog } from "@/components/note-library/library-settings-dialog"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { NewRecordDropdown } from "@/components/shared/new-record-dropdown"
import { PanelCard, PanelHeading } from "@/components/shared/panel-card"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  deleteLibraryFolder,
  getLibraryErrorMessage,
  makeFolder,
  pinLibraryFolder,
  pinLibraryRow,
  pinLibraryScope,
  renameLibraryFolder,
} from "@/lib/api/note/library"
import { createNoteIn, deleteLibraryTag, renameLibraryAuthor, renameLibraryTag } from "@/lib/api/note/notes"
import { formatShortTimeAgo } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { quoteOneLine } from "@/lib/format/quote-text"
import { focusRingInset } from "@/lib/layout/focus-ring"
import type { LibrarySearch } from "@/lib/note/library/address"
import {
  AUTHOR_NAME_MAX,
  authorKey,
  FOLDER_NAME_MAX,
  noteTitle,
  PINNABLE_ROW_LABEL,
  TAG_MAX,
  type LibraryAuthor,
  type LibraryFolder,
  type LibraryPage,
  type LibraryTag,
  type PinnableRow,
} from "@/lib/note/library/notes"
import { markdownToNote } from "@/lib/note/notes/markdown"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * The dashboard's left panel, drawn from Tyler's picture of 20 Oct 2026: the
 * library's header and banner as a Project's are (back arrow, colour dot,
 * name, a + for a new folder, pin and cog), then the Pinned card of pinned
 * folders, LIBRARY (All notes, Loose notes, Plan steps, Quotes), FOLDERS
 * (each folder, Archived, Trash), and the Authors, Recently opened and Tags
 * cards. Every row shows its notes, or its list, in the middle. Pinned and
 * LIBRARY are the same folding cards as those under them (Tyler, 20 Oct 2026:
 * "Add a collapsible pinned card above library", "Make library card
 * collapsible too", "library should use the same card Ui as the other
 * cards"), and every folder and every row of LIBRARY can be pinned ("Pin a
 * folder", "I should be able to pin library folders too").
 */

/**
 * A row's own icon buttons (pin, cog, bin): no background, on hover or open,
 * as the cards' own cog is drawn (Tyler, 14 Oct 2026, for `PanelCard`).
 */
const ROW_ICON_BUTTON =
  "text-muted-foreground hover:bg-transparent hover:text-foreground aria-expanded:bg-transparent aria-expanded:text-foreground dark:hover:bg-transparent"

/**
 * A pressable row whose button is stretched under the whole row, so the row's
 * own icons can sit between its name and its count without the count moving.
 * The keyboard ring is drawn on the row.
 */
const ROW_FOCUS =
  "has-[>button:focus-visible]:outline-2 has-[>button:focus-visible]:-outline-offset-2 has-[>button:focus-visible]:outline-ring"
const ROW_CLASS = `group/row relative flex min-w-0 items-center gap-2 rounded-md hover:bg-background ${ROW_FOCUS}`
const STRETCHED_BUTTON =
  "min-w-0 flex-1 cursor-pointer truncate text-left outline-none after:absolute after:inset-0 after:rounded-md after:content-['']"
/** The icons' slot, above the stretched button, shown on hover, focus, an open menu, and always on a phone. */
const ROW_ACTIONS =
  "relative z-10 hidden shrink-0 items-center group-hover/row:flex group-has-[:focus-visible]/row:flex has-[[data-state=open]]:flex [@media(hover:none)]:flex"

/** The icon a pinned LIBRARY row has in the Pinned card. */
const ROW_ICON: Record<PinnableRow, React.ReactNode> = {
  all: <FilesIcon />,
  loose: <FileIcon />,
  steps: <ListChecksIcon />,
  quotes: <QuoteIcon />,
  archived: <ArchiveIcon />,
  trash: <Trash2Icon />,
}

/** What the rename window is renaming. */
type RenameTarget =
  | { kind: "folder"; folder: LibraryFolder }
  | { kind: "tag"; name: string }
  | { kind: "author"; name: string }
export function LibraryLeftPanel({
  page,
  search,
  actions,
}: {
  page: LibraryPage
  search: LibrarySearch
  actions: DashboardActions
}) {
  const router = useRouter()
  const { library } = page
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [renaming, setRenaming] = React.useState<RenameTarget | null>(null)
  const [deleting, setDeleting] = React.useState<LibraryFolder | null>(null)
  const [deletingTag, setDeletingTag] = React.useState<LibraryTag | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [importInto, setImportInto] = React.useState<string | null>(null)
  const fileInput = React.useRef<HTMLInputElement>(null)
  // A picture whose address no longer loads is left out rather than drawn broken.
  const [broken, setBroken] = React.useState<string[]>([])
  const banner = library.bannerUrl && !broken.includes(library.bannerUrl) ? library.bannerUrl : null
  const avatar = library.avatarUrl && !broken.includes(library.avatarUrl) ? library.avatarUrl : null

  const scope = search.folder ?? "all"
  const showing = (folder: string) => !search.author && scope === folder
  const show = (folder: string) => actions.setSearch({ folder: folder === "all" ? undefined : folder, author: undefined })

  async function act(work: () => Promise<unknown>, success?: string) {
    setBusy(true)
    dismissErrorToast()
    try {
      await work()
      if (success) toast.success(success)
      return true
    } catch (error) {
      showErrorToast(getLibraryErrorMessage(error))
      return false
    } finally {
      setBusy(false)
    }
  }

  const rowCount: Record<PinnableRow, number> = {
    all: page.counts.all,
    loose: page.counts.loose,
    steps: page.counts.openSteps,
    quotes: page.counts.quotes,
    archived: page.counts.archived,
    trash: page.counts.trash,
  }
  const rowPinned = (row: PinnableRow) => page.pinnedRows.some((each) => each.row === row)

  function pinFolder(folder: LibraryFolder, on: boolean) {
    void act(async () => {
      await pinLibraryFolder(folder.id, on)
      await actions.refreshPage()
    }, on ? `Pinned ${quoteOneLine(folder.name)}.` : `Unpinned ${quoteOneLine(folder.name)}.`)
  }

  function pinRow(row: PinnableRow, on: boolean) {
    const label = PINNABLE_ROW_LABEL[row]
    void act(async () => {
      await pinLibraryScope(library.id, row, on)
      await actions.refreshPage()
    }, on ? `Pinned ${quoteOneLine(label)}.` : `Unpinned ${quoteOneLine(label)}.`)
  }

  /** Pinned folders and LIBRARY rows together, the first pinned at the top. */
  const pinned = [
    ...page.folders
      .filter((folder) => folder.pinnedAt !== null)
      .map((folder) => ({
        key: folder.id,
        at: folder.pinnedAt ?? "",
        icon: <FolderIcon />,
        label: folder.name,
        count: folder.noteCount,
        unpin: () => pinFolder(folder, false),
      })),
    ...page.pinnedRows.map((each) => ({
      key: each.row,
      at: each.pinnedAt,
      icon: ROW_ICON[each.row],
      label: PINNABLE_ROW_LABEL[each.row],
      count: rowCount[each.row],
      unpin: () => pinRow(each.row, false),
    })),
  ].sort((left, right) => (left.at < right.at ? -1 : 1))

  /** One of LIBRARY's own rows, with its pin on hover. */
  const fixedRow = (row: PinnableRow, icon?: React.ReactNode) => (
    <PinnableScopeRow
      icon={icon}
      label={PINNABLE_ROW_LABEL[row]}
      count={rowCount[row]}
      on={showing(row)}
      onClick={() => show(row)}
      pinned={rowPinned(row)}
      busy={busy}
      onPin={() => pinRow(row, !rowPinned(row))}
    />
  )

  /** Import Markdown: one note a file, read in the browser and checked again on the server. */
  async function importFiles(files: FileList) {
    const folderId = importInto
    setImportInto(null)
    let made = 0
    const problems: string[] = []
    await act(async () => {
      for (const file of Array.from(files)) {
        const note = markdownToNote(file.name, await file.text())
        await createNoteIn({
          libraryId: library.id,
          folderId,
          title: note.title,
          body: note.body as Record<string, unknown>,
          tags: note.tags,
          priority: note.priority,
        })
        made += 1
        problems.push(...note.problems.map((problem) => `${file.name}: ${problem}`))
      }
    })
    if (made) {
      toast.success(`Imported ${made} ${plural(made, "note")}.`, {
        description: problems.length ? problems.slice(0, 5).join(" · ") : undefined,
      })
      await actions.refreshAll()
    }
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {banner ? (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-36 overflow-hidden">
          <img
            src={banner}
            alt=""
            className="size-full object-cover opacity-30"
            onError={() => setBroken((was) => [...was, banner])}
          />
          {/* Fading into the panel at the foot, as on the project page. */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-card/40 to-card" />
        </div>
      ) : null}
      <DashboardCardTitleHeader
        className="relative"
        icon={<LibraryIcon className="size-4" />}
        back={{ label: "Back to libraries", to: "/library" }}
        title={
          <span className="flex min-w-0 items-center gap-2">
            <LibraryDot colour={library.colour} />
            <span className="truncate">{library.name}</span>
          </span>
        }
        action={
          <div className="flex items-center gap-1">
            <NewFolderButton
              onMake={async (name) => {
                const ok = await act(() => makeFolder(library.id, name), `Made the folder ${quoteOneLine(name.trim())}.`)
                if (ok) await actions.refreshPage()
                return ok
              }}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={library.pinned ? `Unpin ${library.name}` : `Pin ${library.name}`}
                  aria-pressed={library.pinned}
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await pinLibraryRow(library.id, !library.pinned)
                      await actions.refreshPage()
                      await router.invalidate()
                    })
                  }
                >
                  <PinIcon className={cn("size-4", library.pinned && "fill-amber-400 text-amber-500")} aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{library.pinned ? "Unpin from the top of Library" : "Pin to the top of Library"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="Library settings" onClick={() => setSettingsOpen(true)}>
                  <SettingsIcon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Library settings</TooltipContent>
            </Tooltip>
          </div>
        }
      />
      <ScrollArea className="relative min-h-0 flex-1" viewportClassName="h-full">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 p-3">
          {avatar ? (
            // Its middle level with the banner's foot.
            <div className={cn("flex min-w-0 items-center gap-3 px-1", banner && "mt-6")}>
              <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-card bg-muted shadow-sm">
                <img
                  src={avatar}
                  alt=""
                  className="size-full object-cover"
                  onError={() => setBroken((was) => [...was, avatar])}
                />
              </span>
              <div className="grid min-w-0 gap-0.5">
                <p className="text-lg leading-tight font-semibold break-words">{library.name}</p>
                <p className="text-sm text-muted-foreground">
                  {page.counts.all.toLocaleString()} {plural(page.counts.all, "note")}
                </p>
              </div>
            </div>
          ) : null}
          <PanelCard
            storageId="note-library-pinned"
            title="Pinned"
            meta={pinned.length || undefined}
            className={cn(banner && !avatar && "mt-6")}
          >
            {pinned.length ? (
              <div className="-mx-2 -my-1 grid grid-cols-[minmax(0,1fr)]">
                {pinned.map((each) => (
                  <PinnableScopeRow
                    key={each.key}
                    icon={each.icon}
                    label={each.label}
                    count={each.count}
                    on={showing(each.key)}
                    onClick={() => show(each.key)}
                    pinned
                    busy={busy}
                    onPin={each.unpin}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Pin a folder, or any row of Library, to keep it here.</p>
            )}
          </PanelCard>

          {/* The same folding card as the others (Tyler, 20 Oct 2026: "library should use the same card Ui"). */}
          <PanelCard storageId="note-library-library" title="Library">
            <nav aria-label="Folders" className="-mx-2 -my-1 grid grid-cols-[minmax(0,1fr)] gap-1">
              {fixedRow("all")}
              {fixedRow("loose")}
              {fixedRow("steps")}
              {fixedRow("quotes")}
              <div className="px-2 pt-3 pb-0.5">
                <PanelHeading>Folders</PanelHeading>
              </div>
              {page.folders.map((folder) => (
                <ScopeRow
                  key={folder.id}
                  icon={<FolderIcon />}
                  label={folder.name}
                  count={folder.noteCount}
                  on={showing(folder.id)}
                  onClick={() => show(folder.id)}
                  actions={
                    <>
                      <PinButton
                        label={folder.name}
                        pinned={folder.pinnedAt !== null}
                        busy={busy}
                        onPin={() => pinFolder(folder, folder.pinnedAt === null)}
                      />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="ghost" size="icon-xs" className={ROW_ICON_BUTTON} aria-label={`Settings for ${folder.name}`}>
                            <SettingsIcon />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setRenaming({ kind: "folder", folder })}>
                            <TextCursorInputIcon />
                            Rename…
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => {
                              setImportInto(folder.id)
                              fileInput.current?.click()
                            }}
                          >
                            <FileUpIcon />
                            Import Markdown…
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button type="button" variant="ghost" size="icon-xs" className={ROW_ICON_BUTTON} aria-label={`Delete ${folder.name}`} onClick={() => setDeleting(folder)}>
                        <Trash2Icon />
                      </Button>
                    </>
                  }
                />
              ))}
              {page.folders.length === 0 ? (
                <p className="px-2 py-1 text-sm text-muted-foreground">
                  No folders yet. The + above makes one, and each import makes its own.
                </p>
              ) : null}
              {fixedRow("archived", <ArchiveIcon />)}
              {fixedRow("trash", <Trash2Icon />)}
            </nav>
          </PanelCard>

          <AuthorsCard
            authors={page.authors}
            picked={search.author}
            onPick={(author) =>
              actions.setSearch({ author: search.author?.toLowerCase() === author.key ? undefined : author.name, folder: undefined })
            }
            onRename={(author) => setRenaming({ kind: "author", name: author.name })}
          />

          <PanelCard storageId="note-library-recent" title="Recently opened" meta={page.recent.length || undefined}>
            {page.recent.length ? (
              <ul className="grid gap-2">
                {page.recent.map((note) => (
                  <li key={note.id}>
                    <button
                      type="button"
                      onClick={() => actions.openNote(note.id)}
                      className={cn(
                        "grid w-full gap-0.5 rounded-md border bg-background px-3 py-2 text-left hover:bg-muted/60",
                        note.id === search.open && "ring-1 ring-ring",
                        focusRingInset
                      )}
                    >
                      <span className="truncate text-sm font-medium">{noteTitle(note.title)}</span>
                      {/* Worked out again when the page wakes up; a minute ticking over between is expected. */}
                      <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                        {formatShortTimeAgo(note.openedAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">The last three notes you open show here.</p>
            )}
          </PanelCard>

          <PanelCard storageId="note-library-tags" title="Tags" meta={page.tags.length || undefined}>
            {page.tags.length ? (
              <ul className="flex flex-wrap gap-1.5">
                {page.tags.map((each) => {
                  const on = search.tag === each.tag
                  return (
                    <li
                      key={each.tag}
                      className={cn(
                        "group/row relative inline-flex h-7 items-center gap-1.5 rounded-md border bg-background px-2.5 text-sm hover:bg-muted",
                        ROW_FOCUS,
                        on && "border-foreground/40 bg-muted font-medium"
                      )}
                    >
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => actions.setSearch({ tag: on ? undefined : each.tag })}
                        className={STRETCHED_BUTTON}
                      >
                        {each.tag}
                      </button>
                      {/* The cog shows just left of the count on hover, as on a folder (Tyler, 20 Oct 2026).
                          Its room is kept while hidden, so a chip never widens and the chips after it never move. */}
                      <span className="invisible relative z-10 -my-1 flex shrink-0 items-center group-hover/row:visible group-has-[:focus-visible]/row:visible has-[[data-state=open]]:visible [@media(hover:none)]:visible">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button type="button" variant="ghost" size="icon-xs" className={ROW_ICON_BUTTON} aria-label={`Settings for the tag ${each.tag}`}>
                              <SettingsIcon />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setRenaming({ kind: "tag", name: each.tag })}>
                              <TextCursorInputIcon />
                              Rename…
                            </DropdownMenuItem>
                            <DropdownMenuItem variant="destructive" onSelect={() => setDeletingTag(each)}>
                              <Trash2Icon />
                              Delete…
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">{each.count}</span>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No tags yet. Add them on a note, or Analyse adds its own.</p>
            )}
          </PanelCard>
        </div>
      </ScrollArea>

      <input
        ref={fileInput}
        type="file"
        accept=".md,.markdown,text/markdown"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = event.target.files
          if (files?.length) void importFiles(files)
          event.target.value = ""
        }}
      />

      <LibrarySettingsDialog
        key={settingsOpen ? `${library.id}:${library.editedAt}` : "shut"}
        library={library}
        templates={page.templates}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={async () => {
          await actions.refreshPage()
          await router.invalidate()
        }}
      />
      <RenameDialog
        target={renaming}
        page={page}
        onClose={() => setRenaming(null)}
        onRename={async (target, name) => {
          const ok = await act(async () => {
            if (target.kind === "folder") {
              await renameLibraryFolder(target.folder.id, name)
              toast.success("Renamed.")
              return
            }
            const { notes } =
              target.kind === "tag"
                ? await renameLibraryTag(library.id, target.name, name)
                : await renameLibraryAuthor(library.id, target.name, name)
            toast.success(`Renamed on ${notes.toLocaleString()} ${plural(notes, "note")}.`)
            // The list was showing the old name; it follows the new one.
            if (target.kind === "tag" && search.tag === target.name) actions.setSearch({ tag: name.trim().toLowerCase() })
            if (target.kind === "author" && search.author && authorKey(search.author) === authorKey(target.name)) {
              actions.setSearch({ author: name.trim() })
            }
          })
          if (ok) {
            setRenaming(null)
            await actions.refreshAll()
          }
          return ok
        }}
      />
      <ConfirmDialog
        open={deletingTag !== null}
        onOpenChange={(next) => {
          if (!next) setDeletingTag(null)
        }}
        title={deletingTag ? `Delete the tag ${quoteOneLine(deletingTag.tag)}?` : "Delete this tag?"}
        description={
          deletingTag
            ? `It comes off ${deletingTag.count.toLocaleString()} ${plural(deletingTag.count, "note")}. The notes stay.`
            : ""
        }
        confirmLabel="Delete tag"
        loading={busy}
        onConfirm={() => {
          if (!deletingTag) return
          const tag = deletingTag
          void act(async () => {
            const { notes } = await deleteLibraryTag(library.id, tag.tag)
            setDeletingTag(null)
            if (search.tag === tag.tag) actions.setSearch({ tag: undefined })
            await actions.refreshAll()
            toast.success(`Took ${quoteOneLine(tag.tag)} off ${notes.toLocaleString()} ${plural(notes, "note")}.`)
          })
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!next) setDeleting(null)
        }}
        title={deleting ? `Delete ${quoteOneLine(deleting.name)}?` : "Delete this folder?"}
        description={
          deleting?.noteCount
            ? `Its ${deleting.noteCount.toLocaleString()} ${plural(deleting.noteCount, "note")} go to Trash. Restoring one brings it back as a loose note.`
            : "It holds no notes, so nothing else goes."
        }
        confirmLabel="Delete folder"
        loading={busy}
        onConfirm={() => {
          if (!deleting) return
          const folder = deleting
          void act(async () => {
            const { notes } = await deleteLibraryFolder(folder.id)
            setDeleting(null)
            if (scope === folder.id) show("all")
            await actions.refreshAll()
            toast.success(
              notes
                ? `Deleted ${quoteOneLine(folder.name)}. Its ${notes} ${plural(notes, "note")} went to Trash.`
                : `Deleted ${quoteOneLine(folder.name)}.`
            )
          })
        }}
      />
    </div>
  )
}

/** A row with its pin beside the count on hover, as a folder has. */
function PinnableScopeRow({
  icon,
  label,
  count,
  on,
  onClick,
  pinned,
  busy,
  onPin,
}: {
  icon?: React.ReactNode
  label: string
  count: number
  on: boolean
  onClick: () => void
  pinned: boolean
  busy: boolean
  onPin: () => void
}) {
  return (
    <ScopeRow
      icon={icon}
      label={label}
      count={count}
      on={on}
      onClick={onClick}
      actions={<PinButton label={label} pinned={pinned} busy={busy} onPin={onPin} />}
    />
  )
}

/** The pin of a row, filled while pinned. */
function PinButton({ label, pinned, busy, onPin }: { label: string; pinned: boolean; busy: boolean; onPin: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className={ROW_ICON_BUTTON}
      aria-label={pinned ? `Unpin ${label}` : `Pin ${label}`}
      aria-pressed={pinned}
      disabled={busy}
      onClick={onPin}
    >
      <PinIcon className={cn(pinned && "fill-amber-400 text-amber-500")} />
    </Button>
  )
}

/** One pressable line: an icon, a name and a count, as in Tyler's picture. */
function ScopeRow({
  icon,
  label,
  count,
  on,
  onClick,
  actions,
}: {
  icon?: React.ReactNode
  label: string
  count: number
  on: boolean
  onClick: () => void
  /**
   * The row's own icons (pin, cog, bin), shown just left of the count on hover
   * and focus, and always on a phone, which cannot hover. The count never
   * moves (Tyler, 20 Oct 2026: "beside the count, not overlap it", "the
   * pinned should be on the left").
   */
  actions?: React.ReactNode
}) {
  return (
    <div className={cn(ROW_CLASS, "h-8 px-2 text-sm", on && "bg-background font-medium shadow-xs")}>
      {icon ? <span className="flex shrink-0 text-muted-foreground [&_svg]:size-4">{icon}</span> : null}
      <button type="button" aria-pressed={on} onClick={onClick} className={STRETCHED_BUTTON}>
        {label}
      </button>
      {actions ? <span className={ROW_ACTIONS}>{actions}</span> : null}
      <span className="shrink-0 text-muted-foreground tabular-nums">{count.toLocaleString()}</span>
    </div>
  )
}

/**
 * The Authors card: whoever the imported notes came from, grouped by name
 * (Tyler, 20 Oct 2026: "Group by name"), most notes first. Clicking one shows
 * only that author's notes, like clicking a folder; clicking it again shows
 * every note.
 */
function AuthorsCard({
  authors,
  picked,
  onPick,
  onRename,
}: {
  authors: LibraryAuthor[]
  picked: string | undefined
  onPick: (author: LibraryAuthor) => void
  onRename: (author: LibraryAuthor) => void
}) {
  const pickedKey = picked?.replace(/\s+/g, " ").trim().toLowerCase()
  return (
    <PanelCard storageId="note-library-authors" title="Authors" meta={authors.length || undefined}>
      {authors.length ? (
        <ul className="-mx-2 -my-1 grid grid-cols-[minmax(0,1fr)]">
          {authors.map((author) => {
            const on = author.key === pickedKey
            return (
              <li
                key={author.key}
                // A fixed height, so the cog showing on hover never moves the rows (Tyler, 20 Oct 2026).
                className={cn(ROW_CLASS, "h-8 px-2 text-sm", on && "bg-background font-medium shadow-xs")}
              >
                <AuthorPicture name={author.name} url={author.pictureUrl} />
                <button type="button" aria-pressed={on} onClick={() => onPick(author)} className={STRETCHED_BUTTON}>
                  {author.name}
                </button>
                {/* The cog shows just left of the count on hover, as on a folder (Tyler, 20 Oct 2026). */}
                <span className={ROW_ACTIONS}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="ghost" size="icon-xs" className={ROW_ICON_BUTTON} aria-label={`Settings for ${author.name}`}>
                        <SettingsIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => onRename(author)}>
                        <TextCursorInputIcon />
                        Rename…
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </span>
                <span className="shrink-0 text-muted-foreground tabular-nums">{author.count.toLocaleString()}</span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Imported videos and posts show their authors here.</p>
      )}
    </PanelCard>
  )
}

/** An author's picture where X gave one, else their first letter. */
export function AuthorPicture({ name, url, className }: { name: string; url: string | null; className?: string }) {
  const [broken, setBroken] = React.useState(false)
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[10px] font-medium text-muted-foreground",
        className
      )}
    >
      {url && !broken ? (
        <img src={url} alt="" className="size-full object-cover" onError={() => setBroken(true)} />
      ) : (
        name.replace(/^@/, "").trim().charAt(0).toUpperCase()
      )}
    </span>
  )
}

/** The header's +: a dropdown with the new folder's name, as every "New …" is. */
function NewFolderButton({ onMake }: { onMake: (name: string) => Promise<boolean> }) {
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  return (
    <NewRecordDropdown
      label="New folder"
      open={open}
      onOpenChange={setOpen}
      submitLabel="Create folder"
      busy={busy}
      onSubmit={async () => {
        if (!name.trim()) {
          setInvalid(true)
          showErrorToast("Give the folder a name")
          return
        }
        setBusy(true)
        const ok = await onMake(name)
        setBusy(false)
        if (ok) {
          setName("")
          setOpen(false)
        } else setInvalid(true)
      }}
      trigger={
        <Button type="button" variant="ghost" size="icon" aria-label="New folder">
          <PlusIcon className="size-4" />
        </Button>
      }
    >
      <div className="grid gap-2">
        <Label htmlFor="new-folder-name">Folder name</Label>
        <Input
          id="new-folder-name"
          autoFocus
          value={name}
          maxLength={FOLDER_NAME_MAX}
          aria-invalid={invalid || undefined}
          onChange={(event) => {
            setName(event.target.value)
            setInvalid(false)
          }}
        />
      </div>
    </NewRecordDropdown>
  )
}

const RENAME_WORDS: Record<RenameTarget["kind"], { title: string; label: string; max: number }> = {
  folder: { title: "Rename folder", label: "Folder name", max: FOLDER_NAME_MAX },
  tag: { title: "Rename tag", label: "Tag", max: TAG_MAX },
  author: { title: "Rename author", label: "Author name", max: AUTHOR_NAME_MAX },
}

/**
 * Renames a folder, or a tag or an author on every note of the library
 * (Tyler's task 02, part 11). A tag or author name another one already has
 * merges the two, which the window says before the press.
 */
function RenameDialog({
  target,
  page,
  onClose,
  onRename,
}: {
  target: RenameTarget | null
  page: LibraryPage
  onClose: () => void
  onRename: (target: RenameTarget, name: string) => Promise<boolean>
}) {
  const startName = target?.kind === "folder" ? target.folder.name : (target?.name ?? "")
  const [name, setName] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [shown, setShown] = React.useState<RenameTarget | null>(null)
  if (target !== shown) {
    setShown(target)
    setName(startName)
    setInvalid(false)
  }
  const words = RENAME_WORDS[target?.kind ?? "folder"]
  const key = name.replace(/\s+/g, " ").trim().toLowerCase()
  const mergeInto =
    target?.kind === "tag"
      ? page.tags.find((each) => each.tag === key && each.tag !== target.name)
      : target?.kind === "author"
        ? page.authors.find((each) => each.key === key && each.key !== authorKey(target.name))
        : undefined
  const mergeName = mergeInto ? ("tag" in mergeInto ? mergeInto.tag : mergeInto.name) : null

  async function save() {
    if (!target) return
    if (!name.trim()) {
      setInvalid(true)
      showErrorToast(`Give the ${words.label.toLowerCase()} first`)
      return
    }
    setSaving(true)
    const ok = await onRename(target, name)
    setSaving(false)
    if (!ok) setInvalid(true)
  }
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(next) => {
        if (!next && !saving) onClose()
      }}
    >
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>{words.title}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="grid gap-2">
            <Label htmlFor="rename-library-name">{words.label}</Label>
            <Input
              id="rename-library-name"
              value={name}
              maxLength={words.max}
              aria-invalid={invalid || undefined}
              aria-describedby={mergeName ? "rename-library-merge" : undefined}
              onChange={(event) => {
                setName(event.target.value)
                setInvalid(false)
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  void save()
                }
              }}
            />
            {mergeName ? (
              <p id="rename-library-merge" className="text-sm text-muted-foreground">
                {quoteOneLine(mergeName)} is already {target?.kind === "tag" ? "a tag" : "an author"} here, so the two become
                one.
              </p>
            ) : null}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" size="lg" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" size="lg" disabled={saving} onClick={() => void save()}>
            {saving ? <Loader2Icon className="animate-spin" /> : null}
            {mergeName ? "Merge" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
