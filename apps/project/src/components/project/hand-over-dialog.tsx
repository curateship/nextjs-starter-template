import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"

import { PersonAvatar } from "@/components/project/task-bits"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { showErrorToast } from "@/lib/toast/error-toast"

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
  const router = useRouter()
  const [to, setTo] = React.useState("")
  const [outcome, setOutcome] = React.useState<HandOverOutcome | null>(null)
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const others = members.filter((member) => member.userId !== from?.userId)
  const receiver = others.find((member) => member.userId === to)

  function close() {
    setTo("")
    setOutcome(null)
    onClose()
  }

  async function handOver() {
    if (!from) return
    if (!receiver) {
      showErrorToast("Pick who gets the tasks.")
      return
    }
    let result: HandOverOutcome | null = null
    const ok = await run(async () => {
      result = await handOverAll(from.userId, receiver.userId)
    })
    if (!ok || !result) return
    setOutcome(result)
    await router.invalidate()
  }

  return (
    <Dialog open={Boolean(from)} onOpenChange={(open) => (open ? null : close())}>
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Hand over {from?.name ?? "their"}'s tasks</DialogTitle>
          <DialogDescription>
            Every task of theirs that isn't Done goes to the person you pick, who has to accept each
            one. Tasks in projects they aren't on are left with nobody assigned.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {outcome ? (
            <div className="grid gap-3 text-sm">
              <p>
                {outcome.handed.length === 0
                  ? "No tasks were handed over."
                  : `${outcome.handed.length} ${outcome.handed.length === 1 ? "task" : "tasks"} handed to ${receiver?.name ?? "them"}. They got one notice.`}
              </p>
              {outcome.left.length ? (
                <div className="grid gap-1">
                  <p className="font-medium">
                    Left with nobody assigned, because {receiver?.name ?? "they"} isn't on the project:
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
            </div>
          ) : (
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
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          {outcome ? (
            <Button type="button" onClick={close}>
              Done
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={close} disabled={busy}>
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
