import * as React from "react"
import { ExternalLinkIcon, Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { askForVideo, getRequestErrorMessage, loadVideoProjects } from "@/lib/api/archive/requests"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * Ask for a video (part 42), from the Archive's "+ Add": a brief and a
 * Video project. Video makes a draft video there with the brief as its
 * notes and rings its bell. Nothing is written by AI.
 */
export function AskForVideoDialog({ projectId, projectName, onClose }: { projectId: string; projectName: string; onClose: () => void }) {
  const [projects, setProjects] = React.useState<{ id: string; name: string }[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)
  const [videoProjectId, setVideoProjectId] = React.useState("")
  const [brief, setBrief] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    loadVideoProjects().then(
      (loaded) => {
        if (!cancelled) setProjects(loaded)
      },
      (failure: unknown) => {
        if (!cancelled) setError(getRequestErrorMessage(failure))
      }
    )
    return () => {
      cancelled = true
    }
  }, [reloads])

  async function send() {
    if (!videoProjectId) {
      showErrorToast("Pick the Video project it goes in first.")
      return
    }
    if (!brief.trim()) {
      showErrorToast("Write what the video should be first.")
      return
    }
    setBusy(true)
    dismissErrorToast()
    try {
      await askForVideo({ projectId, videoProjectId, brief })
      onClose()
    } catch (failure) {
      showErrorToast(getRequestErrorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Ask for a video</DialogTitle>
          <DialogDescription>The brief lands in Video as a draft video for {projectName}, with a bell notice there.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardContent className="grid gap-4">
              {error ? (
                <ErrorRow message={error} onRetry={() => { setError(null); setReloads((count) => count + 1) }} />
              ) : !projects ? (
                <LoadingRow label="Asking Video for its projects…" />
              ) : (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="ask-video-project">Video project</Label>
                    <Select value={videoProjectId} onValueChange={setVideoProjectId}>
                      <SelectTrigger id="ask-video-project" className="sm:w-80">
                        <SelectValue placeholder={projects.length ? "Pick a project" : "Video has no projects yet"} />
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="ask-video-brief">Brief</Label>
                    <Textarea
                      id="ask-video-brief"
                      value={brief}
                      maxLength={4_000}
                      onChange={(event) => setBrief(event.target.value)}
                      placeholder="A 30 second TikTok showing the new timer mode at night. Hook in the first second."
                    />
                    <p className="text-xs text-muted-foreground">The first line becomes the video's name in Video.</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={() => void send()}>
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : <ExternalLinkIcon className="size-4" />}
            Send to Video
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
