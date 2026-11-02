import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { createProjectVideo } from "@/lib/api/video/project-videos"
import { getProjectErrorMessage } from "@/lib/api/video/projects"
import {
  VIDEO_NAME_MAX,
  VIDEO_STATUS_LABELS,
  VIDEO_STATUSES,
  type VideoStatus,
} from "@/lib/video/project-videos"
import { ASPECT_RATIOS, type AspectRatio } from "@/lib/video/timeline-schema"

/**
 * The window under a New video button. A video starts with a name you type,
 * a shape and a status, never a made-up name (Tyler, 1 Nov 2026: "Click add
 * should not automatically add a video with a random name").
 */
export function NewVideoPopover({
  projectId,
  aspect,
  side = "right",
  tooltip,
  onCreated,
  children,
}: {
  projectId: string
  /** The shape picked when it opens: the open video's, so a series matches. */
  aspect: AspectRatio
  side?: "right" | "bottom"
  /** A hover label, for a button that is only an icon. */
  tooltip?: string
  onCreated: (videoId: string) => Promise<void> | void
  /** The button that opens it. */
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>{children}</PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      ) : (
        <PopoverTrigger asChild>{children}</PopoverTrigger>
      )}
      <PopoverContent side={side} align="start" className="studio-root w-72 p-3">
        {/* Mounted only while open, so each opening starts blank. */}
        {open ? (
          <NewVideoForm
            projectId={projectId}
            aspect={aspect}
            onCreated={async (id) => {
              await onCreated(id)
              setOpen(false)
            }}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

function NewVideoForm({
  projectId,
  aspect: startAspect,
  onCreated,
}: {
  projectId: string
  aspect: AspectRatio
  onCreated: (videoId: string) => Promise<void>
}) {
  const [name, setName] = React.useState("")
  const [aspect, setAspect] = React.useState<AspectRatio>(startAspect)
  const [status, setStatus] = React.useState<VideoStatus>("draft")
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const nameRef = React.useRef<HTMLInputElement>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      setError("Give the video a name.")
      nameRef.current?.focus()
      return
    }
    setBusy(true)
    setError(null)
    try {
      const made = await createProjectVideo(projectId, { name: name.trim(), aspect, status })
      await onCreated(made.id)
    } catch (caught) {
      setError(getProjectErrorMessage(caught))
      setBusy(false)
    }
  }

  return (
    <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
      <div className="grid gap-2">
        <Label htmlFor="new-video-name">Name</Label>
        <Input
          ref={nameRef}
          id="new-video-name"
          autoFocus
          value={name}
          maxLength={VIDEO_NAME_MAX}
          placeholder="What is this video about?"
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            setName(event.target.value)
            if (error) setError(null)
          }}
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
      <div className="grid gap-2">
        <Label>Shape</Label>
        <Tabs value={aspect} onValueChange={(next) => setAspect(next as AspectRatio)}>
          <TabsList aria-label="Shape" className="w-full">
            {ASPECT_RATIOS.map((option) => (
              <TabsTrigger key={option} value={option} className="flex-1">
                {option}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <div className="grid gap-2">
        <Label>Status</Label>
        <Tabs value={status} onValueChange={(next) => setStatus(next as VideoStatus)}>
          <TabsList aria-label="Status" className="w-full">
            {VIDEO_STATUSES.map((option) => (
              <TabsTrigger key={option} value={option} className="flex-1">
                {VIDEO_STATUS_LABELS[option]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? <Loader2Icon className="animate-spin" /> : null}
        Create video
      </Button>
    </form>
  )
}
