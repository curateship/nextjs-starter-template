import * as React from "react"
import { Loader2Icon, MessageSquareIcon, PencilIcon, SendIcon, SparklesIcon, Undo2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { MatchDetail } from "@/lib/api/dating/dashboard"

import { ChatNote } from "./chat-cards"
import { whenWords } from "./words"

export type ReplyActions = {
  send: (text: string) => Promise<boolean>
  /** Three fresh drafts to pick from. */
  showThree: () => void
  /** The AI's draft goes, and no new one is written for the same message. */
  dismissDraft: () => void
  /** The member's words tidied into their voice, or null when it failed (the toast says why). */
  tidy: (text: string) => Promise<string | null>
  setAiDrafts: (on: boolean) => void
  saveNote: (note: string) => Promise<boolean>
}

function draftLabel(match: MatchDetail): string {
  if (match.draftKind === "opener") return "AI first message"
  if (match.draftKind === "nudge") return "AI follow-up"
  return "AI draft"
}

/** Why the AI writes nothing here, when it does not. The member can still write and send. */
function quietWords(match: MatchDetail): string | null {
  if (match.aiOff) return "You took this chat over, so the AI writes nothing here."
  if (match.movedToTextAt) return `You moved this chat to text ${whenWords(match.movedToTextAt)}, so the AI writes nothing here.`
  if (match.endedAt) return "The AI read this chat as over, so it writes nothing here."
  return null
}

/**
 * The foot of the Chat tab, as Tyler's mock of 20 Oct 2026 draws it
 * (`workspace/docs/assets/pasted-image-1792550342758871000.png`), pinned while
 * the chat scrolls above it, white boxes on a light grey band (Tyler, the same
 * day, `pasted-image-1792551008786131000.png`: "bg here should be light gray
 * too"):
 *
 * - **The AI's draft** in its own box: "AI draft · 1 of 3" with Next to step
 *   through the three from Draft, Use this to put it in your box, and
 *   Dismiss to drop it. With automate on, when it goes out by itself.
 * - **Your box**, "Write your own reply", three lines tall to start (Tyler,
 *   20 Oct 2026: "the chat field needs to be 3 row"). It keeps what is typed
 *   while drafts come and go, and empties only on Send or another chat. With
 *   Draft (three new drafts), Tidy (your words in your voice, with Undo),
 *   Note (the note to the AI about this chat) and Send from phone.
 * - **AI drafts replies here**, the chat's own switch, and how many drafts are
 *   ready.
 */
export function ReplyBox({ match, automate, busy, actions }: { match: MatchDetail; automate: boolean; busy: string | null; actions: ReplyActions }) {
  const [text, setText] = React.useState("")
  // The member's own words from before a Tidy, for Undo.
  const [beforeTidy, setBeforeTidy] = React.useState<string | null>(null)
  const [noteOpen, setNoteOpen] = React.useState(Boolean(match.memberNote))
  const drafts = match.draft ? [match.draft, ...match.draftChoices] : []
  const [shown, setShown] = React.useState(0)
  // New drafts start again at the first; what the member typed stays.
  const madeAt = match.draftMadeAt ? new Date(match.draftMadeAt).getTime() : 0
  const [draftsFrom, setDraftsFrom] = React.useState(madeAt)
  if (madeAt !== draftsFrom) {
    setDraftsFrom(madeAt)
    setShown(0)
  }
  const at = Math.min(shown, Math.max(drafts.length - 1, 0))
  const boxId = React.useId()
  const switchId = React.useId()
  const automated = automate && Boolean(match.draft) && Boolean(match.draftSendAt)
  const quiet = quietWords(match)

  if (match.unmatchedAt) {
    return (
      <p className="border-t p-4 text-sm text-muted-foreground">
        {match.unmatchedBy === "them" ? `${match.theirName} unmatched you: the chat is gone from Tinder. Nothing can be sent.` : `You unmatched ${match.theirName}, so nothing can be sent.`}
      </p>
    )
  }

  return (
    <div className="grid gap-3 border-t bg-muted/50 p-3">
      {quiet ? <p className="px-1 text-xs text-muted-foreground">{quiet}</p> : null}
      {match.aiError ? <p className="px-1 text-sm text-destructive">{match.aiError}</p> : null}
      {drafts.length ? (
        <div className="grid gap-2 rounded-xl border bg-background p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <SparklesIcon className="size-3.5" aria-hidden />
            <span className="min-w-0 flex-1">
              {draftLabel(match)}
              {drafts.length > 1 ? ` · ${at + 1} of ${drafts.length}` : ""}
              {match.draftProposesDate && at === 0 ? " · suggests meeting up" : ""}
            </span>
            {drafts.length > 1 ? (
              <Button type="button" variant="ghost" size="xs" className="font-medium text-foreground" onClick={() => setShown((at + 1) % drafts.length)}>
                Next
              </Button>
            ) : null}
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-line">{drafts[at]}</p>
          {automated && match.draftSendAt && at === 0 ? (
            <p className="text-xs text-muted-foreground">
              Sends by itself at {whenWords(match.draftSendAt)}. Dismiss stops it, or switch automate off in the Dating settings.
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setText(drafts[at])
                setBeforeTidy(null)
              }}
            >
              Use this
            </Button>
            <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" disabled={busy === "dismiss"} onClick={actions.dismissDraft}>
              {busy === "dismiss" ? <Loader2Icon className="animate-spin" /> : null}
              Dismiss
            </Button>
          </div>
        </div>
      ) : match.aiBusy ? (
        <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <Loader2Icon className="size-3.5 animate-spin" /> The AI is writing a draft.
        </p>
      ) : null}

      {noteOpen ? <ChatNote key={`note:${match.id}`} match={match} onSave={actions.saveNote} /> : null}

      <form
        className="grid rounded-xl border bg-background focus-within:ring-[3px] focus-within:ring-ring/50"
        onSubmit={(event) => {
          event.preventDefault()
          void actions.send(text).then((ok) => {
            if (!ok) return
            setText("")
            setBeforeTidy(null)
          })
        }}
      >
        <Label htmlFor={boxId} className="sr-only">
          Your reply
        </Label>
        <Textarea
          id={boxId}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Write your own reply"
          rows={3}
          className="min-h-[calc(3lh+1rem)] max-h-48 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        <div className="flex flex-wrap items-center gap-1 px-2 pb-2">
          {quiet ? null : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="sm" disabled={busy === "three"} onClick={actions.showThree}>
                  {busy === "three" ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
                  Draft
                </Button>
              </TooltipTrigger>
              <TooltipContent>Three new drafts to pick from. Automate only ever sends the first.</TooltipContent>
            </Tooltip>
          )}
          {beforeTidy !== null ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setText(beforeTidy)
                setBeforeTidy(null)
              }}
            >
              <Undo2Icon /> Undo tidy
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy === "tidy"}
                  onClick={() => {
                    const mine = text
                    void actions.tidy(mine).then((tidied) => {
                      if (tidied === null) return
                      setBeforeTidy(mine)
                      setText(tidied)
                    })
                  }}
                >
                  {busy === "tidy" ? <Loader2Icon className="animate-spin" /> : <PencilIcon />}
                  Tidy
                </Button>
              </TooltipTrigger>
              <TooltipContent>Puts your own words in your voice, keeping what you meant. You see it before Send.</TooltipContent>
            </Tooltip>
          )}
          <Button type="button" variant="ghost" size="sm" aria-pressed={noteOpen} onClick={() => setNoteOpen(!noteOpen)}>
            <MessageSquareIcon />
            Note
          </Button>
          <Button type="submit" className="ml-auto" disabled={busy === "send"}>
            {busy === "send" ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
            Send from phone
          </Button>
        </div>
      </form>

      <div className="flex items-center gap-3 px-1">
        <Switch id={switchId} checked={!match.aiOff} onCheckedChange={actions.setAiDrafts} />
        <Label htmlFor={switchId} className="min-w-0 flex-1 text-sm font-normal">
          AI drafts replies here
        </Label>
        {drafts.length ? (
          <span className="shrink-0 text-xs text-muted-foreground">
            {drafts.length} {drafts.length === 1 ? "draft" : "drafts"} ready
          </span>
        ) : null}
      </div>
    </div>
  )
}
