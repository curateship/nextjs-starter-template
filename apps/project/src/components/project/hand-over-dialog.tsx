import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"

import { PersonAvatar, RoomNote } from "@/components/project/task-bits"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { handOverAll, type HandOverOutcome } from "@/lib/api/project/team-running"
import type { TeamMemberRow } from "@/lib/api/project/teams"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { LIMITS } from "@/lib/project/rules"
import { usePeopleRoom } from "@/lib/project/use-people-room"
import { showErrorToast } from "@/lib/toast/error-toast"
import { useTeamId } from "@/lib/project/team-scope"

/**
 * Hands every open task of one person to someone else, for when they leave
 * or go away. Tasks in projects the receiver isn't on are left with nobody
 * assigned (Tyler's choice: nobody is added to a project), and the window
 * lists them with the reason. The receiver gets one notice with the count.
 */
export function HandOverDialog({
  from,
  members,
  onClose,
}: {
  from: TeamMemberRow | null
  members: TeamMemberRow[]
  onClose: () => void
}) {
  const teamId = useTeamId()
  const router = useRouter()
  const [to, setTo] = React.useState("")
  const [note, setNote] = React.useState("")
  const [outcome, setOutcome] = React.useState<HandOverOutcome | null>(null)
  const room = usePeopleRoom(Boolean(from))
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  // The person stays named while the window closes, when `from` is already
  // null, and each opening starts clean rather than each closing.
  const [shown, setShown] = React.useState(from)
  if (from && from !== shown) setShown(from)
  const [wasOpen, setWasOpen] = React.useState(Boolean(from))
  if (wasOpen !== Boolean(from)) {
    setWasOpen(Boolean(from))
    if (from) {
      setTo("")
      setNote("")
      setOutcome(null)
    }
  }
  const person = from ?? shown
  const others = members.filter((member) => member.userId !== person?.userId)
  const receiver = others.find((member) => member.userId === to)
  const leftProjects = new Set(outcome?.left.map((task) => task.projectName)).size

  async function handOver() {
    if (!from) return
    if (!receiver) {
      showErrorToast("Pick who gets the tasks.")
      return
    }
    let result: HandOverOutcome | null = null
    const ok = await run(async () => {
      result = await handOverAll(from.userId, receiver.userId, note.trim() || null, teamId)
    })
    if (!ok || !result) return
    setOutcome(result)
    await router.invalidate()
  }

  return (
    <Dialog open={Boolean(from)} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Hand over {person ? `${person.name}'s` : "their"} tasks</DialogTitle>
          <DialogDescription>
            Every task of theirs that isn't Done goes to the person you pick, who has to accept each
            one. Tasks in projects they aren't on are left with nobody assigned. A note goes with
            every task.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {outcome ? (
            <Card size="sm">
              <CardHeader>
                <CardTitle>Handed over</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm">
                <p>
                  {outcome.handed.length === 0
                    ? "No tasks were handed over."
                    : `${outcome.handed.length} ${outcome.handed.length === 1 ? "task" : "tasks"} handed to ${receiver?.name ?? "them"}. They got one notice.`}
                </p>
                {outcome.left.length ? (
                  <div className="grid gap-1">
                    <p className="font-medium">
                      Left with nobody assigned, because {receiver?.name ?? "they"} isn't on{" "}
                      {leftProjects > 1 ? "these projects" : "the project"}:
                    </p>
                    <ul className="grid gap-1 text-muted-foreground">
                      {outcome.left.map((task) => (
                        <li key={task.id} className="break-words">
                          {task.title} · {task.projectName}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <Card size="sm">
              <CardHeader>
                <CardTitle>Who gets them</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="hand-over-to">Hand them to</Label>
                  <Select value={to} onValueChange={setTo}>
                    <SelectTrigger id="hand-over-to" className="w-full sm:w-fit">
                      <SelectValue placeholder="Pick a teammate" />
                    </SelectTrigger>
                    <SelectContent>
                      {others.map((member) => (
                        <SelectItem key={member.userId} value={member.userId}>
                          <PersonAvatar name={member.name} avatarUrl={member.avatarUrl} />
                          {member.name}
                          {member.title ? ` · ${member.title}` : ""}
                          <RoomNote room={room[member.userId]} />
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="hand-over-note">Note (optional)</Label>
                  <Input
                    id="hand-over-note"
                    value={note}
                    maxLength={LIMITS.handoverNote}
                    placeholder="Ben is away until December"
                    onChange={(event) => setNote(event.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </DialogBody>
        <DialogFooter>
          {outcome ? (
            <Button type="button" onClick={onClose}>
              Done
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="button" disabled={busy} onClick={() => void handOver()}>
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Hand over tasks
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
