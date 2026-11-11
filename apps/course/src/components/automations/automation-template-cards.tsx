import * as React from "react"
import { Link } from "@tanstack/react-router"
import { PencilIcon, RotateCcwIcon } from "lucide-react"
import { toast } from "sonner"

import { AUTOMATION_TEMPLATE_ICONS } from "@/components/automations/automation-template-icons"
import { EmptyRow } from "@/components/shared/feed-card"
import { FoldingMenu, MenuAction } from "@/components/shared/folding-menu"
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
import { Textarea } from "@/components/ui/textarea"
import {
  getAutomationTemplateErrorMessage,
  resetAutomationTemplate,
  saveAutomationTemplateDetails,
  type AutomationTemplateDetail,
  type AutomationTemplateListItem,
} from "@/lib/api/automations/automation-templates"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useLastValue } from "@/lib/hooks/use-last-value"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * What the editor is told when a template changes from its ⋮.
 *
 * `before` runs ahead of the save, so the open template's own canvas edits are
 * on the server first and cannot land on top of a reset. It answers false when
 * that save failed, and the change stops there. `after` hands over what the
 * server now holds: the editor keeps the list, so the card redraws from it,
 * and the open canvas and its name take it too.
 */
export type AutomationTemplateChangeHooks = {
  before?: (key: AutomationTemplateListItem["key"]) => Promise<boolean>
  after: (template: AutomationTemplateDetail) => Promise<unknown> | void
}

/**
 * The automation editor's Templates tab (Tyler, 8 Nov 2026: "Move automation
 * templates in a new tab here", "No need to have template its own dashboard").
 *
 * A card opens that template on the canvas. Its ⋮ holds the two things the old
 * Templates dashboard did besides that: the name and description the New
 * automation picker shows, and Reset, for a template that has been changed.
 */
export function AutomationTemplateCards({
  templates,
  openTemplateKey,
  hooks,
}: {
  templates: AutomationTemplateListItem[]
  /** The template on the canvas, when the editor is editing one. */
  openTemplateKey?: string
  hooks: AutomationTemplateChangeHooks
}) {
  const [detailsTarget, setDetailsTarget] =
    React.useState<AutomationTemplateListItem | null>(null)
  const [resetTarget, setResetTarget] =
    React.useState<AutomationTemplateListItem | null>(null)
  const closingResetTarget = useLastValue(resetTarget)
  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [nameTouched, setNameTouched] = React.useState(false)
  const [descriptionTouched, setDescriptionTouched] = React.useState(false)
  const [attempted, setAttempted] = React.useState(false)
  const [runSave, saving] = useAsyncAction(getAutomationTemplateErrorMessage)
  const [runReset, resetting] = useAsyncAction(
    getAutomationTemplateErrorMessage
  )

  const openDetails = (template: AutomationTemplateListItem) => {
    setDetailsTarget(template)
    setName(template.name)
    setDescription(template.description)
    setNameTouched(false)
    setDescriptionTouched(false)
    setAttempted(false)
  }

  const closeDetails = () => {
    setDetailsTarget(null)
    setName("")
    setDescription("")
    setNameTouched(false)
    setDescriptionTouched(false)
    setAttempted(false)
  }

  const saveDetails = async () => {
    if (!detailsTarget || saving) return
    setAttempted(true)
    if (!name.trim()) {
      showErrorToast("Give the template a name.")
      return
    }
    if (!description.trim()) {
      showErrorToast("Describe what the template does.")
      return
    }
    await runSave(async () => {
      if ((await hooks.before?.(detailsTarget.key)) === false) return
      const saved = await saveAutomationTemplateDetails({
        templateKey: detailsTarget.key,
        name,
        description,
      })
      await hooks.after(saved)
      toast.success(`Saved "${saved.name}".`)
      closeDetails()
    })
  }

  const resetTemplate = async () => {
    if (!resetTarget || resetting) return
    await runReset(async () => {
      if ((await hooks.before?.(resetTarget.key)) === false) return
      const reset = await resetAutomationTemplate(resetTarget.key)
      await hooks.after(reset)
      toast.success(`Reset "${reset.name}" to the built-in version.`)
      setResetTarget(null)
    })
  }

  return (
    <>
      {/* A column the panel's own width, as the node cards have. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
        {templates.map((template) => (
          <TemplateCard
            key={template.key}
            template={template}
            open={template.key === openTemplateKey}
            onEditDetails={() => openDetails(template)}
            onReset={() => setResetTarget(template)}
          />
        ))}
        {templates.length === 0 ? (
          <EmptyRow>No automation templates are available.</EmptyRow>
        ) : null}
      </div>

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
                  {/* A column the panel's own width, as the node cards have. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
                    <Label htmlFor="automation-template-name">Name</Label>
                    <Input
                      id="automation-template-name"
                      value={name}
                      maxLength={80}
                      onBlur={() => setNameTouched(true)}
                      aria-invalid={
                        (!name.trim() && (nameTouched || attempted)) || undefined
                      }
                      onChange={(event) => setName(event.target.value)}
                    />
                  </div>
                  {/* A column the panel's own width, as the node cards have. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
                    <Label htmlFor="automation-template-description">
                      Description
                    </Label>
                    <Textarea
                      id="automation-template-description"
                      value={description}
                      maxLength={300}
                      onBlur={() => setDescriptionTouched(true)}
                      aria-invalid={
                        (!description.trim() &&
                          (descriptionTouched || attempted)) ||
                        undefined
                      }
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

function TemplateCard({
  template,
  open,
  onEditDetails,
  onReset,
}: {
  template: AutomationTemplateListItem
  open: boolean
  onEditDetails: () => void
  onReset: () => void
}) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const Icon = AUTOMATION_TEMPLATE_ICONS[template.key]

  return (
    <div className="relative">
      <Link
        to="/admin/automations"
        search={{ tab: "automations", template: template.key }}
        aria-current={open ? "page" : undefined}
        className={cn(
          "flex w-full items-start gap-2 overflow-hidden rounded-lg border bg-card p-2 pr-10 text-left transition-colors hover:border-primary/40 hover:bg-muted/30",
          open && "border-primary bg-muted/30",
          focusRingInset
        )}
      >
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1 overflow-hidden">
          <span className="block truncate text-xs font-medium">
            {template.name}
          </span>
          <span className="line-clamp-2 text-[10px] leading-4 text-muted-foreground">
            {template.description}
          </span>
          {template.isCustomized || !template.isValid ? (
            <span
              className={cn(
                "block truncate text-[10px] leading-4",
                template.isValid ? "text-muted-foreground" : "text-destructive"
              )}
            >
              {template.isValid ? "Customized" : "Has a step to fix"}
            </span>
          ) : null}
        </span>
      </Link>
      <div className="absolute top-1 right-1">
        <FoldingMenu
          label={`More for ${template.name}`}
          align="start"
          fit
          open={menuOpen}
          onOpenChange={setMenuOpen}
        >
          <MenuAction
            icon={<PencilIcon className="size-4" />}
            onClick={() => {
              setMenuOpen(false)
              onEditDetails()
            }}
          >
            Edit details
          </MenuAction>
          {template.isCustomized ? (
            <MenuAction
              icon={<RotateCcwIcon className="size-4" />}
              onClick={() => {
                setMenuOpen(false)
                onReset()
              }}
            >
              Reset to built-in
            </MenuAction>
          ) : null}
        </FoldingMenu>
      </div>
    </div>
  )
}
