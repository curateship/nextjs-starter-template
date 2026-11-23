import * as React from "react"
import { CalendarPlusIcon, CheckIcon, Loader2Icon, PlusIcon, XIcon } from "lucide-react"

import { PanelCard } from "@/components/shared/panel-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { MatchDetail } from "@/lib/api/dating/dashboard"

import { DatingPicture } from "./picture"
import { dateTimeWords, whenWords } from "./words"

function Line({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
}

/**
 * What they told you (part 2 of "features/01-chats-and-replies"), as small
 * tags under the profile's lines (task "features/05-dashboard-layout", part
 * 12). Pressing a tag changes it, its × deletes it, and + adds one. A fact the
 * member wrote or changed is theirs, and the AI never touches it.
 */
export function FactTags({
  match,
  onSave,
  onDelete,
}: {
  match: MatchDetail
  /** Resolves true once saved. `factId` null adds one. */
  onSave: (factId: string | null, text: string) => Promise<boolean>
  onDelete: (factId: string) => Promise<boolean>
}) {
  // The fact being changed, "new" while one is being added, or null.
  const [editing, setEditing] = React.useState<string | null>(null)
  const [text, setText] = React.useState("")
  const [busy, setBusy] = React.useState<string | null>(null)

  async function run(key: string, work: () => Promise<boolean>) {
    setBusy(key)
    try {
      return await work()
    } finally {
      setBusy(null)
    }
  }

  const form = (factId: string | null) => (
    <form
      className="flex items-center gap-1"
      onSubmit={(event) => {
        event.preventDefault()
        void run(factId ?? "new", () => onSave(factId, text)).then((ok) => ok && setEditing(null))
      }}
    >
      <Input aria-label={factId ? "The fact" : "A new fact"} value={text} maxLength={200} autoFocus placeholder="Has a dog called Biscuit" onChange={(event) => setText(event.target.value)} />
      <Button type="submit" variant="ghost" size="icon-sm" aria-label="Save the fact" disabled={busy === (factId ?? "new")}>
        {busy === (factId ?? "new") ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Stop changing it" onClick={() => setEditing(null)}>
        <XIcon />
      </Button>
    </form>
  )

  return (
    // One column that may shrink, so a long fact is cut with "…" rather than pushing the panel sideways.
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
      <p className="text-xs font-medium text-muted-foreground">What they told you</p>
      {editing && editing !== "new" ? form(editing) : null}
      <ul className="flex flex-wrap gap-1.5">
        {match.facts.map((fact) =>
          editing === fact.id ? null : (
            <li key={fact.id} className="max-w-full min-w-0">
              <Badge variant="secondary" className="max-w-full gap-0 py-0 pr-0.5 font-normal">
                <button
                  type="button"
                  className="min-w-0 truncate py-0.5 text-left"
                  aria-label={`Change "${fact.text}"`}
                  onClick={() => {
                    setEditing(fact.id)
                    setText(fact.text)
                  }}
                >
                  {fact.text}
                </button>
                <button
                  type="button"
                  className="ml-1 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
                  aria-label={`Delete "${fact.text}". The AI will not add it back.`}
                  disabled={busy === `delete:${fact.id}`}
                  onClick={() => void run(`delete:${fact.id}`, () => onDelete(fact.id))}
                >
                  {busy === `delete:${fact.id}` ? <Loader2Icon className="size-3 animate-spin" /> : <XIcon className="size-3" />}
                </button>
              </Badge>
            </li>
          )
        )}
        {editing === "new" ? null : (
          <li>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => {
                setEditing("new")
                setText("")
              }}
            >
              <PlusIcon /> Add one
            </Button>
          </li>
        )}
      </ul>
      {editing === "new" ? form(null) : null}
      {match.facts.length ? null : (
        <Line>
          {match.sample ? "A sample chat the AI has not read." : `Nothing yet. The AI notes what ${match.theirName} says about themselves as the chat goes on.`}
        </Line>
      )}
    </div>
  )
}

/**
 * Before your date (part 13 of "features/01-chats-and-replies"): shown once
 * they said yes to the date. Their photos, three lines from the chat, their
 * number, and the time and place, which only the member sets.
 */
export function DateBriefCard({ match, onPlan, onOpenPhoto }: { match: MatchDetail; onPlan: () => void; onOpenPhoto: (id: string) => void }) {
  if (!match.dateAcceptedAt) return null
  const photos = match.profile?.photoIds.length ? match.profile.photoIds : match.photoId ? [match.photoId] : []
  return (
    <PanelCard storageId="date-lead-brief" title="Before your date">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
        <Line>
          {match.theirName} said yes {whenWords(match.dateAcceptedAt)}
          {match.dateAcceptedLine ? `: "${match.dateAcceptedLine}"` : "."}
        </Line>
        {photos.length ? (
          <div className="flex flex-wrap gap-1.5">
            {photos.slice(0, 6).map((id, index) => (
              <button key={id} type="button" className="overflow-hidden rounded-md border" aria-label={`Open ${match.theirName}'s photo ${index + 1}`} onClick={() => onOpenPhoto(id)}>
                <DatingPicture pictureId={id} alt="" className="h-16 w-12" />
              </button>
            ))}
          </div>
        ) : null}
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">When</dt>
          <dd>{match.dateAt ? dateTimeWords(match.dateAt) : "Not set yet"}</dd>
          <dt className="text-muted-foreground">Where</dt>
          <dd>{match.datePlace || "Not set yet"}</dd>
          <dt className="text-muted-foreground">Their number</dt>
          <dd className="tabular-nums">{match.theirNumber || "Not sent in the chat"}</dd>
        </dl>
        {match.briefLines.length ? (
          <div className="grid gap-1">
            <p className="text-sm font-medium">From the chat</p>
            <ul className="grid list-disc gap-1 pl-4 text-sm leading-relaxed">
              {match.briefLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : match.sample || match.briefMadeAt ? null : (
          <Line>The AI picks three lines from the chat to remember on its next pass.</Line>
        )}
        <Button type="button" variant="outline" className="justify-self-start" onClick={onPlan}>
          <CalendarPlusIcon />
          {match.dateAt ? "Change the time or place" : "Add to calendar"}
        </Button>
      </div>
    </PanelCard>
  )
}

/**
 * The note to the AI about this chat only (part 19 of
 * "features/01-chats-and-replies"), opened by Note in the reply box. It saves
 * by itself 700ms after the last key, and at once when the field is left or
 * another lead is opened.
 */
export function ChatNote({ match, onSave }: { match: MatchDetail; onSave: (note: string) => Promise<boolean> }) {
  const noteId = React.useId()
  const [note, setNote] = React.useState(match.memberNote)
  const [status, setStatus] = React.useState<"idle" | "saving" | "saved" | "failed">("idle")
  const saved = React.useRef(match.memberNote)
  const typed = React.useRef(match.memberNote)
  // The newest save function, so the dashboard's refreshes never restart the wait.
  const saveRef = React.useRef(onSave)
  React.useEffect(() => {
    saveRef.current = onSave
  }, [onSave])

  const saveNow = React.useCallback(() => {
    const words = typed.current
    const before = saved.current
    if (words === before) return
    saved.current = words
    setStatus("saving")
    void saveRef.current(words).then((ok) => {
      // Not saved: the next key or leaving the field tries again.
      if (!ok) saved.current = before
      setStatus(ok ? "saved" : "failed")
    })
  }, [])

  React.useEffect(() => {
    typed.current = note
    if (note === saved.current) return
    const timer = setTimeout(saveNow, 700)
    return () => clearTimeout(timer)
  }, [note, saveNow])

  React.useEffect(() => () => saveNow(), [saveNow])

  return (
    <div className="grid gap-1">
      <Label htmlFor={noteId} className="px-1 text-xs text-muted-foreground">
        Note to the AI about this chat
      </Label>
      <Textarea
        id={noteId}
        value={note}
        rows={1}
        maxLength={1_000}
        placeholder="Slow down a bit. She's moving in March."
        onChange={(event) => setNote(event.target.value)}
        onBlur={saveNow}
      />
      <p className="px-1 text-xs text-muted-foreground" aria-live="polite">
        {status === "saving"
          ? "Saving…"
          : status === "saved"
            ? "Saved. The AI follows it in this chat only, and never over your rules."
            : status === "failed"
              ? "Not saved."
              : "The AI follows it in this chat only, and never over your rules."}
      </p>
    </div>
  )
}
