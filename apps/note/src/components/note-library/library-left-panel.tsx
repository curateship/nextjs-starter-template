import * as React from "react"
import {
  ArchiveIcon,
  FileUpIcon,
  FolderIcon,
  LibraryIcon,
  Loader2Icon,
  PinIcon,
  PlusIcon,
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
  pinLibraryRow,
  renameLibraryFolder,
} from "@/lib/api/note/library"
import { createNoteIn } from "@/lib/api/note/notes"
import { formatShortTimeAgo } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { quoteOneLine } from "@/lib/format/quote-text"
import { focusRingInset } from "@/lib/layout/focus-ring"
import type { LibrarySearch } from "@/lib/note/library/address"
import {
  FOLDER_NAME_MAX,
  noteTitle,
  type LibraryAuthor,
  type LibraryFolder,
  type LibraryPage,
} from "@/lib/note/library/notes"
import { markdownToNote } from "@/lib/note/notes/markdown"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * The dashboard's left panel, drawn from Tyler's picture of 20 Oct 2026: the
 * library's header and banner as a Project's are (back arrow, colour dot,
 * name, a + for a new folder, pin and cog), then LIBRARY (All notes, Loose
 * notes), FOLDERS (each folder, Archived, Trash), and the Authors, Recently
 * opened and Tags cards. Every row shows its notes in the middle.
 */
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
  const [renaming, setRenaming] = React.useState<LibraryFolder | null>(null)
  const [deleting, setDeleting] = React.useState<LibraryFolder | null>(null)
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
          {/* In a grey box like the cards under it (Tyler, 20 Oct 2026: "put this in card"). */}
          <nav aria-label="Folders" className={cn("grid gap-1 rounded-lg border bg-muted/40 p-2", banner && !avatar && "mt-6")}>
            <div className="px-2 pt-1 pb-0.5">
              <PanelHeading>Library</PanelHeading>
            </div>
            <ScopeRow label="All notes" count={page.counts.all} on={showing("all")} onClick={() => show("all")} />
            <ScopeRow label="Loose notes" count={page.counts.loose} on={showing("loose")} onClick={() => show("loose")} />
            <div className="px-2 pt-3 pb-0.5">
              <PanelHeading>Folders</PanelHeading>
            </div>
            {page.folders.map((folder) => (
              <div key={folder.id} className="group/folder relative min-w-0">
                <ScopeRow
                  icon={<FolderIcon />}
                  label={folder.name}
                  count={folder.noteCount}
                  on={showing(folder.id)}
                  onClick={() => show(folder.id)}
                  // The two icons take the count's place on hover, and always
                  // on a phone, which cannot hover.
                  countClassName="group-hover/folder:invisible group-has-[:focus-visible]/folder:invisible [@media(hover:none)]:invisible"
                />
                <span className="absolute top-1/2 right-1 hidden -translate-y-1/2 items-center group-hover/folder:flex group-has-[:focus-visible]/folder:flex has-[[data-state=open]]:flex [@media(hover:none)]:flex">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="ghost" size="icon-xs" aria-label={`Settings for ${folder.name}`}>
                        <SettingsIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setRenaming(folder)}>
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Delete ${folder.name}`}
                    onClick={() => setDeleting(folder)}
                  >
                    <Trash2Icon />
                  </Button>
                </span>
              </div>
            ))}
            {page.folders.length === 0 ? (
              <p className="px-2 py-1 text-sm text-muted-foreground">
                No folders yet. The + above makes one, and each import makes its own.
              </p>
            ) : null}
            <ScopeRow
              icon={<ArchiveIcon />}
              label="Archived"
              count={page.counts.archived}
              on={showing("archived")}
              onClick={() => show("archived")}
            />
            <ScopeRow
              icon={<Trash2Icon />}
              label="Trash"
              count={page.counts.trash}
              on={showing("trash")}
              onClick={() => show("trash")}
            />
          </nav>

          <AuthorsCard
            authors={page.authors}
            picked={search.author}
            onPick={(author) =>
              actions.setSearch({ author: search.author?.toLowerCase() === author.key ? undefined : author.name, folder: undefined })
            }
          />

          <PanelCard quiet storageId="note-library-recent" title="Recently opened" meta={page.recent.length || undefined}>
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

          <PanelCard quiet storageId="note-library-tags" title="Tags" meta={page.tags.length || undefined}>
            {page.tags.length ? (
              <ul className="flex flex-wrap gap-1.5">
                {page.tags.map((each) => {
                  const on = search.tag === each.tag
                  return (
                    <li key={each.tag}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => actions.setSearch({ tag: on ? undefined : each.tag })}
                        className={cn(
                          "inline-flex h-7 items-center gap-1.5 rounded-md border bg-background px-2.5 text-sm hover:bg-muted",
                          on && "border-foreground/40 bg-muted font-medium",
                          focusRingInset
                        )}
                      >
                        {each.tag}
                        <span className="text-xs text-muted-foreground tabular-nums">{each.count}</span>
                      </button>
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
      <RenameFolderDialog
        folder={renaming}
        onClose={() => setRenaming(null)}
        onRename={async (folder, name) => {
          const ok = await act(() => renameLibraryFolder(folder.id, name), "Renamed.")
          if (ok) {
            setRenaming(null)
            await actions.refreshAll()
          }
          return ok
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

/** One pressable line: an icon, a name and a count, as in Tyler's picture. */
function ScopeRow({
  icon,
  label,
  count,
  on,
  onClick,
  countClassName,
}: {
  icon?: React.ReactNode
  label: string
  count: number
  on: boolean
  onClick: () => void
  countClassName?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-background [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
        on && "bg-background font-medium shadow-xs",
        focusRingInset
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className={cn("shrink-0 text-muted-foreground tabular-nums", countClassName)}>{count.toLocaleString()}</span>
    </button>
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
}: {
  authors: LibraryAuthor[]
  picked: string | undefined
  onPick: (author: LibraryAuthor) => void
}) {
  const pickedKey = picked?.replace(/\s+/g, " ").trim().toLowerCase()
  return (
    <PanelCard quiet storageId="note-library-authors" title="Authors" meta={authors.length || undefined}>
      {authors.length ? (
        <ul className="-mx-2 -my-1 grid grid-cols-[minmax(0,1fr)]">
          {authors.map((author) => {
            const on = author.key === pickedKey
            return (
              <li key={author.key}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onPick(author)}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-background",
                    on && "bg-background font-medium shadow-xs",
                    focusRingInset
                  )}
                >
                  <AuthorPicture name={author.name} url={author.pictureUrl} />
                  <span className="min-w-0 flex-1 truncate">{author.name}</span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">{author.count.toLocaleString()}</span>
                </button>
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

function RenameFolderDialog({
  folder,
  onClose,
  onRename,
}: {
  folder: LibraryFolder | null
  onClose: () => void
  onRename: (folder: LibraryFolder, name: string) => Promise<boolean>
}) {
  const [name, setName] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [shown, setShown] = React.useState<string | null>(null)
  if ((folder?.id ?? null) !== shown) {
    setShown(folder?.id ?? null)
    setName(folder?.name ?? "")
    setInvalid(false)
  }
  async function save() {
    if (!folder) return
    if (!name.trim()) {
      setInvalid(true)
      showErrorToast("Give the folder a name")
      return
    }
    setSaving(true)
    const ok = await onRename(folder, name)
    setSaving(false)
    if (!ok) setInvalid(true)
  }
  return (
    <Dialog
      open={folder !== null}
      onOpenChange={(next) => {
        if (!next && !saving) onClose()
      }}
    >
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Rename folder</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="grid gap-2">
            <Label htmlFor="rename-folder-name">Folder name</Label>
            <Input
              id="rename-folder-name"
              value={name}
              maxLength={FOLDER_NAME_MAX}
              aria-invalid={invalid || undefined}
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
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" size="lg" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" size="lg" disabled={saving} onClick={() => void save()}>
            {saving ? <Loader2Icon className="animate-spin" /> : null}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
