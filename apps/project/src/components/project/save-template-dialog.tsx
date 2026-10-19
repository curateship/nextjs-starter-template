import * as React from "react"
import { Loader2Icon } from "lucide-react"

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
import { saveAsTemplate } from "@/lib/api/project/projects"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { LIMITS } from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * "Save as template", from Project settings. It keeps the project's plan as
 * it is now, so later changes to the project never reach the template.
 * Drawn only while open, so each opening starts from the project's name.
 */
export function SaveTemplateDialog({
  project,
  open,
  onClose,
}: {
  project: { id: string; name: string }
  open: boolean
  onClose: () => void
}) {
  const [name, setName] = React.useState(project.name)
  const [invalid, setInvalid] = React.useState(false)
  const [run, saving] = useAsyncAction(getProjectErrorMessage)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Selected, so typing replaces it, the same as Copy project's name.
  React.useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => inputRef.current?.select())
    return () => cancelAnimationFrame(frame)
  }, [open])

  async function save() {
    if (!name.trim()) {
      setInvalid(true)
      showErrorToast("Give the template a name.")
      return
    }
    const ok = await run(
      () => saveAsTemplate(project.id, name.trim()),
      "Template saved. Start a project from it with New project."
    )
    if (ok) onClose()
    else setInvalid(true)
  }

  return (
    <FormDialog open={open} dirty={name.trim() !== project.name} busy={saving} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save as template</DialogTitle>
            <DialogDescription>
              Keeps this project's milestones, tasks, steps and tags as they are now.
              Projects started from it begin with every task To do, nobody assigned and no dates.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Template</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="template-name">Name</Label>
                    <Input
                      ref={inputRef}
                      id="template-name"
                      value={name}
                      maxLength={LIMITS.templateName}
                      aria-invalid={invalid || undefined}
                      onChange={(event) => {
                        setName(event.target.value)
                        setInvalid(false)
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={requestClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Create template
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
