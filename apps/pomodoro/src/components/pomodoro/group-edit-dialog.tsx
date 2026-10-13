import * as React from "react"

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
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { GroupMembersList } from "@/components/pomodoro/group-members-card"
import {
  WindowQuestionView,
  type WindowQuestion,
} from "@/components/pomodoro/group-window-question"
import { TeamPageSettingsFields } from "@/components/pomodoro/team-page-settings"
import {
  deleteFocusGroup,
  saveFocusGroupDetails,
  type loadMyGroups,
} from "@/lib/api/pomodoro/groups"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import {
  groupErrorMessage,
  MAX_GROUP_DESCRIPTION_LENGTH,
  MAX_GROUP_GOAL_HOURS,
  MAX_GROUP_NAME_LENGTH,
  MIN_GROUP_GOAL_HOURS,
  MIN_GROUP_NAME_LENGTH,
} from "@/lib/pomodoro/groups"
import { browserTimezone } from "@/lib/pomodoro/timer"
import { showErrorToast } from "@/lib/toast/error-toast"

type Group = Awaited<ReturnType<typeof loadMyGroups>>[number]

/** Every timezone this browser knows, with the group's own always in it. */
function timezoneChoices(current: string) {
  const known =
    typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : [current, browserTimezone(), "UTC"]
  return [...new Set([current, ...known])].sort((a, b) => a.localeCompare(b))
}

/**
 * Edit group, the owner's window for running a group, opened by the Edit
 * group button on its card (Tyler, 13 Oct 2026,
 * `workspace/docs/assets/pasted-image-1791912753026340000.png`).
 *
 * Four sections: the name and the line under it, the board's timezone and
 * weekly goal (groups task 01, parts 1, 5, 16 and 18), Who is in it, and the
 * public page. Delete group sits at the far left of the footer.
 *
 * The first two save together with Save changes, because a rename shows on
 * the group's public page and in every member's list the moment it lands.
 * Who is in it and the public page act at once, the way they did as panels.
 * Their questions (Remove, Make owner, a new page address) and Delete take
 * the window's place until answered, because no window opens on a window.
 */
export function GroupEditDialog({
  group,
  open,
  onOpenChange,
  onSaved,
  onGone,
}: {
  group: Group
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Refreshes the groups list after anything here changed. */
  onSaved: () => Promise<unknown>
  /** The group was deleted. */
  onGone: () => Promise<void>
}) {
  const [question, setQuestion] = React.useState<WindowQuestion | null>(null)
  // The parent remounts this window on every open, so these start from the
  // saved group without an effect copying them in afterwards.
  const [name, setName] = React.useState(group.name)
  const [description, setDescription] = React.useState(group.description ?? "")
  const [timezone, setTimezone] = React.useState(group.timezone)
  const [goal, setGoal] = React.useState(
    group.weeklyGoalHours === null ? "" : String(group.weeklyGoalHours)
  )
  const [run, busy] = useAsyncAction(groupErrorMessage)
  const choices = React.useMemo(() => timezoneChoices(group.timezone), [group.timezone])

  const trimmedName = name.trim()
  const nameShort = trimmedName.length < MIN_GROUP_NAME_LENGTH
  const goalHours = goal.trim() === "" ? null : Number(goal)
  const goalBad =
    goalHours !== null &&
    (!Number.isInteger(goalHours) ||
      goalHours < MIN_GROUP_GOAL_HOURS ||
      goalHours > MAX_GROUP_GOAL_HOURS)
  const dirty =
    trimmedName !== group.name ||
    description.trim() !== (group.description ?? "") ||
    timezone !== group.timezone ||
    goalHours !== group.weeklyGoalHours

  const askDelete = () =>
    setQuestion({
      title: `Delete ${group.name}?`,
      description:
        "The group, its board and its public page go, and its link stops working for everybody. Nobody's own focus history is touched.",
      confirmLabel: "Delete group",
      onConfirm: () =>
        run(async () => {
          await deleteFocusGroup(group.id)
          onOpenChange(false)
          await onGone()
        }, "Group deleted."),
    })

  const save = async () => {
    // The button stays live and says what is wrong, rather than going dead.
    if (nameShort) {
      showErrorToast(
        `A group's name needs at least ${MIN_GROUP_NAME_LENGTH} characters.`
      )
      return
    }
    if (goalBad) {
      showErrorToast(
        `A weekly goal is a whole number of hours, ${MIN_GROUP_GOAL_HOURS} to ${MAX_GROUP_GOAL_HOURS}. Leave it empty for no goal.`
      )
      return
    }
    const saved = await run(async () => {
      await saveFocusGroupDetails(group.id, {
        name: trimmedName,
        description: description.trim() || null,
        timezone,
        weeklyGoalHours: goalHours,
      })
      await onSaved()
    }, "Group saved.")
    if (saved) onOpenChange(false)
  }

  return (
    <FormDialog
      open={open}
      dirty={dirty}
      busy={busy}
      onClose={() => onOpenChange(false)}
    >
      {(requestClose) => (
        <DialogContent
          variant="admin"
          // While a question is up, Escape goes back to the window rather
          // than closing it.
          onEscapeKeyDown={(event) => {
            if (!question) return
            event.preventDefault()
            question.onCancel?.()
            setQuestion(null)
          }}
        >
          {question ? (
            <WindowQuestionView
              key={question.title}
              question={question}
              onDone={() => setQuestion(null)}
            />
          ) : (
          <>
          <DialogHeader>
            <DialogTitle>Edit group</DialogTitle>
            <DialogDescription>
              The name and the line under it show to everybody in the group,
              on the invite page, and on the group&apos;s public page if it
              has one.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>What it is called</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="group-settings-name">Group name</Label>
                  <Input
                    id="group-settings-name"
                    value={name}
                    maxLength={MAX_GROUP_NAME_LENGTH}
                    aria-invalid={nameShort}
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="group-settings-line"
                    hint={`Up to ${MAX_GROUP_DESCRIPTION_LENGTH} characters. Leave it empty for none.`}
                  >
                    Line under the name
                  </FieldLabel>
                  <Textarea
                    id="group-settings-line"
                    rows={1}
                    value={description}
                    maxLength={MAX_GROUP_DESCRIPTION_LENGTH}
                    placeholder="Thesis writers, weekday mornings"
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardTitle>The board</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="group-settings-timezone"
                    hint="Every member's board counts days and weeks in this timezone, so everybody sees the same week and the same winner. A week runs Monday to Sunday."
                  >
                    Timezone
                  </FieldLabel>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger id="group-settings-timezone" aria-label="Timezone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {choices.map((choice) => (
                        <SelectItem key={choice} value={choice}>
                          {choice.replaceAll("_", " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="group-settings-goal"
                    hint="Combined hours the group aims for each week. Everybody hears in the bell when the group gets there. Leave it empty for no goal."
                  >
                    Weekly goal, in hours
                  </FieldLabel>
                  <Input
                    id="group-settings-goal"
                    inputMode="numeric"
                    className="w-32"
                    value={goal}
                    aria-invalid={goalBad}
                    placeholder="40"
                    onChange={(event) => setGoal(event.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Who is in it</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <GroupMembersList group={group} onChanged={onSaved} ask={setQuestion} />
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Public page</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <TeamPageSettingsFields groupId={group.id} onChanged={onSaved} ask={setQuestion} />
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="destructive"
              className="mr-auto"
              disabled={busy}
              onClick={askDelete}
            >
              Delete group
            </Button>
            <Button variant="outline" disabled={busy} onClick={requestClose}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void save()}>
              Save changes
            </Button>
          </DialogFooter>
          </>
          )}
        </DialogContent>
      )}
    </FormDialog>
  )
}
