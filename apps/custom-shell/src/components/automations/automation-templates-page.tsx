import * as React from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  LayoutTemplateIcon,
  RotateCcwIcon,
  SettingsIcon,
  WorkflowIcon,
} from "lucide-react"
import { toast } from "sonner"

import { DashboardTable } from "@/components/shared/dashboard-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
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
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
  getAutomationTemplateErrorMessage,
  resetAutomationTemplate,
  saveAutomationTemplateDetails,
  type AutomationTemplateDetail,
  type AutomationTemplateListItem,
  type AutomationTemplatesPage,
} from "@/lib/api/automations/automation-templates"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useLastValue } from "@/lib/hooks/use-last-value"
import { formatDate } from "@/lib/format/format-time"
import { showErrorToast } from "@/lib/toast/error-toast"

function toListItem(
  template: AutomationTemplateDetail
): AutomationTemplateListItem {
  return {
    key: template.key,
    name: template.name,
    description: template.description,
    steps: template.steps,
    isCustomized: template.isCustomized,
    isValid: template.isValid,
    updated_at: template.updated_at,
  }
}

export function AutomationTemplatesPage({
  initial,
}: {
  initial: AutomationTemplatesPage
}) {
  const navigate = useNavigate()
  const [templates, setTemplates] = React.useState(initial.templates)
  const [detailsTarget, setDetailsTarget] =
    React.useState<AutomationTemplateListItem | null>(null)
  const [resetTarget, setResetTarget] =
    React.useState<AutomationTemplateListItem | null>(null)
  const closingResetTarget = useLastValue(resetTarget)
  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [runSave, saving] = useAsyncAction(getAutomationTemplateErrorMessage)
  const [runReset, resetting] = useAsyncAction(
    getAutomationTemplateErrorMessage
  )

  const openDetails = (template: AutomationTemplateListItem) => {
    setDetailsTarget(template)
    setName(template.name)
    setDescription(template.description)
  }

  const closeDetails = () => {
    setDetailsTarget(null)
    setName("")
    setDescription("")
  }

  const updateTemplate = (template: AutomationTemplateDetail) => {
    const item = toListItem(template)
    setTemplates((current) =>
      current.map((candidate) =>
        candidate.key === item.key ? item : candidate
      )
    )
  }

  const saveDetails = async () => {
    if (!detailsTarget || saving) return
    if (!name.trim()) {
      showErrorToast("Give the template a name.")
      return
    }
    if (!description.trim()) {
      showErrorToast("Describe what the template does.")
      return
    }
    await runSave(async () => {
      const saved = await saveAutomationTemplateDetails({
        templateKey: detailsTarget.key,
        name,
        description,
      })
      updateTemplate(saved)
      toast.success(`Saved "${saved.name}".`)
      closeDetails()
    })
  }

  const resetTemplate = async () => {
    if (!resetTarget || resetting) return
    await runReset(async () => {
      const reset = await resetAutomationTemplate(resetTarget.key)
      updateTemplate(reset)
      toast.success(`Reset "${reset.name}" to the built-in version.`)
      setResetTarget(null)
    })
  }

  return (
    <>
      <DashboardTable
        title="Automation templates"
        icon={<LayoutTemplateIcon />}
        count={templates.length}
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">Template</TableHead>
              <TableHead column="meta" className="hidden md:table-cell">
                Flow
              </TableHead>
              <TableHead column="meta">Status</TableHead>
              <TableHead column="meta" className="hidden sm:table-cell">
                Last edited
              </TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={templates.length === 0}
        emptyText="No automation templates are available."
        emptyColSpan={5}
        footer={{
          type: "summary",
          count: templates.length,
          label:
            "Future automations use these saved versions. Existing flows are not changed.",
        }}
      >
        {templates.map((template) => (
          <TableRow
            key={template.key}
            className="group"
            rowAction={() =>
              void navigate({
                to: "/admin/automations/templates/$templateKey",
                params: { templateKey: template.key },
              })
            }
          >
            <TableCell column="main">
              <div className="flex min-w-0 items-center gap-2">
                <Link
                  to="/admin/automations/templates/$templateKey"
                  params={{ templateKey: template.key }}
                  className="min-w-0 max-w-96 truncate font-medium underline-offset-2 group-hover:underline"
                >
                  {template.name}
                </Link>
                {!template.isValid ? (
                  <span className="shrink-0 text-sm text-destructive">
                    This template has a step to fix.
                  </span>
                ) : null}
              </div>
              <span className="mt-0.5 block max-w-xl truncate text-sm text-muted-foreground">
                {template.description}
              </span>
            </TableCell>
            <TableCell column="mutedMeta" className="hidden md:table-cell">
              <span className="block max-w-80 truncate">
                {template.steps.join(" → ")}
              </span>
            </TableCell>
            <TableCell column="meta">
              <Badge variant={template.isCustomized ? "secondary" : "outline"}>
                {template.isCustomized ? "Customized" : "Built in"}
              </Badge>
            </TableCell>
            <TableCell column="mutedMeta" className="hidden sm:table-cell">
              {template.updated_at ? formatDate(template.updated_at) : "—"}
            </TableCell>
            <TableCell column="actions">
                {template.isCustomized ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Reset ${template.name}`}
                    onClick={() => setResetTarget(template)}
                  >
                    <RotateCcwIcon className="size-4" />
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit flow for ${template.name}`}
                  onClick={() =>
                    void navigate({
                      to: "/admin/automations/templates/$templateKey",
                      params: { templateKey: template.key },
                    })
                  }
                >
                  <WorkflowIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit details for ${template.name}`}
                  onClick={() => openDetails(template)}
                >
                  <SettingsIcon className="size-4" />
                </Button>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <FormDialog
        open={detailsTarget !== null}
        dirty={
          Boolean(detailsTarget) &&
          (name !== detailsTarget?.name ||
            description !== detailsTarget?.description)
        }
        busy={saving}
        onClose={closeDetails}
      >
        {(requestClose) => (
          <DialogContent variant="admin" className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Template details</DialogTitle>
              <DialogDescription>
                These words appear in the New automation picker.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <Card size="sm">
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="automation-template-name">Name</Label>
                    <Input
                      id="automation-template-name"
                      value={name}
                      maxLength={80}
                      aria-invalid={!name.trim() || undefined}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="automation-template-description">
                      Description
                    </Label>
                    <Textarea
                      id="automation-template-description"
                      value={description}
                      maxLength={300}
                      aria-invalid={!description.trim() || undefined}
                      onChange={(event) => setDescription(event.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={requestClose}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={saving}
                onClick={() => void saveDetails()}
              >
                Save changes
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </FormDialog>

      <ConfirmDialog
        open={resetTarget !== null}
        onOpenChange={(open) => {
          if (!open) setResetTarget(null)
        }}
        title={`Reset ${closingResetTarget?.name ?? "this template"}?`}
        description="Its saved name, description, flow, and email are replaced with the built-in version. Automations already created from it stay unchanged."
        confirmLabel="Reset template"
        loading={resetting}
        onConfirm={() => void resetTemplate()}
      />
    </>
  )
}
