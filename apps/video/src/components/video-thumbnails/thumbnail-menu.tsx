import * as React from "react"
import { CheckIcon, EllipsisVerticalIcon, Trash2Icon } from "lucide-react"

import { MediaPicker } from "@/components/media/media-picker"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Hint } from "@/components/video-assets/hint"
import { useEditorRuntime } from "@/components/video-editor/editor-store"
import {
  FoldingMenu,
  MenuSection,
  useOpenSections,
} from "@/components/shared/folding-menu"
import {
  AI_TRIES,
  useThumbnails,
  type AiTries,
} from "@/components/video-thumbnails/thumbnail-store"
import { aiUnitCostCents } from "@/lib/ai/ai-models"
import { checkThumbnailNow, copyThumbnailStyle } from "@/lib/api/video/thumbnail-ai"
import { pictureFromLibrary, removeTemplate, saveAsTemplate } from "@/lib/api/video/thumbnails"
import { withEstimate } from "@/lib/video/ai-estimates"
import { ACTOR_IMAGE_MODELS, type ImageModelId } from "@/lib/video/asset-factories"
import { formatCents } from "@/lib/video/project-spend"
import { checkCostCents, copyStyleCostCents } from "@/lib/video/thumbnail-ai"
import type { ThumbnailShape } from "@/lib/video/thumbnails"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

type Section = "tries" | "model" | "check" | "templates" | "copy"

const CHECK_LABELS = { text: "Words read small", face: "Face big enough", colour: "Colours stand out" } as const

/**
 * The ⋮ in the Thumbnail panel's header (thumbnails.md): How many to make,
 * the picture model, the AI check, templates and Copy a style, as folding
 * rows like Travel's activity menu (Tyler, 3 Nov 2026).
 */
export function ThumbnailMenu() {
  const { tries, model, open, templates, list } = useThumbnails()
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [shown, toggle] = useOpenSections<Section>()
  const check = open?.check
  const checkValue = !open
    ? ""
    : !check
      ? "Not checked"
      : check.version !== open.version
        ? "Out of date"
        : `${Math.round(check.marks.reduce((sum, mark) => sum + mark.mark, 0) / check.marks.length)} out of 10`
  const mine = templates.filter((template) => template.mine).length

  return (
    <FoldingMenu
      label="Thumbnail settings"
      // Opens rightward, over the board, because the panel is on the left.
      align="start"
      open={menuOpen}
      onOpenChange={setMenuOpen}
      // The same size as the + beside it in the panel's header.
      trigger={
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Thumbnail settings">
          <EllipsisVerticalIcon />
        </Button>
      }
    >
      <MenuSection label="How many to make" value={String(tries)} open={shown.has("tries")} onToggle={() => toggle("tries")}>
        <TriesField />
      </MenuSection>
      <MenuSection
        label="Picture model"
        value={ACTOR_IMAGE_MODELS.find((item) => item.id === model)?.label ?? ""}
        open={shown.has("model")}
        onToggle={() => toggle("model")}
      >
        <ModelField />
      </MenuSection>
      {open ? (
        <MenuSection label="Check it" value={checkValue} open={shown.has("check")} onToggle={() => toggle("check")}>
          <CheckField />
        </MenuSection>
      ) : null}
      {list ? (
        <MenuSection
          label="Templates"
          value={mine ? `${mine} of yours` : "None of yours"}
          open={shown.has("templates")}
          onToggle={() => toggle("templates")}
        >
          <TemplatesField />
        </MenuSection>
      ) : null}
      {list ? (
        <MenuSection label="Copy a style" value="" open={shown.has("copy")} onToggle={() => toggle("copy")}>
          <CopyStyleField />
        </MenuSection>
      ) : null}
    </FoldingMenu>
  )
}

/** Remembered in this browser, starting on 4 (part 18). */
function TriesField() {
  const { tries, setTries, model } = useThumbnails()
  return (
    <div className="grid gap-2">
      <Tabs value={String(tries)} onValueChange={(next) => setTries(Number(next) as AiTries)}>
        <TabsList aria-label="How many to make">
          {AI_TRIES.map((count) => (
            <TabsTrigger key={count} value={String(count)}>
              {count}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <p className="text-xs text-muted-foreground">
        Every AI button, such as Improve or Make it, makes {tries} new{" "}
        {tries === 1 ? "thumbnail" : "thumbnails"} to pick from, at{" "}
        {formatCents(aiUnitCostCents(model, 1))} each.
      </p>
    </div>
  )
}

function ModelField() {
  const { model, setModel } = useThumbnails()
  return (
    <Select value={model} onValueChange={(next) => setModel(next as ImageModelId)}>
      <SelectTrigger aria-label="Picture model" className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ACTOR_IMAGE_MODELS.map((item) => (
          <SelectItem key={item.id} value={item.id}>
            {item.label} · {formatCents(aiUnitCostCents(item.id, 1))}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** A mark out of 10 for three things, with one fix each (part 21). */
function CheckField() {
  const { open, run, busy, replaceRow } = useThumbnails()
  if (!open) return null
  const check = open.check
  const stale = !!check && check.version !== open.version
  return (
    <div className="grid gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={busy !== null}
        onClick={() =>
          void run("Checking…", async () => {
            replaceRow({ ...open, check: await checkThumbnailNow(open.id) })
          })
        }
      >
        <CheckIcon />
        {withEstimate(check ? "Check again" : "Check it", checkCostCents())}
      </Button>
      {stale ? <p className="text-xs text-muted-foreground">The thumbnail changed since this check.</p> : null}
      {check?.marks.map((mark) => (
        <div key={mark.thing} className={cn("grid gap-0.5", stale && "opacity-60")}>
          <p className="flex justify-between">
            <span>{CHECK_LABELS[mark.thing]}</span>
            <span className="font-semibold tabular-nums">{mark.mark} out of 10</span>
          </p>
          <p className="text-xs text-muted-foreground">{mark.fix}</p>
        </div>
      ))}
    </div>
  )
}

/** Save the open one's layout for everyone on the site, and delete your own (part 10). */
function TemplatesField() {
  const { videoId } = useEditorRuntime()
  const { open, run, busy, templates, setTemplates } = useThumbnails()
  const [name, setName] = React.useState("")
  const [deleting, setDeleting] = React.useState<{ id: string; name: string } | null>(null)
  const mine = templates.filter((template) => template.mine)
  return (
    <div className="grid gap-2">
      {open ? (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (!name.trim()) {
              showErrorToast("Name the template first.")
              return
            }
            void run("Saving the template…", async () => {
              const saved = await saveAsTemplate(open.id, name.trim())
              setTemplates([saved, ...templates])
              setName("")
            })
          }}
        >
          <Label htmlFor="template-name" className="sr-only">
            Template name
          </Label>
          <Input id="template-name" value={name} maxLength={120} placeholder="Name this one" onChange={(event) => setName(event.target.value)} />
          <Button type="submit" variant="outline" disabled={busy !== null}>
            Save
          </Button>
        </form>
      ) : null}
      <p className="text-xs text-muted-foreground">Everyone on the site can start from a template. Pictures become empty spots.</p>
      {mine.map((template) => (
        <div key={template.id} className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate">{template.name}</span>
          <Hint label="Delete the template">
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label={`Delete the template ${template.name}`}
              onClick={() => setDeleting({ id: template.id, name: template.name })}
            >
              <Trash2Icon />
            </Button>
          </Hint>
        </div>
      ))}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!next) setDeleting(null)
        }}
        title={`Delete ${deleting?.name ?? "the template"}?`}
        description="Everyone on the site loses it as a starting point. Thumbnails already made from it stay as they are. This can't be undone."
        confirmLabel="Delete"
        loading={busy !== null}
        onConfirm={() => {
          const target = deleting
          if (!target) return
          void run("Deleting the template…", async () => {
            await removeTemplate(videoId, target.id)
            setTemplates(templates.filter((one) => one.id !== target.id))
          }).finally(() => setDeleting(null))
        }}
      />
    </div>
  )
}

/** A template copied from a YouTube link or a picture (part 22). */
function CopyStyleField() {
  const { videoId } = useEditorRuntime()
  const { run, busy, open, templates, setTemplates } = useThumbnails()
  const [link, setLink] = React.useState("")
  const [picking, setPicking] = React.useState(false)
  const shape: ThumbnailShape = open?.shape ?? "wide"

  function copy(source: () => Promise<{ link?: string; mediaId?: string }>) {
    return run("Reading its layout…", async () => {
      const template = await copyThumbnailStyle({ videoId, shape, ...(await source()) })
      setTemplates([template, ...templates])
    })
  }

  return (
    <div className="grid gap-2">
      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (!link.trim()) {
            showErrorToast("Paste a YouTube link first.")
            return
          }
          void copy(async () => ({ link: link.trim() }))
        }}
      >
        <Label htmlFor="copy-style-link">YouTube link</Label>
        <Input id="copy-style-link" value={link} placeholder="https://youtube.com/watch?v=…" onChange={(event) => setLink(event.target.value)} />
        <Button type="submit" variant="outline" disabled={busy !== null}>
          {withEstimate("Copy the style", copyStyleCostCents())}
        </Button>
      </form>
      <Button type="button" variant="ghost" disabled={busy !== null} onClick={() => setPicking(true)}>
        Or copy it from a picture
      </Button>
      <p className="text-xs text-muted-foreground">Takes the layout and colours, never the picture itself.</p>
      <MediaPicker
        open={picking}
        onOpenChange={setPicking}
        showVideos={false}
        onSelectMedia={(url) => {
          setPicking(false)
          void copy(async () => ({ mediaId: (await pictureFromLibrary(videoId, url)).mediaId }))
        }}
      />
    </div>
  )
}
