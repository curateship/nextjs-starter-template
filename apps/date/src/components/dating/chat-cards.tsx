import * as React from "react"
import { CalendarPlusIcon, CheckIcon, Loader2Icon, PlusIcon, SettingsIcon, Trash2Icon, XIcon } from "lucide-react"

import { InspectorCard } from "@/components/shared/inspector-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { MatchDetail } from "@/lib/api/dating/dashboard"

import { DatingPicture } from "./picture"
import { dateTimeWords, whenWords } from "./words"

function Line({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
}

/**
 * What they told you (part 2): the facts the AI kept from the chat. Each can
 * be changed or deleted, and the member can add one. A fact the member wrote
 * or changed is theirs, and the AI never touches it.
 */
export function FactsCard({
  match,
  onSave,
  onDelete,
}: {
  match: MatchDetail
  /** Resolves true once saved. `factId` null adds one. */
  onSave: (factId: string | null, text: string) => Promise<boolean>
  onDelete: (factId: string) => Promise<boolean>
}) {
  const [editing, setEditing] = React.useState<string | null>(null)
  const [text, setText] = React.useState("")
  const [adding, setAdding] = React.useState("")
  const [busy, setBusy] = React.useState<string | null>(null)
  const addId = React.useId()

  async function run(key: string, work: () => Promise<boolean>) {
    setBusy(key)
    try {
      return await work()
    } finally {
      setBusy(null)
    }
  }

  return (
    <InspectorCard storageId="date-rail-facts" title="What they told you">
      <div className="mt-3 grid gap-3">
        {match.facts.length ? (
          <ul className="grid gap-1.5">
            {match.facts.map((fact) =>
              editing === fact.id ? (
                <li key={fact.id}>
                  <form
                    className="flex items-center gap-1"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void run(fact.id, () => onSave(fact.id, text)).then((ok) => ok && setEditing(null))
                    }}
                  >
                    <Input aria-label="The fact" value={text} maxLength={200} autoFocus onChange={(event) => setText(event.target.value)} />
                    <Button type="submit" variant="ghost" size="icon" aria-label="Save the fact" disabled={busy === fact.id}>
                      {busy === fact.id ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
                    </Button>
                    <Button type="button" variant="ghost" size="icon" aria-label="Stop changing it" onClick={() => setEditing(null)}>
                      <XIcon />
                    </Button>
                  </form>
                </li>
              ) : (
                <li key={fact.id} className="flex items-start gap-1 text-sm">
                  <span className="min-w-0 flex-1 py-1.5 leading-snug">{fact.text}</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Change "${fact.text}"`}
                        onClick={() => {
                          setEditing(fact.id)
                          setText(fact.text)
                        }}
                      >
                        <SettingsIcon />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Change it</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete "${fact.text}"`}
                        disabled={busy === `delete:${fact.id}`}
                        onClick={() => void run(`delete:${fact.id}`, () => onDelete(fact.id))}
                      >
                        {busy === `delete:${fact.id}` ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Delete it. The AI will not add it back.</TooltipContent>
                  </Tooltip>
                </li>
              )
            )}
          </ul>
        ) : (
          <Line>
            {match.sample
              ? "A sample chat the AI has not read."
              : `Nothing yet. The AI notes what ${match.theirName} says about themselves as the chat goes on.`}
          </Line>
        )}
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void run("add", () => onSave(null, adding)).then((ok) => ok && setAdding(""))
          }}
        >
          <Label htmlFor={addId}>Add one yourself</Label>
          <div className="flex gap-2">
            <Input id={addId} value={adding} maxLength={200} placeholder="Has a dog called Biscuit" onChange={(event) => setAdding(event.target.value)} />
            <Button type="submit" variant="outline" disabled={busy === "add"} aria-label="Add the fact">
              {busy === "add" ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
              Add
            </Button>
          </div>
        </form>
      </div>
    </InspectorCard>
  )
}

/**
 * Before your date (part 13): shown once they said yes to the date. Their
 * photos, what they told you, three lines from the chat, their number, and
 * the time and place, which only the member sets.
 */
export function DateBriefCard({ match, onPlan, onOpenPhoto }: { match: MatchDetail; onPlan: () => void; onOpenPhoto: (id: string) => void }) {
  if (!match.dateAcceptedAt) return null
  const photos = match.profile?.photoIds.length ? match.profile.photoIds : match.photoId ? [match.photoId] : []
  return (
    <InspectorCard storageId="date-rail-brief" title="Before your date">
      <div className="mt-3 grid gap-3">
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
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
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
        {match.facts.length ? (
          <div className="grid gap-1">
            <p className="text-sm font-medium">What they told you</p>
            <ul className="grid list-disc gap-1 pl-4 text-sm leading-relaxed">
              {match.facts.slice(0, 6).map((fact) => (
                <li key={fact.id}>{fact.text}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <Button type="button" variant="outline" className="justify-self-start" onClick={onPlan}>
          <CalendarPlusIcon />
          {match.dateAt ? "Change the time or place" : "Add to calendar"}
        </Button>
      </div>
    </InspectorCard>
  )
}

/**
 * This chat (parts 18 and 19): the "AI drafts here" switch and the member's
 * note to the AI about this chat only, saved by itself as it is typed.
 */
export function ChatSettingsCard({
  match,
  onAiDrafts,
  onSaveNote,
}: {
  match: MatchDetail
  onAiDrafts: (on: boolean) => void
  onSaveNote: (note: string) => Promise<boolean>
}) {
  const switchId = React.useId()
  const noteId = React.useId()
  const [note, setNote] = React.useState(match.memberNote)
  const [status, setStatus] = React.useState<"idle" | "saving" | "saved" | "failed">("idle")
  const saved = React.useRef(match.memberNote)
  const typed = React.useRef(match.memberNote)
  // The newest save function, so the dashboard's refreshes never restart the wait.
  const saveRef = React.useRef(onSaveNote)
  React.useEffect(() => {
    saveRef.current = onSaveNote
  }, [onSaveNote])

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

  // Saves 700ms after the last key, like Settings, and at once when the field is left.
  React.useEffect(() => {
    typed.current = note
    if (note === saved.current) return
    const timer = setTimeout(saveNow, 700)
    return () => clearTimeout(timer)
  }, [note, saveNow])

  // Opening another chat before the wait is over still saves what was typed.
  React.useEffect(() => () => saveNow(), [saveNow])

  return (
    <InspectorCard storageId="date-rail-chat" title="This chat">
      <div className="mt-3 grid gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="grid gap-1">
            <Label htmlFor={switchId}>AI drafts here</Label>
            <p className="text-xs text-muted-foreground">
              {match.aiOff ? "Off: you write every message in this chat yourself." : "On: the AI drafts replies here by your rules."}
            </p>
          </div>
          <Switch id={switchId} checked={!match.aiOff} onCheckedChange={onAiDrafts} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={noteId}>A note to the AI about this chat</Label>
          <Textarea
            id={noteId}
            value={note}
            rows={1}
            maxLength={1_000}
            placeholder="Slow down a bit. She's moving in March."
            onChange={(event) => setNote(event.target.value)}
            onBlur={saveNow}
          />
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {status === "saving"
              ? "Saving…"
              : status === "saved"
                ? "Saved. The AI follows it in this chat only, and never over your rules."
                : status === "failed"
                  ? "Not saved."
                  : "The AI follows it in this chat only, and never over your rules."}
          </p>
        </div>
      </div>
    </InspectorCard>
  )
}
