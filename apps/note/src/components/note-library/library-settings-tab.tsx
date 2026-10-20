import * as React from "react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { useReportedSaveStatus } from "@/components/settings/use-reported-save-status"
import { CardGroup } from "@/components/ui/card"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { LoadingRow } from "@/components/ui/loading-row"
import { Textarea } from "@/components/ui/textarea"
import { SaveFromXButton } from "@/components/note-library/save-from-x-button"
import { getLibraryErrorMessage } from "@/lib/api/note/library"
import { loadAboutYou, saveAboutYouLine } from "@/lib/api/note/settings"
import { ABOUT_YOU_MAX } from "@/lib/note/library/notes"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/** How long after the last keystroke the line saves itself. */
const SAVE_AFTER_MS = 700

/**
 * The line as last read or saved, held for the life of the page, so coming
 * back to this tab draws at once instead of loading again. An edit goes in
 * before its save is sent, and comes back out if the save is refused.
 */
let held: string | null = null

/**
 * Settings → App settings → Library: the one line every imported note's plan
 * is written for (Tyler, 19 Oct 2026: "One line for the whole app"), which
 * saves itself as you type with no button, and the Save from x.com button to
 * drag to the bookmarks bar.
 */
export default function LibrarySettingsTab() {
  const [text, setText] = React.useState(() => held ?? "")
  const [ready, setReady] = React.useState(held !== null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)
  const [invalid, setInvalid] = React.useState(false)
  const setSaveStatus = useReportedSaveStatus()
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined)
  const queue = React.useRef<Promise<void>>(Promise.resolve())

  React.useEffect(() => () => clearTimeout(timer.current), [])

  React.useEffect(() => {
    if (held !== null) return
    let cancelled = false
    loadAboutYou()
      .then((loaded) => {
        held = loaded
        if (cancelled) return
        setText(loaded)
        setReady(true)
      })
      .catch((error) => {
        if (!cancelled) setLoadError(getLibraryErrorMessage(error))
      })
    return () => {
      cancelled = true
    }
  }, [reloads])

  // `value` rides in as an argument: the timer must save exactly what was
  // typed when it was set. Saves go one at a time, so a slow answer never
  // lands after a newer one.
  function save(value: string) {
    queue.current = queue.current.then(async () => {
      const clean = value.replace(/\s+/g, " ").trim()
      if (held === null || clean === held) return
      const before = held
      held = clean
      setSaveStatus("saving")
      dismissErrorToast()
      try {
        held = await saveAboutYouLine(clean)
        setInvalid(false)
        setSaveStatus("saved")
      } catch (error) {
        // What was typed stays in the box, marked, so a refused save loses nothing.
        held = before
        setInvalid(true)
        setSaveStatus("idle")
        showErrorToast(getLibraryErrorMessage(error))
      }
    })
  }

  return (
    <CardGroup>
      <CollapsibleSettingsCard
        storageId="note-library-about-you"
        title="About you"
        description="Every imported video's and post's action plan is written for this. It is one line for the whole app."
      >
        {loadError ? (
          <ErrorRow
            message={loadError}
            onRetry={() => {
              setLoadError(null)
              setReloads((reload) => reload + 1)
            }}
          />
        ) : !ready ? (
          <LoadingRow label="Reading the line…" />
        ) : (
          <div className="grid gap-2">
            <FieldLabel
              htmlFor="note-library-about-you"
              hint="Say what you do, so the plans fit it. Leave it empty for plans anybody could follow."
            >
              Write the plans for someone who
            </FieldLabel>
            <Textarea
              id="note-library-about-you"
              rows={1}
              value={text}
              maxLength={ABOUT_YOU_MAX}
              aria-invalid={invalid || undefined}
              placeholder="writes a newsletter about AI and Notion"
              onChange={(event) => {
                const next = event.target.value
                setText(next)
                clearTimeout(timer.current)
                timer.current = setTimeout(() => save(next), SAVE_AFTER_MS)
              }}
              onBlur={() => {
                clearTimeout(timer.current)
                save(text)
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  clearTimeout(timer.current)
                  save(text)
                }
              }}
            />
          </div>
        )}
      </CollapsibleSettingsCard>
      <CollapsibleSettingsCard
        storageId="note-library-save-from-x"
        title="Save from x.com"
        description="Drag this button to your bookmarks bar once. On any X post, click it and the post is imported into the X/Twitter folder of the library you opened last."
      >
        <div className="max-w-60">
          <SaveFromXButton />
        </div>
      </CollapsibleSettingsCard>
    </CardGroup>
  )
}
