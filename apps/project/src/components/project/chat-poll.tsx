import * as React from "react"
import { CheckIcon, Loader2Icon, PlusIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { sendChatPoll, voteOnChatPoll, type ChatPoll } from "@/lib/api/project/chat"
import { plural } from "@/lib/format/plural"
import { namesLine } from "@/lib/project/names-line"
import { LIMITS } from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

type Change = (work: () => Promise<unknown>, successText?: string) => Promise<boolean>

/**
 * A poll's choices under its question. Each person picks one; picking another
 * moves the vote, and picking mine again takes it back. Each choice shows its
 * count, and hovering it says who picked it, as reactions do (Tyler, 13 Oct
 * 2026). A vote tells nobody.
 */
export function PollChoices({
  commentId,
  poll,
  readOnly,
  change,
}: {
  commentId: string
  poll: ChatPoll
  readOnly: boolean
  change: Change
}) {
  const [busy, setBusy] = React.useState(false)

  async function vote(choice: number | null) {
    if (busy) return
    setBusy(true)
    await change(() => voteOnChatPoll({ commentId, choice }))
    setBusy(false)
  }

  return (
    <div className="grid gap-1.5">
      <ul className="grid gap-1" aria-label="Poll choices">
        {poll.choices.map((choice, index) => {
          const share = poll.voters ? Math.round((choice.people.length / poll.voters) * 100) : 0
          const who = choice.people.length ? namesLine(choice.people) : "Nobody yet"
          return (
            <li key={index}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-pressed={choice.mine}
                    aria-label={`${choice.text}: ${choice.people.length} ${plural(choice.people.length, "vote")}${choice.mine ? ", your pick" : ""}`}
                    disabled={readOnly || busy}
                    onClick={() => void vote(choice.mine ? null : index)}
                    className={cn(
                      "relative flex h-8 w-full max-w-md items-center gap-2 overflow-hidden rounded-md border px-2 text-left text-sm",
                      "hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-default disabled:hover:bg-transparent",
                      choice.mine && "border-primary"
                    )}
                  >
                    <span
                      aria-hidden
                      className="absolute inset-y-0 left-0 bg-primary/10"
                      style={{ width: `${share}%` }}
                    />
                    <span className="relative flex size-4 shrink-0 items-center justify-center">
                      {choice.mine ? <CheckIcon className="size-4 text-primary" aria-hidden /> : null}
                    </span>
                    <span className="relative min-w-0 flex-1 truncate">{choice.text}</span>
                    <span className="relative shrink-0 text-xs text-muted-foreground">{choice.people.length}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>{who}</TooltipContent>
              </Tooltip>
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        {poll.voters
          ? `${poll.voters} ${plural(poll.voters, "person", "people")} voted`
          : readOnly
            ? "Nobody voted."
            : "Nobody has voted yet. Pick one."}
      </p>
    </div>
  )
}

const FIRST_CHOICES = ["", ""]

/** "New poll": a question and 2 to 6 choices, sent into the project's chat. */
export function PollDialog({
  projectId,
  open,
  onClose,
  change,
}: {
  projectId: string
  open: boolean
  onClose: () => void
  change: Change
}) {
  const [question, setQuestion] = React.useState("")
  const [choices, setChoices] = React.useState(FIRST_CHOICES)
  const [invalid, setInvalid] = React.useState<{ question: boolean; choices: number[] }>({
    question: false,
    choices: [],
  })
  const [busy, setBusy] = React.useState(false)
  const dirty = Boolean(question.trim() || choices.some((choice) => choice.trim()))

  function close() {
    setQuestion("")
    setChoices(FIRST_CHOICES)
    setInvalid({ question: false, choices: [] })
    onClose()
  }

  async function send() {
    const asked = question.trim()
    const filled = choices.map((choice) => choice.trim())
    const empty = filled.flatMap((choice, index) => (choice ? [] : [index]))
    const lower = filled.map((choice) => choice.toLowerCase())
    const repeated = filled.flatMap((choice, index) =>
      choice && lower.indexOf(choice.toLowerCase()) !== index ? [index] : []
    )
    if (!asked || empty.length || repeated.length) {
      setInvalid({ question: !asked, choices: [...empty, ...repeated] })
      showErrorToast(
        !asked
          ? "Write the question first."
          : empty.length
            ? "Fill in every choice, or take the empty ones out."
            : "Each choice has to be different."
      )
      return
    }
    setBusy(true)
    const ok = await change(() => sendChatPoll({ projectId, question: asked, choices: filled }))
    setBusy(false)
    if (ok) close()
  }

  return (
    <FormDialog open={open} dirty={dirty} busy={busy} onClose={close}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New poll</DialogTitle>
            <DialogDescription>
              Everyone on the project picks one choice, and can see who picked what.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void send()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Question</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="poll-question">What are you asking?</Label>
                    <Input
                      id="poll-question"
                      value={question}
                      maxLength={LIMITS.pollQuestion}
                      aria-invalid={invalid.question || undefined}
                      onChange={(event) => {
                        setQuestion(event.target.value)
                        setInvalid((current) => ({ ...current, question: false }))
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Choices</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  {choices.map((choice, index) => (
                    <div key={index} className="grid gap-2">
                      <Label htmlFor={`poll-choice-${index}`}>Choice {index + 1}</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id={`poll-choice-${index}`}
                          value={choice}
                          maxLength={LIMITS.pollChoice}
                          aria-invalid={invalid.choices.includes(index) || undefined}
                          onChange={(event) => {
                            const text = event.target.value
                            setChoices((current) => current.map((old, at) => (at === index ? text : old)))
                            setInvalid((current) => ({
                              ...current,
                              choices: current.choices.filter((at) => at !== index),
                            }))
                          }}
                        />
                        {choices.length > LIMITS.pollChoicesMin ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Take out choice ${index + 1}`}
                            onClick={() => {
                              setChoices((current) => current.filter((_, at) => at !== index))
                              setInvalid((current) => ({ ...current, choices: [] }))
                            }}
                          >
                            <XIcon className="size-4" />
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {choices.length < LIMITS.pollChoicesMax ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="justify-self-start"
                      onClick={() => setChoices((current) => [...current, ""])}
                    >
                      <PlusIcon className="size-4" />
                      Add a choice
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={requestClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Send poll
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
