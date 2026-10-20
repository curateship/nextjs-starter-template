import * as React from "react"
import { ChevronDownIcon, ChevronLeftIcon, DownloadIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { SourceIcon } from "@/components/note-library/library-dot"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { SelectedMenuRow } from "@/components/shared/mass-select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { importNoteLink } from "@/lib/api/note/imports"
import { getLibraryErrorMessage } from "@/lib/api/note/library"
import { IMPORT_SOURCES, SOURCE_LABEL, type ImportSource, type NoteCard } from "@/lib/note/library/notes"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

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
 * The middle header's Import, as Tyler drew it on 20 Oct 2026: YouTube long,
 * YouTube short, Instagram, TikTok and X/Twitter, then Threads, LinkedIn,
 * Facebook and Reddit, which he added the same day. Picking one turns the menu
 * into one link box and Import, the same frame as every "New …" dropdown. The
 * note appears at once in that source's folder; a link that is another site's
 * is filed under its real one, and the toast says so.
 */
export function ImportDropdown({
  libraryId,
  onImported,
}: {
  libraryId: string
  onImported: (note: NoteCard) => Promise<void>
}) {
  const [open, setOpen] = React.useState(false)
  const [source, setSource] = React.useState<ImportSource | null>(null)
  // Kept when the menu shuts, so a link pasted and clicked away from is still there.
  const [link, setLink] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  async function submit(picked: ImportSource) {
    if (!link.trim()) {
      setInvalid(true)
      showErrorToast(`Paste a ${SOURCE_LABEL[picked]} link first.`)
      return
    }
    setBusy(true)
    dismissErrorToast()
    try {
      const result = await importNoteLink(libraryId, link)
      setLink("")
      setOpen(false)
      setSource(null)
      if (result.restored) toast.success("That link was in Trash, so it is back and open now.")
      else if (result.alreadyThere) toast.info("That link is already in this library, so it is open now.")
      else if (result.filedAs !== picked) {
        toast.success(`That is a ${SOURCE_LABEL[result.filedAs]} link, so it went in ${SOURCE_LABEL[result.filedAs]}.`)
      } else toast.success(`Importing into ${SOURCE_LABEL[result.filedAs]}.`)
      await onImported(result.note)
    } catch (error) {
      setInvalid(true)
      showErrorToast(getLibraryErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setSource(null)
      }}
    >
      <PopoverTrigger asChild>
        <DashboardToolbarButton type="button" variant="ghost" aria-label="Import">
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : <DownloadIcon className="size-4" />}
          <span className="@max-3xl:sr-only">Import</span>
          <ChevronDownIcon className="size-4 text-muted-foreground" />
        </DashboardToolbarButton>
      </PopoverTrigger>
      <PopoverContent align="end" className={source ? "w-80 p-3" : "w-56 gap-0 p-1"}>
        {source ? (
          <form
            className="grid gap-4"
            aria-label={`Import from ${SOURCE_LABEL[source]}`}
            onSubmit={(event) => {
              event.preventDefault()
              void submit(source)
            }}
          >
            <button
              type="button"
              onClick={() => setSource(null)}
              className="-mx-1 flex items-center gap-1.5 rounded-md px-1 text-left text-sm font-medium hover:text-muted-foreground"
            >
              <ChevronLeftIcon className="size-4 text-muted-foreground" />
              <SourceIcon source={source} />
              {SOURCE_LABEL[source]}
            </button>
            <div className="grid gap-2">
              <Label htmlFor="import-link">Link</Label>
              <Input
                id="import-link"
                autoFocus
                value={link}
                inputMode="url"
                aria-invalid={invalid || undefined}
                placeholder={PLACEHOLDER[source]}
                onChange={(event) => {
                  setLink(event.target.value)
                  setInvalid(false)
                }}
              />
            </div>
            <div className="flex items-center justify-end">
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Import
              </Button>
            </div>
          </form>
        ) : (
          IMPORT_SOURCES.map((each) => (
            <SelectedMenuRow key={each} onClick={() => setSource(each)}>
              <SourceIcon source={each} className="text-muted-foreground" />
              {SOURCE_LABEL[each]}
            </SelectedMenuRow>
          ))
        )}
      </PopoverContent>
    </Popover>
  )
}
