import * as React from "react"
import { EllipsisVerticalIcon, Loader2Icon, TextCursorInputIcon, Trash2Icon } from "lucide-react"

import type { DashboardActions } from "@/components/note-library/library-dashboard"
import { LIBRARY_APP_BLOCKS, LibrariesBlock, LibraryBlocksProvider, type LibraryBlocks } from "@/components/note-library/library-blocks"
import { LibraryRowMenu, NewLibraryDialog } from "@/components/note-library/library-menus"
import { DashboardCardHeader, dashboardCardHeadingClassName } from "@/components/shared/dashboard-card-header"
import { LockedPageContext } from "@/components/shared/notes/block-card"
import { PageCover } from "@/components/shared/notes/page-cover"
import { CoverRow, LockRow } from "@/components/shared/notes/page-rows"
import { PickGroup } from "@/components/shared/notes/pick-rows"
import { SavingDocument } from "@/components/shared/notes/saving-document"
import type { SideRow } from "@/components/shared/notes/side-rows"
import { TabbedMenu } from "@/components/shared/notes/tabbed-menu"
import { SidePanelCollapseButton } from "@/components/shared/three-panels"
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ErrorRow } from "@/components/ui/error-row"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { getLibraryErrorMessage } from "@/lib/api/note/library"
import { lockLibraryLeftPage, saveLibraryLeftPage, setLibraryLeftPageCover } from "@/lib/api/note/library-page"
import { deleteLibraryTag, renameLibraryTag } from "@/lib/api/note/notes"
import { plural } from "@/lib/format/plural"
import { quoteOneLine } from "@/lib/format/quote-text"
import { PANEL_GUTTER } from "@/lib/layout/panel-gutter"
import type { LibrarySearch } from "@/lib/note/library/address"
import {
  LIBRARY_COLOUR_DOT,
  TAG_MAX,
  type LibraryPage,
  type LibraryRow,
  type LibraryTag,
} from "@/lib/note/library/notes"
import { pageWithoutBlock, type StoredPage } from "@/lib/notes/page-body"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * The Library dashboard's left panel (Tyler, 15 Nov 2026: "We need to revamp
 * the ui to the new shell 3 panel ui", then "I think the library should live
 * as a left panel dashboard block"), drawn as Travel's Trips page and the
 * CRM's are.
 *
 * - **Header:** the collapse button, "Library", and the ⋮: General (the
 *   page's Cover photo, and Lock the notes in its footer).
 * - **Page:** the person's own, written on like any page in the design, with
 *   the fixed Libraries block that picks the library and the Tags block of
 *   the library picked. Pinned, Folders, Authors and Recently opened went the
 *   same day ("remove the pinned block and move them as middle tab", "Remove
 *   folder block and folder feature. Remove the authors block. Remove the
 *   recenetly opened block"). While the page is read, or when it could not
 *   be, the Libraries block is drawn on its own, since it is the only way
 *   between the libraries.
 * - The body carries `data-side-panel-body`, the shell's mark that draws the
 *   first block at Settings → Styling → Panel cards → Opacity.
 */
export function LibraryLeftPanel({
  libraries,
  libraryId,
  page,
  leftPage,
  leftPageError,
  onRetryLeftPage,
  onLeftPageChange,
  search,
  actions,
  onPickLibrary,
  onLibrariesChanged,
  onLibraryMade,
  onLibraryDeleted,
}: {
  libraries: LibraryRow[]
  /** The library picked, or null for somebody with none. */
  libraryId: string | null
  /** The picked library's tags and counts; null with none picked. */
  page: LibraryPage | null
  /** Null while the left page is first read, or when the read failed. */
  leftPage: StoredPage | null
  leftPageError: string | null
  onRetryLeftPage: () => void
  onLeftPageChange: (page: StoredPage) => void
  search: LibrarySearch
  /** Null with no library picked. */
  actions: DashboardActions | null
  onPickLibrary: (id: string) => void
  onLibrariesChanged: () => Promise<void>
  onLibraryMade: (row: LibraryRow) => void
  onLibraryDeleted: (id: string) => Promise<void>
}) {
  /** The tag being renamed. */
  const [renaming, setRenaming] = React.useState<string | null>(null)
  const [deletingTag, setDeletingTag] = React.useState<LibraryTag | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [newLibraryOpen, setNewLibraryOpen] = React.useState(false)

  async function act(work: () => Promise<unknown>) {
    setBusy(true)
    dismissErrorToast()
    try {
      await work()
      return true
    } catch (error) {
      showErrorToast(getLibraryErrorMessage(error))
      return false
    } finally {
      setBusy(false)
    }
  }

  // The page's own lock and cover.
  const change = async (work: () => Promise<unknown>, next: StoredPage) => {
    const ok = await act(work)
    if (ok) onLeftPageChange(next)
  }

  // Delete block on a locked page: unlocked, then saved without the block.
  const lockedPage = leftPage
    ? {
        locked: leftPage.locked,
        removeBlock: async (nodeName: string) => {
          const body = pageWithoutBlock(leftPage.body, nodeName)
          await change(async () => {
            await lockLibraryLeftPage(false)
            await saveLibraryLeftPage(body)
          }, { ...leftPage, locked: false, body })
        },
      }
    : null

  const libraryRows: SideRow[] = libraries.map((library) => ({
    key: library.id,
    name: library.name,
    dot: LIBRARY_COLOUR_DOT[library.colour],
    value: library.noteCount.toLocaleString(),
    picked: library.id === libraryId,
    onPress: () => onPickLibrary(library.id),
    menu: (
      <LibraryRowMenu
        library={library}
        templates={library.id === libraryId ? (page?.templates ?? null) : null}
        onChanged={async () => {
          await onLibrariesChanged()
          if (library.id === libraryId) await actions?.refreshPage()
        }}
        onDeleted={() => onLibraryDeleted(library.id)}
      />
    ),
  }))

  const tags: SideRow[] | null =
    page && actions
      ? page.tags.map((each) => ({
          key: each.tag,
          name: each.tag,
          value: each.count.toLocaleString(),
          picked: search.tag === each.tag,
          onPress: () => actions.setSearch({ tag: search.tag === each.tag ? undefined : each.tag, tab: undefined }),
          menu: (
            <RowMenu
              label={`More for the tag ${each.tag}`}
              items={[
                { label: "Rename…", icon: <TextCursorInputIcon />, onSelect: () => setRenaming(each.tag) },
                { label: "Delete tag…", icon: <Trash2Icon />, destructive: true, onSelect: () => setDeletingTag(each) },
              ]}
            />
          ),
        }))
      : null

  const blocks: LibraryBlocks = { libraries: libraryRows, onNewLibrary: () => setNewLibraryOpen(true), tags }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <PageCover url={leftPage?.coverUrl ?? null} />
      {/* Wrapped in its own div, so the shell's table line under a header never matches this side panel's header. */}
      <div className="relative shrink-0">
        <DashboardCardHeader className={cn("gap-1", leftPage?.coverUrl && "border-b-transparent")}>
          <SidePanelCollapseButton side="left" label="Hide the page" />
          <span className={cn("min-w-0 flex-1 truncate pl-1", dashboardCardHeadingClassName)}>Library</span>
          {leftPage ? (
            <TabbedMenu
              label="Library page settings"
              align="start"
              width="20.25rem"
              tabs={[
                {
                  value: "general",
                  label: "General",
                  content: (
                    <div className="grid gap-3 p-3">
                      <PickGroup title="Page">
                        <CoverRow
                          cover={{
                            url: leftPage.coverUrl,
                            images: leftPage.coverImages,
                            busy,
                            set: ({ url, images }) =>
                              void change(() => setLibraryLeftPageCover({ coverUrl: url, coverImages: images }), {
                                ...leftPage,
                                coverUrl: url,
                                coverImages: images,
                              }),
                          }}
                        />
                      </PickGroup>
                    </div>
                  ),
                  footer: (
                    <LockRow
                      locked={leftPage.locked}
                      busy={busy}
                      onLock={(locked) => void change(() => lockLibraryLeftPage(locked), { ...leftPage, locked })}
                    />
                  ),
                },
              ]}
            />
          ) : null}
        </DashboardCardHeader>
      </div>

      <ScrollArea className="relative min-h-0 flex-1">
        <div data-side-panel-body="" className={cn(PANEL_GUTTER, "grid grid-cols-[minmax(0,1fr)] pt-0")}>
          {leftPage ? (
            <LibraryBlocksProvider value={blocks}>
              <LockedPageContext.Provider value={lockedPage}>
                <SavingDocument
                  // A lock reads again from the start, so the editor and the lock always agree.
                  key={leftPage.locked ? "locked" : "open"}
                  value={leftPage.body}
                  locked={leftPage.locked}
                  appBlocks={LIBRARY_APP_BLOCKS}
                  placeholder="Write something, or type / for blocks"
                  onSave={async (body) => {
                    try {
                      await saveLibraryLeftPage(body)
                      onLeftPageChange({ ...leftPage, body })
                    } catch (error) {
                      showErrorToast(getLibraryErrorMessage(error))
                    }
                  }}
                />
              </LockedPageContext.Provider>
            </LibraryBlocksProvider>
          ) : (
            <>
              <div className="mt-3.75 overflow-hidden rounded-[var(--shell-block-radius,1rem)] border">
                <LibraryBlocksProvider value={blocks}>
                  <LibrariesBlock />
                </LibraryBlocksProvider>
              </div>
              {leftPageError ? (
                <ErrorRow message={leftPageError} onRetry={onRetryLeftPage} />
              ) : (
                <LoadingRow label="Reading the page…" />
              )}
            </>
          )}
        </div>
      </ScrollArea>

      <NewLibraryDialog open={newLibraryOpen} onClose={() => setNewLibraryOpen(false)} onMade={onLibraryMade} />
      {page && actions ? (
        <>
          <RenameTagDialog
            tag={renaming}
            page={page}
            onClose={() => setRenaming(null)}
            onRename={async (from, name) => {
              const ok = await act(async () => {
                await renameLibraryTag(page.library.id, from, name)
                // The list was showing the old name; it follows the new one.
                if (search.tag === from) actions.setSearch({ tag: name.trim().toLowerCase() })
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
                await deleteLibraryTag(page.library.id, tag.tag)
                setDeletingTag(null)
                if (search.tag === tag.tag) actions.setSearch({ tag: undefined })
                await actions.refreshAll()
              })
            }}
          />
        </>
      ) : null}
    </div>
  )
}

/** A row's ⋮ in a block, in the place of its count while the row is pointed at. */
function RowMenu({
  label,
  items,
}: {
  label: string
  items: { label: string; icon: React.ReactNode; destructive?: boolean; onSelect: () => void }[]
}) {
  const plain = items.filter((item) => !item.destructive)
  const red = items.filter((item) => item.destructive)
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={label} className="text-muted-foreground">
          <EllipsisVerticalIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {plain.map((item) => (
          <DropdownMenuItem key={item.label} onSelect={item.onSelect}>
            {item.icon}
            {item.label}
          </DropdownMenuItem>
        ))}
        {red.length && plain.length ? <DropdownMenuSeparator /> : null}
        {red.map((item) => (
          <DropdownMenuItem key={item.label} variant="destructive" onSelect={item.onSelect}>
            {item.icon}
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Renames a tag on every note of the library (Tyler's task 02, part 11). A
 * name another tag already has merges the two, which the window says before
 * the press.
 */
function RenameTagDialog({
  tag,
  page,
  onClose,
  onRename,
}: {
  tag: string | null
  page: LibraryPage
  onClose: () => void
  onRename: (from: string, name: string) => Promise<boolean>
}) {
  const [name, setName] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [shown, setShown] = React.useState<string | null>(null)
  if (tag !== shown) {
    setShown(tag)
    setName(tag ?? "")
    setInvalid(false)
  }
  const key = name.replace(/\s+/g, " ").trim().toLowerCase()
  const mergeName = page.tags.find((each) => each.tag === key && each.tag !== tag)?.tag ?? null

  async function save() {
    if (!tag) return
    if (!name.trim()) {
      setInvalid(true)
      showErrorToast("Give the tag a name first")
      return
    }
    setSaving(true)
    const ok = await onRename(tag, name)
    setSaving(false)
    if (!ok) setInvalid(true)
  }
  return (
    <Dialog
      open={tag !== null}
      onOpenChange={(next) => {
        if (!next && !saving) onClose()
      }}
    >
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Rename tag</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="grid gap-2">
            <Label htmlFor="rename-tag-name">Tag</Label>
            <Input
              id="rename-tag-name"
              value={name}
              maxLength={TAG_MAX}
              aria-invalid={invalid || undefined}
              aria-describedby={mergeName ? "rename-tag-merge" : undefined}
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
              <p id="rename-tag-merge" className="text-sm text-muted-foreground">
                {quoteOneLine(mergeName)} is already a tag here, so the two become one.
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
