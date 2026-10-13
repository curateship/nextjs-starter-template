import * as React from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { ImageUpload } from "@/components/shared/image-upload"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { Textarea } from "@/components/ui/textarea"
import {
  createProject,
  getProjectErrorMessage,
  saveProjectSettings,
  type ProjectItem,
} from "@/lib/api/video/projects"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { MAX_STYLE_LENGTH } from "@/lib/video/visual-style"

type ProjectDraft = { name: string; style: string; lookPictureUrl: string }

function draftOf(project: ProjectItem | null): ProjectDraft {
  return {
    name: project?.name ?? "",
    style: project?.look?.style ?? "",
    lookPictureUrl: project?.look?.picture_url ?? "",
  }
}

/**
 * A new project's name, or an existing project's settings from the cog on its
 * row: its name and its look (see workspace/docs/visual-style.md). Neither is
 * part of the timeline, so saving never clashes with an editor that has the
 * project open.
 */
export function ProjectFormDialog({
  open,
  project,
  folderId,
  onClose,
  onCreated,
  onSaved,
}: {
  open: boolean
  /** The project whose settings these are, or null when making a new one. */
  project: ProjectItem | null
  /** The folder a new project goes into, the one the list is showing. */
  folderId: string | null
  onClose: () => void
  onCreated: (project: ProjectItem) => void
  onSaved: () => void
}) {
  const [draft, setDraft] = React.useState(() => draftOf(project))
  const [saving, setSaving] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Start from what is stored every time the window opens.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) setDraft(draftOf(project))
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(project))
  const hasLook = Boolean(draft.style || draft.lookPictureUrl)

  async function handleSave() {
    if (!draft.name.trim()) {
      showErrorToast("A project needs a name.")
      inputRef.current?.focus()
      return
    }
    setSaving(true)
    try {
      if (!project) {
        const created = await createProject(draft.name, folderId)
        dismissErrorToast()
        onCreated(created)
        onClose()
        return
      }
      if (!dirty) {
        onClose()
        return
      }
      await saveProjectSettings({
        projectId: project.id,
        name: draft.name,
        style: draft.style || null,
        lookPictureUrl: draft.lookPictureUrl || null,
      })
      onSaved()
      dismissErrorToast()
      toast.success("Project settings saved.")
      onClose()
    } catch (error) {
      showErrorToast(getProjectErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormDialog
      open={open}
      dirty={dirty}
      busy={saving}
      onClose={onClose}
    >
      {(requestClose) => (
        <DialogContent
          variant="admin"
          className="sm:max-w-lg"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            inputRef.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>{project ? "Project settings" : "New project"}</DialogTitle>
            <DialogDescription>
              {project
                ? "What this project is called, and the look every AI picture or clip made for it starts from."
                : "It opens empty and vertical — the aspect switch changes that in one click."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void handleSave()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Name</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="project-name">Project name</Label>
                    <Input
                      id="project-name"
                      ref={inputRef}
                      value={draft.name}
                      maxLength={200}
                      aria-invalid={!draft.name.trim() || undefined}
                      placeholder="Gym hook reel"
                      onChange={(event) =>
                        setDraft({ ...draft, name: event.target.value })
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              {project ? (
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Look</CardTitle>
                    <CardDescription>
                      Sent with every AI picture or clip made for this
                      project. It costs nothing itself.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="grid gap-2">
                      <FieldLabel
                        htmlFor="project-style"
                        hint="Describe the look, not the scene: drawing style, colours, light, what never appears. Each scene's own direction comes after it."
                      >
                        Style
                      </FieldLabel>
                      <Textarea
                        id="project-style"
                        rows={1}
                        maxLength={MAX_STYLE_LENGTH}
                        value={draft.style}
                        placeholder="Flat illustration, warm palette, thick outlines, no text"
                        onChange={(event) =>
                          setDraft({ ...draft, style: event.target.value })
                        }
                      />
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {draft.style.length} / {MAX_STYLE_LENGTH}
                      </span>
                    </div>
                    <ImageUpload
                      label="Look picture"
                      value={draft.lookPictureUrl}
                      onChange={(lookPictureUrl) =>
                        setDraft({ ...draft, lookPictureUrl })
                      }
                      aspect="square"
                      fit="cover"
                      disabled={saving}
                      className="max-w-40"
                      hint="Optional. The AI copies its colours, light and drawing style, not what is in it."
                    />
                    {hasLook ? (
                      <div>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={saving}
                          onClick={() =>
                            setDraft({ ...draft, style: "", lookPictureUrl: "" })
                          }
                        >
                          Clear look
                        </Button>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ) : null}
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
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2Icon className="animate-spin" /> : null}
                {project ? "Save changes" : "Create project"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
