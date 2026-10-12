import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { deleteTeamStepList, renameTeamStepList, type StepList } from "@/lib/api/project/planning"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { LIMITS } from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"

function stepCount(list: StepList) {
  return `${list.stepCount} ${list.stepCount === 1 ? "step" : "steps"}`
}

/**
 * The team's saved step lists, in Team settings. Anyone saves one from a
 * task's Steps card; the owner and admins rename and delete them here (Tyler's
 * choice, 12 Oct 2026). Deleting one leaves the steps already added to tasks.
 */
export function TeamStepListsCard({ lists, canEdit }: { lists: StepList[]; canEdit: boolean }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Step lists</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          {lists.length === 0
            ? "No step lists yet. Anyone on the team can save a task's steps as one from its Steps card."
            : canEdit
              ? "Saved from a task's Steps card. Anyone on the team can add them to a task."
              : "Saved from a task's Steps card. Only the owner and admins can rename or delete them."}
        </p>
        {lists.length ? (
          <ul className="grid gap-2">
            {lists.map((list) =>
              canEdit ? (
                <StepListRow key={list.id} list={list} />
              ) : (
                <li key={list.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">{list.name}</span>
                  <span className="shrink-0 text-muted-foreground">{stepCount(list)}</span>
                </li>
              )
            )}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  )
}

function StepListRow({ list }: { list: StepList }) {
  const router = useRouter()
  const [name, setName] = useSyncedDraft(list.name)
  const [confirming, setConfirming] = React.useState(false)
  // A refused or empty name stays in the box, marked, until it's fixed.
  const [invalid, setInvalid] = React.useState(false)
  const [run, busy] = useAsyncAction(getProjectErrorMessage)

  function commitName() {
    const next = name.trim()
    if (next === list.name) return
    if (!next) {
      setInvalid(true)
      showErrorToast("A step list needs a name.")
      return
    }
    void run(() => renameTeamStepList(list.id, next)).then(async (ok) => {
      if (ok) await router.invalidate()
      else setInvalid(true)
    })
  }

  return (
    <li className="flex items-center gap-2">
      <Input
        aria-label={`Step list name: ${list.name}`}
        className="min-w-0 flex-1"
        value={name}
        maxLength={LIMITS.stepListName}
        aria-invalid={invalid || undefined}
        onChange={(event) => {
          setName(event.target.value)
          setInvalid(false)
        }}
        onBlur={commitName}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
        }}
      />
      <span className="shrink-0 text-sm text-muted-foreground">{stepCount(list)}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Delete the step list "${list.name}"`}
        onClick={() => setConfirming(true)}
      >
        <Trash2Icon className="size-4" />
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete "${list.name}"?`}
        description="Nobody can add it to a task after this. Steps already added from it stay on their tasks."
        confirmLabel="Delete list"
        destructive
        loading={busy}
        onConfirm={async () => {
          const ok = await run(() => deleteTeamStepList(list.id), "Step list deleted.")
          if (!ok) return
          setConfirming(false)
          await router.invalidate()
        }}
      />
    </li>
  )
}
