import * as React from "react"
import { ChevronLeftIcon, FileUpIcon, Loader2Icon, PencilLineIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { SourceIcon } from "@/components/note-library/library-dot"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { SelectedMenuRow } from "@/components/shared/mass-select"
import { NewRecordDropdown } from "@/components/shared/new-record-dropdown"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { importNoteLink } from "@/lib/api/note/imports"
import { getLibraryErrorMessage } from "@/lib/api/note/library"
import { createNoteIn } from "@/lib/api/note/notes"
import {
  IMPORT_SOURCES,
  NOTE_PRIORITIES,
  NOTE_TITLE_MAX,
  PRIORITY_LABEL,
  SOURCE_LABEL,
  type ImportSource,
  type LibraryPage,
  type NoteCard,
  type NoteDetail,
  type NotePriority,
} from "@/lib/note/library/notes"
import { markdownToNote } from "@/lib/note/notes/markdown"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

const BLANK = "__blank"

const PLACEHOLDER: Record<ImportSource, string> = {
  youtube_long: "https://www.youtube.com/watch?v=…",
  youtube_short: "https://www.youtube.com/shorts/…",
  instagram: "https://www.instagram.com/reel/…",
  tiktok: "https://www.tiktok.com/@…/video/…",
  x: "https://x.com/…/status/…",
  threads: "https://www.threads.com/@…/post/…",
  linkedin: "https://www.linkedin.com/posts/…",
  facebook: "https://www.facebook.com/reel/…",
  reddit: "https://www.reddit.com/r/…/comments/…",
}

/**
 * New note, the middle header's one primary button. A dropdown, not a window
 * (UI standard). Its first step is the ways to add a note (the Admin 3 panel
 * design: "A second way to add something goes in the New … button's dropdown
 * as a first choice"): Write a note, then each import source Tyler drew on
 * 20 Oct 2026 (YouTube long, YouTube short, Instagram, TikTok, X/Twitter,
 * Threads, LinkedIn, Facebook, Reddit), which were the Import button's, and
 * last Import Markdown, which was a folder's until folders went (Tyler,
 * 15 Nov 2026: "Remove folder block and folder feature").
 *
 * - **Write a note:** the title first, then the priority, then a template
 *   when the library has any, and "Create note" at the bottom right.
 * - **A source:** one link box and Import. The note appears at once; a link
 *   that is another site's is read as its real one.
 * - **Import Markdown:** picks .md files, one note a file, read in the
 *   browser and checked again on the server. The last one opens.
 *
 * Clicking away keeps the typed title and link for the next opening.
 */
export function NewNoteDropdown({
  page,
  onMade,
  onImported,
}: {
  page: LibraryPage
  onMade: (note: NoteDetail) => Promise<void>
  onImported: (note: NoteCard) => Promise<void>
}) {
  const [open, setOpen] = React.useState(false)
  const [step, setStep] = React.useState<"write" | ImportSource | null>(null)
  const [link, setLink] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const [title, setTitle] = React.useState("")
  const [priority, setPriority] = React.useState<NotePriority>("normal")
  const [template, setTemplate] = React.useState(BLANK)
  const [busy, setBusy] = React.useState(false)

  // Each opening starts from Normal and a blank note; the title is kept.
  function openChange(next: boolean) {
    setOpen(next)
    if (!next) setStep(null)
    if (next) {
      setPriority("normal")
      setTemplate(BLANK)
    }
  }

  const fileInput = React.useRef<HTMLInputElement>(null)

  /** Import Markdown: one note a file, read in the browser and checked again on the server. */
  async function importMarkdown(files: FileList) {
    setBusy(true)
    dismissErrorToast()
    let last: NoteDetail | null = null
    try {
      for (const file of Array.from(files)) {
        const note = markdownToNote(file.name, await file.text())
        last = await createNoteIn({
          libraryId: page.library.id,
          title: note.title,
          body: note.body as Record<string, unknown>,
          tags: note.tags,
          priority: note.priority,
        })
      }
    } catch (error) {
      showErrorToast(getLibraryErrorMessage(error))
    } finally {
      setBusy(false)
    }
    if (last) await onMade(last)
  }

  async function importLink(source: ImportSource) {
    if (!link.trim()) {
      setInvalid(true)
      showErrorToast(`Paste a ${SOURCE_LABEL[source]} link first.`)
      return
    }
    setBusy(true)
    dismissErrorToast()
    try {
      const result = await importNoteLink(page.library.id, link)
      setLink("")
      openChange(false)
      if (result.alreadyThere) toast.info("That link is already in this library, so it is open now.")
      await onImported(result.note)
    } catch (error) {
      setInvalid(true)
      showErrorToast(getLibraryErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function submit() {
    if (step !== "write" && step !== null) {
      await importLink(step)
      return
    }
    setBusy(true)
    dismissErrorToast()
    try {
      const made = await createNoteIn({
        libraryId: page.library.id,
        templateId: template === BLANK ? null : template,
        title,
        priority,
      })
      setOpen(false)
      setTitle("")
      await onMade(made)
    } catch (error) {
      showErrorToast(getLibraryErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
    <input
      ref={fileInput}
      type="file"
      accept=".md,.markdown,text/markdown"
      multiple
      className="hidden"
      onChange={(event) => {
        const files = event.target.files
        if (files?.length) void importMarkdown(files)
        event.target.value = ""
      }}
    />
    <NewRecordDropdown
      label="New note"
      open={open}
      onOpenChange={openChange}
      submitLabel={step === "write" ? "Create note" : "Import"}
      busy={busy}
      onSubmit={() => void submit()}
      choices={
        step === null ? (
          <div className="grid">
            <SelectedMenuRow onClick={() => setStep("write")}>
              <PencilLineIcon className="size-4 text-muted-foreground" />
              Write a note
            </SelectedMenuRow>
            {IMPORT_SOURCES.map((each) => (
              <SelectedMenuRow key={each} onClick={() => setStep(each)}>
                <SourceIcon source={each} className="text-muted-foreground" />
                {SOURCE_LABEL[each]}
              </SelectedMenuRow>
            ))}
            <SelectedMenuRow
              onClick={() => {
                openChange(false)
                fileInput.current?.click()
              }}
            >
              <FileUpIcon className="size-4 text-muted-foreground" />
              Import Markdown
            </SelectedMenuRow>
          </div>
        ) : undefined
      }
      trigger={
        <DashboardToolbarButton type="button" aria-label="New note">
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
          <span className="@max-3xl:sr-only">New note</span>
        </DashboardToolbarButton>
      }
    >
      <button
        type="button"
        onClick={() => setStep(null)}
        className="-mx-1 flex items-center gap-1.5 rounded-md px-1 text-left text-sm font-medium hover:text-muted-foreground"
      >
        <ChevronLeftIcon className="size-4 text-muted-foreground" />
        {step && step !== "write" ? (
          <>
            <SourceIcon source={step} />
            {SOURCE_LABEL[step]}
          </>
        ) : (
          "Write a note"
        )}
      </button>
      {step && step !== "write" ? (
        <div className="grid gap-2">
          <Label htmlFor="import-link">Link</Label>
          <Input
            id="import-link"
            autoFocus
            value={link}
            inputMode="url"
            aria-invalid={invalid || undefined}
            placeholder={PLACEHOLDER[step]}
            onChange={(event) => {
              setLink(event.target.value)
              setInvalid(false)
            }}
          />
        </div>
      ) : (
      <>
      <div className="grid gap-2">
        <Label htmlFor="new-note-title">Title</Label>
        <Input
          id="new-note-title"
          autoFocus
          value={title}
          maxLength={NOTE_TITLE_MAX}
          placeholder="Untitled"
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <div className="grid gap-2">
          <Label htmlFor="new-note-priority">Priority</Label>
          <Select value={priority} onValueChange={(next) => setPriority(next as NotePriority)}>
            <SelectTrigger id="new-note-priority" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NOTE_PRIORITIES.map((each) => (
                <SelectItem key={each} value={each}>
                  {PRIORITY_LABEL[each]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      {page.templates.length ? (
        <div className="grid gap-2">
          <Label htmlFor="new-note-template">Template</Label>
          <Select value={template} onValueChange={setTemplate}>
            <SelectTrigger id="new-note-template" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={BLANK}>Blank note</SelectItem>
              {page.templates.map((each) => (
                <SelectItem key={each.id} value={each.id}>
                  {each.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      </>
      )}
    </NewRecordDropdown>
    </>
  )
}
