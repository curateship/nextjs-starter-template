import * as React from "react"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  CopyIcon,
  FolderInputIcon,
  LibraryIcon,
  MinusIcon,
  PinIcon,
  PinOffIcon,
  SettingsIcon,
} from "lucide-react"
import { toast } from "sonner"

import { LibraryDot } from "@/components/note-library/library-dot"
import { SelectedMenuRow, SelectedMenuSeparator } from "@/components/shared/mass-select"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { getLibraryErrorMessage } from "@/lib/api/note/library"
import { changeNotes, duplicateLibraryNote, moveNotesToLibrary, type NoteChange } from "@/lib/api/note/notes"
import { quoteOneLine } from "@/lib/format/quote-text"
import { NOTE_PRIORITIES, noteTitle, PRIORITY_LABEL, type LibraryPage, type NoteCard } from "@/lib/note/library/notes"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

type Page = "folder" | "library" | "priority"

/**
 * A row's cog (the default Tyler was offered on 20 Oct 2026): Pin, Archive,
 * Move to folder, Move to library, Priority and Duplicate (task 02, part
 * 12), each one click from the table. Moving and the priority step into a list of their own with a back
 * arrow, the way the "N selected" menu does.
 */
export function NoteRowMenu({
  note,
  page,
  onChanged,
  onMovedAway,
  onDuplicated,
}: {
  note: NoteCard
  page: LibraryPage
  /** The row changed in place: pinned, archived, a new folder or priority. */
  onChanged: () => Promise<void>
  /** The note left this library. */
  onMovedAway: () => void
  /** A copy was made beside it. */
  onDuplicated: (copy: NoteCard) => Promise<void>
}) {
  const [open, setOpen] = React.useState(false)
  const [step, setStep] = React.useState<Page | null>(null)
  const [busy, setBusy] = React.useState(false)
  const title = noteTitle(note.title)

  function openChange(next: boolean) {
    setOpen(next)
    if (!next) setStep(null)
  }

  /** `work` answers false when it said why it did nothing itself. */
  async function run(work: () => Promise<unknown>, success: string) {
    openChange(false)
    setBusy(true)
    dismissErrorToast()
    try {
      if ((await work()) !== false) toast.success(success)
    } catch (error) {
      showErrorToast(getLibraryErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const change = (what: NoteChange, success: string) =>
    void run(async () => {
      await changeNotes([note.id], what)
      await onChanged()
    }, success)

  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Settings for ${title}`} disabled={busy}>
          <SettingsIcon className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-56 gap-0 p-1"
        onEscapeKeyDown={(event) => {
          if (step === null) return
          event.preventDefault()
          setStep(null)
        }}
      >
        {step ? (
          <>
            <SelectedMenuRow onClick={() => setStep(null)} className="font-medium">
              <ChevronLeftIcon className="size-4 text-muted-foreground" />
              {step === "folder" ? "Move to folder" : step === "library" ? "Move to library" : "Priority"}
            </SelectedMenuRow>
            <SelectedMenuSeparator />
            {step === "folder" ? (
              <ScrollArea className="max-h-64">
                <SelectedMenuRow onClick={() => change({ change: "folder", folderId: null }, "Moved out of its folder.")}>
                  <MinusIcon className="size-4 text-muted-foreground" />
                  No folder
                </SelectedMenuRow>
                {page.folders.map((folder) => (
                  <SelectedMenuRow
                    key={folder.id}
                    onClick={() => change({ change: "folder", folderId: folder.id }, `Moved to ${quoteOneLine(folder.name)}.`)}
                  >
                    <span className="truncate">{folder.name}</span>
                  </SelectedMenuRow>
                ))}
              </ScrollArea>
            ) : step === "library" ? (
              page.otherLibraries.length ? (
                <ScrollArea className="max-h-64">
                  {page.otherLibraries.map((library) => (
                    <SelectedMenuRow
                      key={library.id}
                      onClick={() =>
                        void run(async () => {
                          const moved = await moveNotesToLibrary([note.id], library.id)
                          if (moved.alreadyThere) {
                            showErrorToast(`${quoteOneLine(library.name)} already has this link, so the note stayed here.`)
                            return false
                          }
                          onMovedAway()
                        }, `Moved ${quoteOneLine(title)} to ${quoteOneLine(library.name)}.`)
                      }
                    >
                      <LibraryDot colour={library.colour} />
                      <span className="truncate">{library.name}</span>
                    </SelectedMenuRow>
                  ))}
                </ScrollArea>
              ) : (
                <p className="px-2 py-2 text-sm text-muted-foreground">This is your only library.</p>
              )
            ) : (
              NOTE_PRIORITIES.map((priority) => (
                <SelectedMenuRow
                  key={priority}
                  onClick={() => change({ change: "priority", priority }, `Set to ${PRIORITY_LABEL[priority]}.`)}
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
              ))
            )}
          </>
        ) : (
          <>
            <SelectedMenuRow
              onClick={() => change({ change: "pin", on: !note.pinned }, note.pinned ? "Unpinned." : "Pinned to the top.")}
            >
              {note.pinned ? <PinOffIcon className="size-4 text-muted-foreground" /> : <PinIcon className="size-4 text-muted-foreground" />}
              {note.pinned ? "Unpin" : "Pin"}
            </SelectedMenuRow>
            <SelectedMenuRow
              onClick={() =>
                change({ change: "archive", on: !note.archived }, note.archived ? "Back in its folder." : "Archived. Search still finds it.")
              }
            >
              {note.archived ? (
                <ArchiveRestoreIcon className="size-4 text-muted-foreground" />
              ) : (
                <ArchiveIcon className="size-4 text-muted-foreground" />
              )}
              {note.archived ? "Unarchive" : "Archive"}
            </SelectedMenuRow>
            <SelectedMenuSeparator />
            <SelectedMenuRow page="folder" onClick={() => setStep("folder")}>
              <FolderInputIcon className="size-4 text-muted-foreground" />
              Move to folder
            </SelectedMenuRow>
            <SelectedMenuRow page="library" onClick={() => setStep("library")}>
              <LibraryIcon className="size-4 text-muted-foreground" />
              Move to library
            </SelectedMenuRow>
            <SelectedMenuRow page="priority" onClick={() => setStep("priority")}>
              <ArrowUpIcon className="size-4 text-muted-foreground" />
              Priority
            </SelectedMenuRow>
            <SelectedMenuSeparator />
            <SelectedMenuRow
              onClick={() =>
                void run(async () => {
                  await onDuplicated(await duplicateLibraryNote(note.id))
                }, `Made a copy of ${quoteOneLine(title)}.`)
              }
            >
              <CopyIcon className="size-4 text-muted-foreground" />
              Duplicate
            </SelectedMenuRow>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
