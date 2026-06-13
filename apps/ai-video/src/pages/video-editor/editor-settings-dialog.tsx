import * as React from "react"
import { AlertCircleIcon, Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getProjectErrorMessage, renameProject } from "@/lib/api/video-projects"
import {
  getTemplateErrorMessage,
  renameTemplate,
} from "@/lib/api/video-templates"
import { useEditor } from "@/pages/video-editor/editor-store"

// Editor settings modal, opened from the media-panel gear. For now it only
// renames the project/template (saved via the same rename fns the dashboards
// use); more settings will be added here later.
export function EditorSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        {/* The form is its own component so it remounts each time the dialog
            opens — the name field then always starts from the live name, with
            no reset effect. */}
        <EditorSettingsForm onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function EditorSettingsForm({ onClose }: { onClose: () => void }) {
  const { kind, documentId, documentName, setDocumentName } = useEditor()
  const noun = kind === "template" ? "Template" : "Project"
  const [name, setName] = React.useState(documentName)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const disabled = submitting || !name.trim()

  async function handleSave() {
    setSubmitting(true)
    setError(null)
    try {
      const updated =
        kind === "template"
          ? await renameTemplate(documentId, name)
          : await renameProject(documentId, name)
      // Use the server-cleaned name so the header matches what was stored.
      setDocumentName(updated.name)
      onClose()
    } catch (caught) {
      setError(
        kind === "template"
          ? getTemplateErrorMessage(caught)
          : getProjectErrorMessage(caught)
      )
      setSubmitting(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{noun} Settings</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <div className="space-y-5">
          {error ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="editor-settings-name">Name</Label>
            <Input
              id="editor-settings-name"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={`${noun} name`}
              onKeyDown={(event) => {
                // Enter submits the single-field form.
                if (event.key === "Enter" && !disabled) {
                  void handleSave()
                }
              }}
            />
          </div>
        </div>
      </DialogBody>
      <DialogFooter variant="plain">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" disabled={disabled} onClick={handleSave}>
          {submitting ? <Loader2Icon className="size-4 animate-spin" /> : null}
          {submitting ? "Saving" : "Save Changes"}
        </Button>
      </DialogFooter>
    </>
  )
}
