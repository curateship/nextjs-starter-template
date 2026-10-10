import * as React from "react"
import {
  CheckIcon,
  DownloadIcon,
  Loader2Icon,
  TriangleAlertIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DialogBody, DialogFooter } from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { Textarea } from "@/components/ui/textarea"
import {
  getMemberImportErrorMessage,
  importPixabayLinks,
  loadMemberImports,
  type MemberImportRow,
} from "@/lib/api/pomodoro/member-imports"
import { describePixabayRefusal, splitPixabayText } from "@/lib/pomodoro/pixabay-links"
import { MEMBER_IMPORT_MAX_LINKS } from "@/lib/pomodoro/member-imports"

/** How often the list re-reads while an import is waiting or running. */
const POLL_MS = 4000

/**
 * "From a Pixabay link", the upload window's second tab on Backgrounds (task
 * 06, part 8). The member pastes picture or film links, one per line; each
 * waits for the Pixabay worker and arrives in the grid as their own upload,
 * credited to its Pixabay author. See "From a Pixabay link" in
 * `workspace/docs/own-media-uploads.md`.
 */
export function PixabayImportPanel({
  tabs,
  onClose,
  onImported,
}: {
  /** The window's two tabs, drawn at the top of the body. */
  tabs: React.ReactNode
  onClose: () => void
  /** A file arrived: the card grid reads its list again. */
  onImported: () => void
}) {
  const [text, setText] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [result, setResult] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [imports, setImports] = React.useState<MemberImportRow[] | null>(null)
  const fieldId = React.useId()
  const readyCount = React.useRef<number | null>(null)

  const refresh = React.useCallback(
    () =>
      loadMemberImports()
        .then((rows) => {
          setImports(rows)
          const ready = rows.filter((row) => row.status === "ready").length
          if (readyCount.current !== null && ready > readyCount.current) onImported()
          readyCount.current = ready
        })
        .catch(() => setImports((current) => current ?? [])),
    [onImported]
  )

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  const waiting = (imports ?? []).some(
    (row) => row.status === "queued" || row.status === "running"
  )
  React.useEffect(() => {
    if (!waiting) return
    const timer = setInterval(() => void refresh(), POLL_MS)
    return () => clearInterval(timer)
  }, [refresh, waiting])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const entries = splitPixabayText(text).slice(0, MEMBER_IMPORT_MAX_LINKS)
    if (!entries.length) {
      setError("Paste a Pixabay link first.")
      return
    }
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const outcome = await importPixabayLinks(entries.map((entry) => entry.url))
      const lines = [
        outcome.added
          ? `${outcome.added} ${outcome.added === 1 ? "link is" : "links are"} on the way. Each appears in the grid when it arrives.`
          : null,
        // The server numbers the links it was sent; the box's own line
        // numbers count the blank lines too.
        ...outcome.refused.map((refusal) =>
          describePixabayRefusal({
            line: entries[refusal.line - 1]?.line ?? refusal.line,
            reason: refusal.reason,
          })
        ),
      ].filter(Boolean)
      setResult(lines.join(" "))
      if (outcome.added) setText("")
      await refresh()
    } catch (importError) {
      setError(getMemberImportErrorMessage(importError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
      <DialogBody>
        {tabs}
        <Card size="sm">
          <CardContent className="grid gap-2">
            <FieldLabel
              htmlFor={fieldId}
              hint="Photos, illustrations and films from pixabay.com, free to use. Music and sound effects cannot be copied this way: download them on Pixabay and upload the file. Each file counts against your space."
            >
              Pixabay links, one per line
            </FieldLabel>
            <Textarea
              id={fieldId}
              value={text}
              onChange={(event) => {
                setText(event.target.value)
                setError(null)
              }}
              placeholder="https://pixabay.com/videos/rain-window-drops-12345/"
              aria-invalid={error ? true : undefined}
              disabled={busy}
            />
            <p className="text-sm text-muted-foreground">
              Up to {MEMBER_IMPORT_MAX_LINKS} at once. The file keeps its
              Pixabay author's name.
            </p>
          </CardContent>
        </Card>

        {result ? (
          <p role="status" className="text-sm text-muted-foreground">
            {result}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {imports?.length ? (
          <Card size="sm">
            <CardHeader>
              <CardTitle>Your recent imports</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-1">
                {imports.map((row) => (
                  <ImportLine key={row.id} row={row} />
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? (
            <Loader2Icon className="animate-spin" aria-hidden="true" />
          ) : (
            <DownloadIcon aria-hidden="true" />
          )}
          Import
        </Button>
      </DialogFooter>
    </form>
  )
}

const STATUS_WORDS: Record<string, string> = {
  queued: "Waiting its turn",
  running: "Fetching it…",
  ready: "In the grid",
}

function ImportLine({ row }: { row: MemberImportRow }) {
  const failed = row.status === "failed"
  const working = row.status === "queued" || row.status === "running"
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      {working ? (
        <Loader2Icon className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
      ) : failed ? (
        <TriangleAlertIcon className="size-3.5 shrink-0 text-destructive" aria-hidden="true" />
      ) : (
        <CheckIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1 truncate" title={row.url}>
        {row.name}
      </span>
      <span className={failed ? "text-destructive" : "text-muted-foreground"}>
        {failed ? (row.failureReason ?? "Did not work") : STATUS_WORDS[row.status]}
      </span>
    </li>
  )
}
