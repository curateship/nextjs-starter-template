import * as React from "react"

import { AUTOMATION_TEMPLATE_ICONS } from "@/components/automations/automation-template-icons"
import { NewRecordDropdown } from "@/components/shared/new-record-dropdown"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  loadAutomationTemplatesPage,
  type AutomationTemplateListItem,
} from "@/lib/api/automations/automation-templates"
import { createAutomation, getAutomationErrorMessage } from "@/lib/api/automations/automations"
import type { AutomationTemplateKey } from "@/lib/automations/templates"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { showErrorToast } from "@/lib/toast/error-toast"

type StartChoice = "blank" | AutomationTemplateKey

/**
 * New automation as a dropdown form rather than a window (Tyler, 9 Nov 2026:
 * "Add a + icon here to add automation (dropdown)", of the Automations left
 * page's header). The same form sits under the Automations header's New
 * automation button, so there is one way to make a flow.
 *
 * A name and where it starts: a blank canvas, or one of the templates, which
 * fills in the name. A flow from a template starts turned off. Making it opens
 * its canvas in the middle, where it is built. Clicking away keeps what was
 * typed for the next opening.
 */
export function NewAutomationDropdown({
  trigger,
  align = "end",
  templates: given,
  onCreated,
}: {
  /** The button that opens it. */
  trigger: React.ReactNode
  align?: "start" | "end"
  /** The templates, when the page already has them; read on opening otherwise. */
  templates?: AutomationTemplateListItem[]
  onCreated: (automationId: string) => Promise<void>
}) {
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [start, setStart] = React.useState<StartChoice>("blank")
  const [invalid, setInvalid] = React.useState(false)
  const [read, setRead] = React.useState<AutomationTemplateListItem[] | null>(null)
  const templates = given ?? read
  const [run, saving] = useAsyncAction(getAutomationErrorMessage)

  React.useEffect(() => {
    if (!open || given || read) return
    let cancelled = false
    loadAutomationTemplatesPage()
      .then((page) => {
        if (!cancelled) setRead(page.templates)
      })
      .catch((error) => showErrorToast(getAutomationErrorMessage(error)))
    return () => {
      cancelled = true
    }
  }, [open, given, read])

  const chooseStart = (next: StartChoice) => {
    setStart(next)
    // A template names the flow after itself, as the window did.
    if (next !== "blank") setName(templates?.find((template) => template.key === next)?.name ?? name)
  }

  const create = async () => {
    if (!name.trim()) {
      setInvalid(true)
      showErrorToast("Automation name is required.")
      return
    }
    await run(async () => {
      const created = await createAutomation(name.trim(), start === "blank" ? null : start)
      setName("")
      setStart("blank")
      setInvalid(false)
      setOpen(false)
      await onCreated(created.id)
    })
  }

  return (
    <NewRecordDropdown
      label="New automation"
      align={align}
      open={open}
      onOpenChange={setOpen}
      submitLabel="Create automation"
      busy={saving}
      onSubmit={() => void create()}
      trigger={trigger}
    >
      <div className="grid gap-2">
        <Label htmlFor="new-automation-start">Start from</Label>
        <Select value={start} onValueChange={(value) => chooseStart(value as StartChoice)}>
          <SelectTrigger id="new-automation-start" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="blank">Blank canvas</SelectItem>
            {(templates ?? []).map((template) => {
              const Icon = AUTOMATION_TEMPLATE_ICONS[template.key]
              return (
                <SelectItem key={template.key} value={template.key}>
                  <Icon className="size-4 text-muted-foreground" />
                  {template.name}
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
        {start !== "blank" ? (
          <p className="text-xs text-muted-foreground">
            {templates?.find((template) => template.key === start)?.description}
          </p>
        ) : null}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="new-automation-name">Name</Label>
        <Input
          id="new-automation-name"
          autoFocus
          value={name}
          maxLength={80}
          placeholder="Weekly product email"
          aria-invalid={invalid || undefined}
          onChange={(event) => {
            setName(event.target.value)
            if (event.target.value.trim()) setInvalid(false)
          }}
        />
      </div>
      {start !== "blank" ? (
        <p className="text-xs text-muted-foreground">
          It starts turned off. Check its audience and email before you turn it on or run it.
        </p>
      ) : null}
    </NewRecordDropdown>
  )
}
