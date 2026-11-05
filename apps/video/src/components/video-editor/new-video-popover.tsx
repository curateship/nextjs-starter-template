import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { createProjectVideo } from "@/lib/api/video/project-videos"
import { getProjectErrorMessage } from "@/lib/api/video/projects"
import { listTemplates, saveVideoTemplateCard, type TemplateItem } from "@/lib/api/video/templates"
import { platformFor } from "@/lib/video/brief"
import { VIDEO_NAME_MAX } from "@/lib/video/project-videos"
import { ASPECT_RATIOS, type AspectRatio } from "@/lib/video/timeline-schema"

/**
 * The window under a New video button. A video starts with a name you type
 * and a shape, never a made-up name (Tyler, 1 Nov 2026: "Click add should not
 * automatically add a video with a random name"). It always starts as Draft;
 * the status choice came off on 5 Nov 2026 (Tyler: "remove the status tabs,
 * new videos are alwayhs draft first").
 *
 * It can start from scratch or from a template (Tyler, 5 Nov 2026: "If I
 * create a new video, I can select a template or start from scratch"). A
 * template sets the shape from its platform, and the video opens on the
 * Templates panel with that template picked (templates.md).
 */
export function NewVideoPopover({
  projectId,
  aspect,
  side = "right",
  tooltip,
  withTemplates = false,
  onCreated,
  children,
}: {
  projectId: string
  /** The shape picked when it opens: the open video's, so a series matches. */
  aspect: AspectRatio
  side?: "right" | "bottom"
  /** A hover label, for a button that is only an icon. */
  tooltip?: string
  /** Offers templates. Not for a guest sent from Project, who uses no AI. */
  withTemplates?: boolean
  /** The new video, and the panel to open it on when it started from a template. */
  onCreated: (videoId: string, panel?: "templates") => Promise<void> | void
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
            withTemplates={withTemplates}
            onCreated={async (id, panel) => {
              await onCreated(id, panel)
              setOpen(false)
            }}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

const FROM_SCRATCH = "scratch"

function NewVideoForm({
  projectId,
  aspect: startAspect,
  withTemplates,
  onCreated,
}: {
  projectId: string
  aspect: AspectRatio
  withTemplates: boolean
  onCreated: (videoId: string, panel?: "templates") => Promise<void>
}) {
  const [name, setName] = React.useState("")
  const [aspect, setAspect] = React.useState<AspectRatio>(startAspect)
  const [templates, setTemplates] = React.useState<TemplateItem[] | null>(null)
  const [templateId, setTemplateId] = React.useState(FROM_SCRATCH)

  React.useEffect(() => {
    if (!withTemplates) return
    let active = true
    listTemplates()
      .then((loaded) => {
        if (active) setTemplates(loaded.templates)
      })
      .catch(() => {
        if (active) setTemplates([])
      })
    return () => {
      active = false
    }
  }, [withTemplates])
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
      const made = await createProjectVideo(projectId, { name: name.trim(), aspect, status: "draft" })
      if (templateId === FROM_SCRATCH) {
        await onCreated(made.id)
        return
      }
      await saveVideoTemplateCard({ videoId: made.id, templateId })
      await onCreated(made.id, "templates")
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
      {withTemplates ? (
        <div className="grid gap-2">
          <Label htmlFor="new-video-template">Start from</Label>
          <Select
            value={templateId}
            onValueChange={(next) => {
              setTemplateId(next)
              const picked = templates?.find((one) => one.id === next)
              if (picked) setAspect(platformFor(picked.fields.platform).short ? "9:16" : "16:9")
            }}
          >
            <SelectTrigger id="new-video-template" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FROM_SCRATCH}>From scratch</SelectItem>
              {templates?.map((one) => (
                <SelectItem key={one.id} value={one.id}>
                  {one.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
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
      <Button type="submit" disabled={busy}>
        {busy ? <Loader2Icon className="animate-spin" /> : null}
        Create video
      </Button>
    </form>
  )
}
