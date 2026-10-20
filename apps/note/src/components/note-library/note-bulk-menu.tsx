import * as React from "react"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  FolderInputIcon,
  LibraryIcon,
  Loader2Icon,
  MinusIcon,
  PinIcon,
  PinOffIcon,
  SparklesIcon,
  TagIcon,
  TagsIcon,
  Trash2Icon,
  WandSparklesIcon,
} from "lucide-react"
import { toast } from "sonner"

import { LibraryDot } from "@/components/note-library/library-dot"
import { SelectedMenu, SelectedMenuRow, SelectedMenuSeparator } from "@/components/shared/mass-select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { analyseManyNotes, mergeNotePlans } from "@/lib/api/note/imports"
import { getLibraryErrorMessage } from "@/lib/api/note/library"
import { changeNotes, moveNotesToLibrary, type NoteChange } from "@/lib/api/note/notes"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { plural } from "@/lib/format/plural"
import { quoteOneLine } from "@/lib/format/quote-text"
import { manyPriceLine, mergePriceLine } from "@/lib/note/library/analyse-price"
import {
  isImportSource,
  MANY_AT_ONCE_MAX,
  NOTE_PRIORITIES,
  PRIORITY_LABEL,
  TAG_MAX,
  TRASH_DAYS,
  type LibraryPage,
  type NoteCard,
} from "@/lib/note/library/notes"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * The ticked notes as one "N selected" button in the middle header, with the
 * changes Tyler listed on 20 Oct 2026: Move to folder, Move to library, Add
 * tag, Remove tag, Set priority, Pin, Unpin, Archive, Unarchive, Analyse
 * many, One plan from many and Move to Trash. Each is one request, and the
 * toast says how many changed and how many were already that way.
 */
export function NoteBulkMenu({
  page,
  selected,
  onDone,
  onOpen,
  onLeft,
  onRefresh,
}: {
  page: LibraryPage
  selected: NoteCard[]
  /** Clears the ticks: after a change, and from Clear selection. */
  onDone: () => void
  /** These notes left the list: moved to Trash or to another library. */
  onLeft: (ids: string[]) => void
  onOpen: (id: string) => void
  onRefresh: () => Promise<void>
}) {
  const [busy, setBusy] = React.useState(false)
  const [newTag, setNewTag] = React.useState("")
  const ids = selected.map((note) => note.id)
  const count = selected.length
  const imports = selected.filter((note) => isImportSource(note.source))
  const withPlan = selected.filter((note) => note.progress !== null)
  const tagsOnPicked = [...new Set(selected.flatMap((note) => note.tags))].sort()

  async function run(work: () => Promise<string>) {
    setBusy(true)
    dismissErrorToast()
    try {
      const line = await work()
      onDone()
      toast.success(line)
      await onRefresh()
    } catch (error) {
      showErrorToast(getLibraryErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  function change(close: () => void, what: NoteChange, verb: string) {
    close()
    void run(async () => {
      const { done, skipped } = await changeNotes(ids, what)
      return describeBulkResult({ done: done.length, kept: 0, same: skipped.length, one: "note", many: "notes", verb })
    })
  }

  return (
    <SelectedMenu
      count={count}
      busy={busy}
      onClear={onDone}
      main={(menu) => (
        <>
          <SelectedMenuRow page="folder" onClick={() => menu.step("folder")}>
            <FolderInputIcon className="size-4 text-muted-foreground" />
            Move to folder
          </SelectedMenuRow>
          <SelectedMenuRow page="library" onClick={() => menu.step("library")}>
            <LibraryIcon className="size-4 text-muted-foreground" />
            Move to library
          </SelectedMenuRow>
          <SelectedMenuRow page="addTag" onClick={() => menu.step("addTag")}>
            <TagIcon className="size-4 text-muted-foreground" />
            Add tag
          </SelectedMenuRow>
          <SelectedMenuRow page="removeTag" onClick={() => menu.step("removeTag")}>
            <TagsIcon className="size-4 text-muted-foreground" />
            Remove tag
          </SelectedMenuRow>
          <SelectedMenuRow page="priority" onClick={() => menu.step("priority")}>
            <ArrowUpIcon className="size-4 text-muted-foreground" />
            Set priority
          </SelectedMenuRow>
          <SelectedMenuSeparator />
          <SelectedMenuRow onClick={() => change(menu.close, { change: "pin", on: true }, "pinned")}>
            <PinIcon className="size-4 text-muted-foreground" />
            Pin
          </SelectedMenuRow>
          <SelectedMenuRow onClick={() => change(menu.close, { change: "pin", on: false }, "unpinned")}>
            <PinOffIcon className="size-4 text-muted-foreground" />
            Unpin
          </SelectedMenuRow>
          <SelectedMenuRow onClick={() => change(menu.close, { change: "archive", on: true }, "archived")}>
            <ArchiveIcon className="size-4 text-muted-foreground" />
            Archive
          </SelectedMenuRow>
          <SelectedMenuRow onClick={() => change(menu.close, { change: "archive", on: false }, "brought back")}>
            <ArchiveRestoreIcon className="size-4 text-muted-foreground" />
            Unarchive
          </SelectedMenuRow>
          <SelectedMenuSeparator />
          <SelectedMenuRow page="analyse" onClick={() => menu.step("analyse")}>
            <SparklesIcon className="size-4 text-muted-foreground" />
            Analyse many
          </SelectedMenuRow>
          <SelectedMenuRow page="merge" onClick={() => menu.step("merge")}>
            <WandSparklesIcon className="size-4 text-muted-foreground" />
            One plan from many
          </SelectedMenuRow>
          <SelectedMenuSeparator />
          <SelectedMenuRow
            className="text-destructive hover:text-destructive"
            onClick={() => {
              menu.close()
              void run(async () => {
                const { done } = await changeNotes(ids, { change: "trash" })
                onLeft(done)
                return `Moved ${done.length.toLocaleString()} ${plural(done.length, "note")} to Trash. They stay there ${TRASH_DAYS} days.`
              })
            }}
          >
            <Trash2Icon className="size-4" />
            Move to Trash
          </SelectedMenuRow>
        </>
      )}
      pages={{
        folder: {
          title: "Move to folder",
          content: (menu) => (
            <ScrollArea className="max-h-72">
              <SelectedMenuRow onClick={() => change(menu.close, { change: "folder", folderId: null }, "moved out of their folder")}>
                <MinusIcon className="size-4 text-muted-foreground" />
                No folder
              </SelectedMenuRow>
              {page.folders.map((folder) => (
                <SelectedMenuRow
                  key={folder.id}
                  onClick={() => change(menu.close, { change: "folder", folderId: folder.id }, `moved to ${quoteOneLine(folder.name)}`)}
                >
                  <span className="truncate">{folder.name}</span>
                </SelectedMenuRow>
              ))}
            </ScrollArea>
          ),
        },
        library: {
          title: "Move to library",
          content: (menu) =>
            page.otherLibraries.length ? (
              <ScrollArea className="max-h-72">
                {page.otherLibraries.map((library) => (
                  <SelectedMenuRow
                    key={library.id}
                    onClick={() => {
                      menu.close()
                      void run(async () => {
                        const moved = await moveNotesToLibrary(ids, library.id)
                        onLeft(moved.done)
                        const line = `Moved ${moved.done.length.toLocaleString()} ${plural(moved.done.length, "note")} to ${quoteOneLine(library.name)}.`
                        return moved.alreadyThere
                          ? `${line} ${moved.alreadyThere} ${plural(moved.alreadyThere, "was", "were")} skipped, because ${quoteOneLine(library.name)} already has that link.`
                          : line
                      })
                    }}
                  >
                    <LibraryDot colour={library.colour} />
                    <span className="truncate">{library.name}</span>
                  </SelectedMenuRow>
                ))}
              </ScrollArea>
            ) : (
              <p className="px-2 py-2 text-sm text-muted-foreground">This is your only library. Make another on the Library screen.</p>
            ),
        },
        addTag: {
          title: "Add tag",
          content: (menu) => (
            <div className="grid gap-1">
              <form
                className="flex gap-1 p-1"
                onSubmit={(event) => {
                  event.preventDefault()
                  const tag = newTag.trim()
                  if (!tag) {
                    showErrorToast("Type the tag first.")
                    return
                  }
                  setNewTag("")
                  change(menu.close, { change: "addTag", tag }, `tagged ${quoteOneLine(tag.toLowerCase())}`)
                }}
              >
                <Input
                  aria-label="New tag"
                  placeholder="Type a tag"
                  value={newTag}
                  maxLength={TAG_MAX}
                  onChange={(event) => setNewTag(event.target.value)}
                />
                <Button type="submit" variant="outline">
                  Add
                </Button>
              </form>
              {page.tags.length ? (
                <ScrollArea className="max-h-56">
                  {page.tags.map((each) => (
                    <SelectedMenuRow
                      key={each.tag}
                      onClick={() => change(menu.close, { change: "addTag", tag: each.tag }, `tagged ${quoteOneLine(each.tag)}`)}
                    >
                      <span className="truncate">{each.tag}</span>
                    </SelectedMenuRow>
                  ))}
                </ScrollArea>
              ) : null}
            </div>
          ),
        },
        removeTag: {
          title: "Remove tag",
          content: (menu) =>
            tagsOnPicked.length ? (
              <ScrollArea className="max-h-72">
                {tagsOnPicked.map((tag) => (
                  <SelectedMenuRow
                    key={tag}
                    onClick={() => change(menu.close, { change: "removeTag", tag }, `untagged ${quoteOneLine(tag)}`)}
                  >
                    <span className="truncate">{tag}</span>
                  </SelectedMenuRow>
                ))}
              </ScrollArea>
            ) : (
              <p className="px-2 py-2 text-sm text-muted-foreground">None of these notes has a tag.</p>
            ),
        },
        priority: {
          title: "Set priority",
          content: (menu) =>
            NOTE_PRIORITIES.map((priority) => (
              <SelectedMenuRow
                key={priority}
                onClick={() => change(menu.close, { change: "priority", priority }, `set to ${PRIORITY_LABEL[priority]}`)}
              >
                {priority === "high" ? (
                  <ArrowUpIcon className="size-4 text-muted-foreground" />
                ) : priority === "low" ? (
                  <ArrowDownIcon className="size-4 text-muted-foreground" />
                ) : (
                  <MinusIcon className="size-4 text-muted-foreground" />
                )}
                {PRIORITY_LABEL[priority]}
              </SelectedMenuRow>
            )),
        },
        analyse: {
          title: "Analyse many",
          content: (menu) => (
            <ManyBox
              line={
                imports.length > MANY_AT_ONCE_MAX
                  ? `Pick up to ${MANY_AT_ONCE_MAX} notes at a time. ${imports.length} imported notes are picked.`
                  : imports.length
                    ? `${manyPriceLine(imports)}${imports.length < count ? ` ${count - imports.length} written ${plural(count - imports.length, "note")} with no link ${plural(count - imports.length, "is", "are")} left out.` : ""}`
                    : "None of these notes came from a link, so there is nothing to analyse."
              }
              label={`Analyse ${imports.length.toLocaleString()} ${plural(imports.length, "note")}`}
              busy={busy}
              onPress={() => {
                if (!imports.length || imports.length > MANY_AT_ONCE_MAX) {
                  showErrorToast(imports.length ? `Pick up to ${MANY_AT_ONCE_MAX} notes at a time.` : "Pick notes imported from a link.")
                  return
                }
                menu.close()
                void run(async () => {
                  const { queued, skipped } = await analyseManyNotes(imports.map((note) => note.id))
                  const line = `Analysing ${queued.length} ${plural(queued.length, "note")}.`
                  return skipped.length ? `${line} ${skipped.length} skipped: ${skipped[0].reason}` : line
                })
              }}
            />
          ),
        },
        merge: {
          title: "One plan from many",
          content: (menu) => (
            <ManyBox
              line={
                withPlan.length < 2
                  ? "Pick at least two notes that have an action plan."
                  : withPlan.length > MANY_AT_ONCE_MAX
                    ? `Pick up to ${MANY_AT_ONCE_MAX} notes at a time.`
                    : `${mergePriceLine(withPlan)} It makes a new note in Loose notes.`
              }
              label={`One plan from ${withPlan.length.toLocaleString()}`}
              busy={busy}
              onPress={() => {
                if (withPlan.length < 2 || withPlan.length > MANY_AT_ONCE_MAX) {
                  showErrorToast(withPlan.length < 2 ? "Pick at least two notes that have an action plan." : `Pick up to ${MANY_AT_ONCE_MAX} notes at a time.`)
                  return
                }
                menu.close()
                void run(async () => {
                  const made = await mergeNotePlans(withPlan.map((note) => note.id))
                  onOpen(made.id)
                  return `Writing one plan from ${withPlan.length} notes. It is open on the right.`
                })
              }}
            />
          ),
        },
      }}
    />
  )
}

/** A page of the menu with the price above one button, as every AI button has. */
function ManyBox({ line, label, busy, onPress }: { line: string; label: string; busy: boolean; onPress: () => void }) {
  return (
    <div className="grid gap-2 p-2">
      <p className="text-xs text-muted-foreground">{line}</p>
      <Button type="button" disabled={busy} onClick={onPress}>
        {busy ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
        {label}
      </Button>
    </div>
  )
}
