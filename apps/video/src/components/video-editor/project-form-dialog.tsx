import * as React from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { ImageUpload } from "@/components/shared/image-upload"
import { SettingsFoldCard } from "@/components/video-assets/settings-fold-card"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { ProjectFolderSummary } from "@/lib/api/video/project-folders"
import { NO_FOLDER } from "@/lib/video/project-folders"
import {
  createProject,
  getProjectErrorMessage,
  saveProjectSettings,
  type ProjectItem,
} from "@/lib/api/video/projects"
import { saveSpendLimit, type VideoItem } from "@/lib/api/video/project-videos"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { parseSpendLimit } from "@/lib/video/project-spend"
import { MAX_STYLE_LENGTH } from "@/lib/video/visual-style"

type ProjectDraft = {
  name: string
  style: string
  lookPictureUrl: string
  /** Dollars as typed; empty is no limit. */
  spendLimit: string
}

/** The open video, when the window is opened from the editor. */
type SpendingVideo = Pick<VideoItem, "id" | "name" | "spend_limit_cents">

function draftOf(project: ProjectItem | null, video: SpendingVideo | null): ProjectDraft {
  return {
    name: project?.name ?? "",
    style: project?.look?.style ?? "",
    lookPictureUrl: project?.look?.picture_url ?? "",
    spendLimit:
      video?.spend_limit_cents != null ? String(video.spend_limit_cents / 100) : "",
  }
}

/**
 * A new project's name, or an existing project's settings from the cog on its
 * row or the spend figure in the editor: its name and its look (see
 * workspace/docs/visual-style.md), shared by every video in it. Opened from
 * the editor it also holds the open video's spend limit, which is each
 * video's own (Tyler, 1 Nov 2026; workspace/docs/project-videos.md). None of
 * them is part of a timeline, so saving never clashes with an open editor.
 */
export function ProjectFormDialog({
  open,
  project,
  video = null,
  folderId,
  folders = [],
  onClose,
  onCreated,
  onSaved,
  onVideoSaved,
}: {
  open: boolean
  /** The project whose settings these are, or null when making a new one. */
  project: ProjectItem | null
  /** The video open in the editor, whose spend limit the window also holds. */
  video?: SpendingVideo | null
  /** The folder a new project starts in: the one the list is showing. */
  folderId: string | null
  /** The folders a new project can be put in. Left out, there is no choice. */
  folders?: ProjectFolderSummary[]
  onClose: () => void
  /** Handed the new project and the id of the first video in it. */
  onCreated: (project: ProjectItem, videoId: string) => void
  /** Handed the saved project, for a caller that shows its settings. */
  onSaved: (saved: ProjectItem) => void
  /** Handed the open video once its spend limit is saved. */
  onVideoSaved?: (saved: VideoItem) => void
}) {
  const [draft, setDraft] = React.useState(() => draftOf(project, video))
  const [saving, setSaving] = React.useState(false)
  const [limitInvalid, setLimitInvalid] = React.useState(false)
  // A new project's folder, picked in the window. Starts on the open folder.
  const [newFolderId, setNewFolderId] = React.useState(folderId)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Start from what is stored every time the window opens.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setDraft(draftOf(project, video))
      setLimitInvalid(false)
      setNewFolderId(folderId)
    }
  }

  const stored = draftOf(project, video)
  const dirty = JSON.stringify(draft) !== JSON.stringify(stored)
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
        const created = await createProject(draft.name, newFolderId)
        dismissErrorToast()
        onCreated(created.project, created.video)
        onClose()
        return
      }
      if (!dirty) {
        onClose()
        return
      }
      let spendLimitCents: number | null = null
      if (video) {
        try {
          spendLimitCents = parseSpendLimit(draft.spendLimit)
        } catch (error) {
          setLimitInvalid(true)
          showErrorToast(error instanceof Error ? error.message : "Check the limit.")
          return
        }
      }
      const projectChanged =
        draft.name !== stored.name ||
        draft.style !== stored.style ||
        draft.lookPictureUrl !== stored.lookPictureUrl
      if (projectChanged) {
        const saved = await saveProjectSettings({
          projectId: project.id,
          name: draft.name,
          style: draft.style || null,
          lookPictureUrl: draft.lookPictureUrl || null,
        })
        onSaved(saved)
      }
      if (video && draft.spendLimit !== stored.spendLimit) {
        onVideoSaved?.(await saveSpendLimit(video.id, spendLimitCents))
      }
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
                ? video
                  ? "What this project is called and the look every AI picture or clip made for its videos starts from, then the most this video may spend on AI."
                  : "What this project is called, and the look every AI picture or clip made for its videos starts from."
                : "It opens with one empty, upright video. The shape switch changes that in one click."}
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
              <SettingsFoldCard
                fold={Boolean(project)}
                storageId="video-project-settings-name"
                show={!draft.name.trim()}
                title="Name"
              >
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
              </SettingsFoldCard>

              {!project && folders.length ? (
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Folder</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="project-folder">Put it in</Label>
                      <Select
                        value={newFolderId ?? NO_FOLDER}
                        onValueChange={(value) =>
                          setNewFolderId(value === NO_FOLDER ? null : value)
                        }
                      >
                        <SelectTrigger id="project-folder" className="sm:w-60">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_FOLDER}>No folder</SelectItem>
                          {folders.map((folder) => (
                            <SelectItem key={folder.id} value={folder.id}>
                              {folder.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              {project ? (
                <SettingsFoldCard
                  fold
                  storageId="video-project-settings-look"
                  title="Look"
                  description="Sent with every AI picture or clip made for this project. It costs nothing itself."
                >
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
                </SettingsFoldCard>
              ) : null}

              {project && video ? (
                <SettingsFoldCard
                  fold
                  storageId="video-project-settings-spending"
                  show={limitInvalid}
                  title="Spending"
                  description={`For the open video, ${video.name}. Each video has its own limit.`}
                >
                  <div className="grid gap-2">
                    <FieldLabel
                      htmlFor="project-spend-limit"
                      hint="Every AI tool used on this video stops and says so before it would take the video past this. Leave it empty for no limit."
                    >
                      Spend limit in dollars
                    </FieldLabel>
                    <Input
                      id="project-spend-limit"
                      inputMode="decimal"
                      className="sm:max-w-40"
                      value={draft.spendLimit}
                      placeholder="No limit"
                      aria-invalid={limitInvalid || undefined}
                      onChange={(event) => {
                        setDraft({ ...draft, spendLimit: event.target.value })
                        setLimitInvalid(false)
                      }}
                    />
                  </div>
                </SettingsFoldCard>
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
