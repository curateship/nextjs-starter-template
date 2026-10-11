import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { Trash2Icon } from "lucide-react"

import { ProjectColorSelect } from "@/components/project/project-form-fields"
import { LabelChip } from "@/components/project/task-bits"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { removeLabel, saveLabel, type Label } from "@/lib/api/project/sorting"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { LIMITS } from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The team's labels, in Team settings. Anyone makes a label from a task; the
 * owner and admins rename, recolour and delete them here. Deleting one takes
 * it off every task.
 */
export function TeamLabelsCard({ labels, canEdit }: { labels: Label[]; canEdit: boolean }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Labels</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          {labels.length === 0
            ? "No labels yet. Anyone on the team can make one from a task's Labels field."
            : canEdit
              ? "Labels work across every project. Make new ones from a task's Labels field."
              : "Labels work across every project. Only the owner and admins can rename or delete them."}
        </p>
        {labels.length ? (
          canEdit ? (
            <ul className="grid gap-2">
              {labels.map((label) => (
                <LabelRow key={label.id} label={label} />
              ))}
            </ul>
          ) : (
            <div className="flex flex-wrap gap-1">
              {labels.map((label) => (
                <LabelChip key={label.id} label={label} />
              ))}
            </div>
          )
        ) : null}
      </CardContent>
    </Card>
  )
}

function LabelRow({ label }: { label: Label }) {
  const router = useRouter()
  const [name, setName] = useSyncedDraft(label.name)
  const [confirming, setConfirming] = React.useState(false)
  // A refused or empty name stays in the box, marked, until it's fixed.
  const [invalid, setInvalid] = React.useState(false)
  const [run, busy] = useAsyncAction(getProjectErrorMessage)

  async function save(patch: { name?: string; color?: Label["color"] }) {
    if (await run(() => saveLabel({ labelId: label.id, ...patch }))) await router.invalidate()
    else if (patch.name !== undefined) setInvalid(true)
  }

  function commitName() {
    const next = name.trim()
    if (next === label.name) return
    if (!next) {
      setInvalid(true)
      showErrorToast("A label needs a name.")
      return
    }
    void save({ name: next })
  }

  return (
    <li className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
      <Input
        aria-label={`Label name: ${label.name}`}
        className="min-w-0 flex-1"
        value={name}
        maxLength={LIMITS.labelName}
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
      <ProjectColorSelect
        id={`label-color-${label.id}`}
        value={label.color}
        disabled={busy}
        onChange={(color) => void save({ color })}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Delete the label "${label.name}"`}
        onClick={() => setConfirming(true)}
      >
        <Trash2Icon className="size-4" />
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete "${label.name}"?`}
        description="It comes off every task that has it, in every project."
        confirmLabel="Delete label"
        destructive
        loading={busy}
        onConfirm={async () => {
          const ok = await run(() => removeLabel(label.id), "Label deleted.")
          if (!ok) return
          setConfirming(false)
          await router.invalidate()
        }}
      />
    </li>
  )
}
