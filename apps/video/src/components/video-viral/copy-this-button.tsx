import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { CopyIcon, Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getProjectErrorMessage, listProjects, type ProjectItem } from "@/lib/api/video/projects"
import {
  copyIntoProject,
  getSavedVideoErrorMessage,
} from "@/lib/api/video/viral-videos"
import { showErrorToast } from "@/lib/toast/error-toast"

/** The Select's value for "make a new project". */
const NEW_PROJECT = "new"

/**
 * Make this a template (Tyler, 20 Oct 2026; it was "Copy this", and the code
 * keeps that name): makes a new video that copies this one and opens it in
 * the editor with the Copy panel showing. It asks each time whether the video
 * goes into a new project or one of the person's own (Tyler, 1 Nov 2026). The
 * video is saved and broken down on the way, which spends from the AI
 * allowance unless it was saved before. Pressed under the player on a Viral
 * project or a favourites collection.
 */
export function CopyThisButton({
  url,
  title,
  viralProjectId,
  className,
}: {
  url: string
  title: string | null
  /** The Viral project it was pressed in, which the new video remembers. */
  viralProjectId: string | null
  className?: string
}) {
  const navigate = useNavigate()
  const [open, setOpen] = React.useState(false)
  const [projects, setProjects] = React.useState<ProjectItem[] | null>(null)
  const [target, setTarget] = React.useState(NEW_PROJECT)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    let active = true
    listProjects({ pageSize: 100 })
      .then((loaded) => {
        if (active) setProjects(loaded.projects)
      })
      .catch((error) => showErrorToast(getProjectErrorMessage(error)))
    return () => {
      active = false
    }
  }, [open])

  async function copy() {
    setBusy(true)
    try {
      const made = await copyIntoProject(
        url,
        title,
        viralProjectId,
        target === NEW_PROJECT ? null : target
      )
      setOpen(false)
      await navigate({
        to: "/admin/video-editor/$projectId",
        params: { projectId: made.projectId },
        search: { video: made.videoId, panel: "copy" },
      })
    } catch (error) {
      showErrorToast(getSavedVideoErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={className}
        onClick={() => setOpen(true)}
      >
        <CopyIcon />
        Make this a template
      </Button>
      <Dialog open={open} onOpenChange={(next) => (busy ? undefined : setOpen(next))}>
        <DialogContent variant="admin" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Make this a template</DialogTitle>
            <DialogDescription>
              A new video that copies this one, opened in the editor beside it.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="grid gap-2">
              <Label htmlFor="template-project">Put it in</Label>
              {projects === null ? (
                <LoadingRow label="Loading your projects" />
              ) : (
                <Select value={target} onValueChange={setTarget}>
                  <SelectTrigger id="template-project">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NEW_PROJECT}>A new project</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" size="lg" disabled={busy} onClick={() => void copy()}>
              {busy ? <Loader2Icon className="animate-spin" /> : null}
              Make it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
