import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { Trash2Icon } from "lucide-react"

import { ProjectDot } from "@/components/project/task-bits"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import {
  deleteProjectTemplate,
  renameProjectTemplate,
  type TemplateRow,
} from "@/lib/api/project/projects"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { LIMITS } from "@/lib/project/rules"
import { taskCount } from "@/lib/project/templates"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The team's saved project templates, in Team settings. Anyone saves one from
 * a project's settings and starts from one in New project; the owner and
 * admins rename and delete them here, the same as step lists. Deleting one
 * leaves the projects already started from it.
 */
export function TeamTemplatesCard({ templates, canEdit }: { templates: TemplateRow[]; canEdit: boolean }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Project templates</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          {templates.length === 0
            ? "No templates yet. Save a project as one from its Project settings."
            : canEdit
              ? "Saved from a project's settings. Anyone on the team can start a new project from one."
              : "Saved from a project's settings. Only the owner and admins can rename or delete them."}
        </p>
        {templates.length ? (
          <ul className="grid gap-2">
            {templates.map((template) =>
              canEdit ? (
                <TemplateRowEditor key={template.id} template={template} />
              ) : (
                <li key={template.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <ProjectDot color={template.color} />
                    <span className="truncate">{template.name}</span>
                  </span>
                  <span className="shrink-0 text-muted-foreground">{taskCount(template)}</span>
                </li>
              )
            )}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  )
}

function TemplateRowEditor({ template }: { template: TemplateRow }) {
  const router = useRouter()
  const [name, setName] = useSyncedDraft(template.name)
  const [confirming, setConfirming] = React.useState(false)
  // A refused or empty name stays in the box, marked, until it's fixed.
  const [invalid, setInvalid] = React.useState(false)
  const [run, busy] = useAsyncAction(getProjectErrorMessage)

  function commitName() {
    const next = name.trim()
    if (next === template.name) return
    if (!next) {
      setInvalid(true)
      showErrorToast("A template needs a name.")
      return
    }
    void run(() => renameProjectTemplate(template.id, next)).then(async (ok) => {
      if (ok) await router.invalidate()
      else setInvalid(true)
    })
  }

  return (
    <li className="flex items-center gap-2">
      <ProjectDot color={template.color} />
      <Input
        aria-label={`Template name: ${template.name}`}
        className="min-w-0 flex-1"
        value={name}
        maxLength={LIMITS.templateName}
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
      <span className="shrink-0 text-sm text-muted-foreground">{taskCount(template)}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Delete the template "${template.name}"`}
        onClick={() => setConfirming(true)}
      >
        <Trash2Icon className="size-4" />
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete "${template.name}"?`}
        description="Nobody can start a project from it after this. Projects already started from it keep everything."
        confirmLabel="Delete template"
        destructive
        loading={busy}
        onConfirm={async () => {
          const ok = await run(() => deleteProjectTemplate(template.id), "Template deleted.")
          if (!ok) return
          setConfirming(false)
          await router.invalidate()
        }}
      />
    </li>
  )
}
