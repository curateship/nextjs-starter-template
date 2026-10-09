import * as React from "react"
import { Link } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Textarea } from "@/components/ui/textarea"
import {
  getCatalogAdminErrorMessage,
  importCatalogFromPixabay,
} from "@/lib/api/pomodoro/admin-catalog"
import {
  getPixabayKeyErrorMessage,
  loadPixabayKeyStatus,
  type PixabayKeyStatus,
} from "@/lib/api/pomodoro/admin-pixabay"
import { plural } from "@/lib/format/plural"
import { CATALOG_BULK_MAX, type CatalogKind } from "@/lib/pomodoro/admin-catalog"
import { POMODORO_SETTINGS_TABS } from "@/lib/pomodoro/app-settings"
import {
  describePixabayRefusal,
  readPixabayLines,
  splitPixabayText,
} from "@/lib/pomodoro/pixabay-links"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * "Import from Pixabay": paste up to 25 pixabay.com links, one per line, and
 * each good one becomes a Draft. See "Import from Pixabay" in
 * `workspace/docs/catalog-admin.md`.
 *
 * Every line is read as it is typed and its problem shown under the box.
 * Import sends only the good lines; the server reads them again and refuses
 * any already in the catalogue. Themes need the Pixabay key, because their
 * pictures and films are fetched. Sounds do not: a music link is a Draft that
 * waits for the MP3 the admin downloads (Tyler, 9 Oct 2026).
 */

/** Past this many refusals the toast gives counts and the lines stay in the box. */
const REFUSALS_IN_TOAST = 3

const WORDS: Record<CatalogKind, { one: string; many: string }> = {
  theme: { one: "theme", many: "themes" },
  sound: { one: "sound", many: "sounds" },
}

type Refusal = { line: number; reason: string }

export function AdminCatalogImportDialog({
  kind,
  open,
  onClose,
  onImported,
}: {
  kind: CatalogKind
  open: boolean
  onClose: () => void
  /** Reads the list again; awaited before the window closes. */
  onImported: () => Promise<void>
}) {
  const words = WORDS[kind]
  const [text, setText] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  // The server's refusals from the last import, by the link they were about,
  // so they stay under the right line after the box is rewritten.
  const [serverReasons, setServerReasons] = React.useState<Map<string, string>>(
    () => new Map()
  )
  const [keyStatus, setKeyStatus] = React.useState<PixabayKeyStatus | null>(null)
  const [keyError, setKeyError] = React.useState<string | null>(null)
  const linksId = React.useId()
  const problemsId = React.useId()

  // Opening again starts with an empty box and asks about the key afresh.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setText("")
      setInvalid(false)
      setServerReasons(new Map())
      setKeyStatus(null)
      setKeyError(null)
    }
  }

  const needsKey = kind === "theme"
  React.useEffect(() => {
    if (!open || !needsKey) return
    let live = true
    loadPixabayKeyStatus().then(
      (status) => {
        if (live) setKeyStatus(status)
      },
      (error) => {
        if (live) setKeyError(getPixabayKeyErrorMessage(error))
      }
    )
    return () => {
      live = false
    }
  }, [open, needsKey])

  const lines = splitPixabayText(text)
  const read = readPixabayLines(lines, kind)
  const refusals: Refusal[] = read.flatMap((entry) => {
    if (!entry.ok) return [{ line: entry.line, reason: entry.reason }]
    const reason = serverReasons.get(entry.url)
    return reason ? [{ line: entry.line, reason }] : []
  })
  const good = read.filter((entry) => entry.ok && !serverReasons.has(entry.url))

  const submit = async () => {
    if (lines.length > CATALOG_BULK_MAX) {
      setInvalid(true)
      showErrorToast(`Paste up to ${CATALOG_BULK_MAX} links at a time. This list has ${lines.length}.`)
      return
    }
    if (!good.length) {
      setInvalid(true)
      showErrorToast(
        lines.length
          ? "None of these lines can be imported. Each line's problem is under the box."
          : "Paste at least one pixabay.com link."
      )
      return
    }
    setBusy(true)
    try {
      const result = await importCatalogFromPixabay(
        kind,
        good.map((entry) => ({ line: entry.line, url: entry.url }))
      )
      const refused = [...refusals, ...result.refused].sort((a, b) => a.line - b.line)
      const keepOpen = !result.added || refused.length > REFUSALS_IN_TOAST
      const message = describeImport(words, kind, result.added, refused)
      if (result.added) toast.success(message)
      else showErrorToast(message)
      await onImported()
      if (!keepOpen) {
        onClose()
        return
      }
      // Only the refused lines stay, each with its reason under the box.
      const refusedLines = new Set(refused.map((refusal) => refusal.line))
      const byLine = new Map(result.refused.map((refusal) => [refusal.line, refusal.reason]))
      const kept = lines.filter((entry) => refusedLines.has(entry.line))
      setServerReasons(
        new Map(
          kept.flatMap((entry) => {
            const reason = byLine.get(entry.line)
            return reason ? [[entry.url, reason] as const] : []
          })
        )
      )
      setText(kept.map((entry) => entry.url).join("\n"))
    } catch (error) {
      showErrorToast(getCatalogAdminErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const keyProblem = needsKey
    ? keyError ??
      (keyStatus?.unreadable
        ? "The saved Pixabay key can no longer be read. Paste it again in Settings → Pixabay."
        : keyStatus && !keyStatus.configured
          ? "Add the Pixabay API key in Settings → Pixabay first."
          : null)
    : null
  const keyLoading = needsKey && !keyStatus && !keyError
  const blocked = keyLoading || keyProblem !== null

  return (
    <FormDialog open={open} dirty={Boolean(text.trim())} busy={busy} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Import from Pixabay</DialogTitle>
            <DialogDescription>
              {kind === "theme"
                ? "Each photo or video link becomes a Draft theme. Its picture or film, artist and tags are fetched from Pixabay within a minute or two."
                : "Each music or sound effect link becomes a Draft sound with its name, source link and licence. Pixabay does not let its music be fetched, so download each MP3 from the link and drop it in the sound's window."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Links</CardTitle>
                  <CardDescription>
                    Up to {CATALOG_BULK_MAX} pixabay.com page links, one per line.
                    Each one is added as a Draft with the licence set to Free to use.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  {keyLoading ? (
                    <div className="flex justify-center py-6">
                      <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : keyProblem ? (
                    <div className="grid gap-2">
                      <p role="alert" className="text-sm">
                        {keyProblem}
                      </p>
                      <Button type="button" variant="outline" className="w-fit" asChild>
                        <Link to="/admin/settings/$tab"
                          params={{ tab: POMODORO_SETTINGS_TABS.pixabay }}>Open the Pixabay settings</Link>
                      </Button>
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      <FieldLabel htmlFor={linksId}>Pixabay links</FieldLabel>
                      <Textarea
                        id={linksId}
                        rows={1}
                        className="max-h-80"
                        placeholder={
                          kind === "theme"
                            ? "https://pixabay.com/videos/rain-window-28470/"
                            : "https://pixabay.com/music/lofi-chill-beats-573883/"
                        }
                        value={text}
                        spellCheck={false}
                        aria-invalid={invalid || undefined}
                        aria-describedby={problemsId}
                        onChange={(event) => {
                          setInvalid(false)
                          setText(event.target.value)
                        }}
                      />
                      <div id={problemsId} className="grid gap-1 text-sm">
                        <p className="text-muted-foreground">
                          {lines.length
                            ? `${good.length} of ${lines.length} ${plural(lines.length, "line is", "lines are")} ready to import.`
                            : "Nothing pasted yet."}
                          {lines.length > CATALOG_BULK_MAX
                            ? ` That is more than ${CATALOG_BULK_MAX}.`
                            : ""}
                        </p>
                        {refusals.length ? (
                          <ul className="grid gap-1 text-destructive">
                            {refusals.map((refusal) => (
                              <li key={refusal.line}>{describePixabayRefusal(refusal)}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              {blocked ? (
                <Button type="button" onClick={onClose}>
                  Done
                </Button>
              ) : (
                <>
                  <Button type="button" variant="outline" onClick={requestClose} disabled={busy}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={busy}>
                    {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                    Import
                  </Button>
                </>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}

/**
 * The line after an import, in Upload several's style: "18 themes added as
 * drafts. 2 were refused: line 4 is not a pixabay.com link; line 9 is already
 * in the catalogue as Forest fog." Semicolons, because a reason can hold a
 * comma of its own.
 */
function describeImport(
  words: { one: string; many: string },
  kind: CatalogKind,
  added: number,
  refused: Refusal[]
) {
  const parts = [
    `${added} ${plural(added, `${words.one} added as a draft`, `${words.many} added as drafts`)}.`,
  ]
  if (kind === "sound" && added)
    parts.push(added === 1 ? "It needs its file from Pixabay." : "Each needs its file from Pixabay.")
  if (refused.length > REFUSALS_IN_TOAST)
    parts.push(`${refused.length} were refused. Their lines are left in the window with the reasons.`)
  else if (refused.length)
    parts.push(
      `${refused.length} ${plural(refused.length, "was", "were")} refused: ${refused
        .map((refusal) => `line ${refusal.line} ${refusal.reason}`)
        .join("; ")}.`
    )
  return parts.join(" ")
}
