import * as React from "react"
import { AlertCircleIcon, Loader2Icon } from "lucide-react"

import {
  TemplateSettingsDialog,
  type TemplateSettingsUpdate,
} from "@/components/template-settings-dialog"
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
  useEditorDocumentName,
  useEditorDocumentThumbnailUrl,
  useEditorRuntime,
} from "@/pages/video-editor/editor-store"

// Editor settings modal, opened from the editor header. Project settings rename
// the project; template settings also manage the catalog cover image.
export function EditorSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { kind } = useEditorRuntime()

  if (kind === "template") {
    return (
      <EditorTemplateSettingsDialog
        open={open}
        onOpenChange={onOpenChange}
      />
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        {/* The form is its own component so it remounts each time the dialog
            opens — the name field then always starts from the live name, with
            no reset effect. */}
        <ProjectSettingsForm onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function EditorTemplateSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const documentName = useEditorDocumentName()
  const documentThumbnailUrl = useEditorDocumentThumbnailUrl()
  const { documentId, setDocumentName, setDocumentThumbnailUrl } =
    useEditorRuntime()

  function handleTemplateUpdated(update: TemplateSettingsUpdate) {
    if (update.name !== undefined) {
      setDocumentName(update.name)
    }
    if ("thumbnail_url" in update) {
      setDocumentThumbnailUrl(update.thumbnail_url ?? null)
    }
  }

  return (
    <TemplateSettingsDialog
      open={open}
      onOpenChange={onOpenChange}
      templateId={documentId}
      initialName={documentName}
      thumbnailUrl={documentThumbnailUrl}
      onTemplateUpdated={handleTemplateUpdated}
    />
  )
}

function ProjectSettingsForm({ onClose }: { onClose: () => void }) {
  const documentName = useEditorDocumentName()
  const { documentId, setDocumentName } = useEditorRuntime()
  const [name, setName] = React.useState(documentName)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const disabled = submitting || !name.trim()

  async function handleSave() {
    setSubmitting(true)
    setError(null)
    try {
      const updated = await renameProject(documentId, name)
      // Use the server-cleaned name so the header matches what was stored.
      setDocumentName(updated.name)
      onClose()
    } catch (caught) {
      setError(getProjectErrorMessage(caught))
      setSubmitting(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Project Settings</DialogTitle>
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
              placeholder="Project name"
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
