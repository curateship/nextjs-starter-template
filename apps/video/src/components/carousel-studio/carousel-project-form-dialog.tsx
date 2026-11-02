import * as React from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { SettingsFoldCard } from "@/components/video-assets/settings-fold-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ColorSwatch } from "@/components/ui/color-swatch"
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
import {
  createCarouselProject,
  getCarouselProjectErrorMessage,
  saveCarouselProjectSettingsFor,
  type CarouselFolderSummary,
  type CarouselProjectItem,
} from "@/lib/api/video/carousel-projects"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import {
  CAROUSEL_FOOTER_MAX,
  carouselLookSchema,
  type CarouselLook,
} from "@/lib/video/carousel-look"
import {
  CAROUSEL_LETTER_SPACING_RANGE,
  CAROUSEL_LINE_HEIGHT_RANGE,
  CAROUSEL_OUTLINE_WIDTH_MAX,
} from "@/lib/video/carousel-schema"
import { NO_FOLDER } from "@/lib/video/project-folders"
import { TEXT_FONTS } from "@/lib/video/text-fonts"

/** Every look field as typed; empty keeps the app's own starting value. */
type LookDraft = Record<keyof CarouselLook, string>

const LOOK_KEYS = [
  "fontId",
  "textColor",
  "fontSize",
  "lineHeight",
  "letterSpacing",
  "boxColor",
  "outlineColor",
  "outlineWidth",
  "backgroundColor",
] as const satisfies readonly (keyof CarouselLook)[]

const NUMBER_KEYS = new Set<keyof CarouselLook>([
  "fontSize",
  "lineHeight",
  "letterSpacing",
  "outlineWidth",
])

const DEFAULT_FONT = "default"

type Draft = { name: string; look: LookDraft; footer: string }

function draftOf(project: CarouselProjectItem | null): Draft {
  const look = project?.look ?? {}
  return {
    name: project?.name ?? "",
    look: Object.fromEntries(
      LOOK_KEYS.map((key) => [key, look[key] === undefined ? "" : String(look[key])])
    ) as LookDraft,
    footer: project?.caption_footer ?? "",
  }
}

/** The typed look, checked; the first field that is wrong is named. */
function readLook(draft: LookDraft): { look: CarouselLook } | { error: string } {
  const value: Record<string, string | number> = {}
  for (const key of LOOK_KEYS) {
    const typed = draft[key].trim()
    if (!typed) continue
    value[key] = NUMBER_KEYS.has(key) ? Number(typed) : typed
  }
  const parsed = carouselLookSchema.safeParse(value)
  if (parsed.success) return { look: parsed.data }
  const field = String(parsed.error.issues[0]?.path[0] ?? "")
  return { error: `Check ${LOOK_LABELS[field as keyof CarouselLook] ?? "the look"}.` }
}

const LOOK_LABELS: Record<keyof CarouselLook, string> = {
  fontId: "the font",
  textColor: "the text colour",
  fontSize: "the largest text size",
  lineHeight: "the line height",
  letterSpacing: "the letter spacing",
  boxColor: "the box colour",
  outlineColor: "the outline colour",
  outlineWidth: "the outline width",
  backgroundColor: "the slide background",
}

/**
 * A new carousel project's name and folder, or a carousel project's settings:
 * its name, the look a new carousel in it starts with and the caption footer
 * (Tyler, 1 Nov 2026: "fonts, colours, text styles and slide background").
 * Neither changes a carousel already made.
 */
export function CarouselProjectFormDialog({
  open,
  project,
  folderId,
  folders = [],
  onClose,
  onCreated,
  onSaved,
}: {
  open: boolean
  /** The project whose settings these are, or null when making a new one. */
  project: CarouselProjectItem | null
  /** The folder a new project starts in: the one the list is showing. */
  folderId: string | null
  folders?: CarouselFolderSummary[]
  onClose: () => void
  /** Handed the new project and the id of its first carousel. */
  onCreated: (project: CarouselProjectItem, carouselId: string) => void
  onSaved: (saved: CarouselProjectItem) => void
}) {
  const [draft, setDraft] = React.useState(() => draftOf(project))
  const [saving, setSaving] = React.useState(false)
  const [newFolderId, setNewFolderId] = React.useState(folderId)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setDraft(draftOf(project))
      setNewFolderId(folderId)
    }
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(project))
  const setLook = (key: keyof CarouselLook, value: string) =>
    setDraft({ ...draft, look: { ...draft.look, [key]: value } })

  async function handleSave() {
    if (!draft.name.trim()) {
      showErrorToast("A project needs a name.")
      inputRef.current?.focus()
      return
    }
    setSaving(true)
    try {
      if (!project) {
        const created = await createCarouselProject(draft.name, newFolderId)
        dismissErrorToast()
        onCreated(created.project, created.carousel)
        onClose()
        return
      }
      if (!dirty) {
        onClose()
        return
      }
      const read = readLook(draft.look)
      if ("error" in read) {
        showErrorToast(read.error)
        return
      }
      const saved = await saveCarouselProjectSettingsFor({
        projectId: project.id,
        name: draft.name,
        look: read.look,
        captionFooter: draft.footer,
      })
      onSaved(saved)
      dismissErrorToast()
      toast.success("Project settings saved.")
      onClose()
    } catch (error) {
      showErrorToast(getCarouselProjectErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormDialog open={open} dirty={dirty} busy={saving} onClose={onClose}>
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
            <DialogTitle>{project ? "Project settings" : "New carousel project"}</DialogTitle>
            <DialogDescription>
              {project
                ? "What this project is called, the look a new carousel in it starts with, and the words put at the end of a new carousel's caption."
                : "It opens with one carousel, named after the project."}
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
                storageId="carousel-project-settings-name"
                show={!draft.name.trim()}
                title="Name"
              >
                <div className="grid gap-2">
                  <Label htmlFor="carousel-project-name">Project name</Label>
                  <Input
                    id="carousel-project-name"
                    ref={inputRef}
                    value={draft.name}
                    maxLength={200}
                    aria-invalid={!draft.name.trim() || undefined}
                    placeholder="Weekly tips"
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
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
                      <Label htmlFor="carousel-project-folder">Put it in</Label>
                      <Select
                        value={newFolderId ?? NO_FOLDER}
                        onValueChange={(value) => setNewFolderId(value === NO_FOLDER ? null : value)}
                      >
                        <SelectTrigger id="carousel-project-folder" className="sm:w-60">
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
                  storageId="carousel-project-settings-look"
                  title="Look"
                  description="What a new carousel in this project starts with. Anything left empty keeps the usual starting look."
                >
                  <div className="grid gap-2">
                    <Label htmlFor="carousel-look-font">Font</Label>
                    <Select
                      value={draft.look.fontId || DEFAULT_FONT}
                      onValueChange={(value) => setLook("fontId", value === DEFAULT_FONT ? "" : value)}
                    >
                      <SelectTrigger id="carousel-look-font" className="sm:w-60">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={DEFAULT_FONT}>Usual font</SelectItem>
                        {TEXT_FONTS.map((font) => (
                          <SelectItem key={font.id} value={font.id}>
                            {font.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <ColorRow id="textColor" label="Text colour" draft={draft.look} onChange={setLook} />
                  <div className="grid grid-cols-3 gap-4">
                    <NumberRow id="fontSize" label="Largest text" draft={draft.look} onChange={setLook} min={8} max={220} step={1} />
                    <NumberRow
                      id="lineHeight"
                      label="Line height"
                      draft={draft.look}
                      onChange={setLook}
                      min={CAROUSEL_LINE_HEIGHT_RANGE.min}
                      max={CAROUSEL_LINE_HEIGHT_RANGE.max}
                      step={0.05}
                    />
                    <NumberRow
                      id="letterSpacing"
                      label="Letter spacing"
                      draft={draft.look}
                      onChange={setLook}
                      min={CAROUSEL_LETTER_SPACING_RANGE.min}
                      max={CAROUSEL_LETTER_SPACING_RANGE.max}
                      step={0.01}
                    />
                  </div>
                  <ColorRow id="boxColor" label="Box behind the text" draft={draft.look} onChange={setLook} />
                  <div className="grid grid-cols-2 items-end gap-4">
                    <ColorRow id="outlineColor" label="Outline colour" draft={draft.look} onChange={setLook} />
                    <NumberRow
                      id="outlineWidth"
                      label="Outline width"
                      draft={draft.look}
                      onChange={setLook}
                      min={0}
                      max={CAROUSEL_OUTLINE_WIDTH_MAX}
                      step={1}
                    />
                  </div>
                  <ColorRow id="backgroundColor" label="Slide background" draft={draft.look} onChange={setLook} />
                </SettingsFoldCard>
              ) : null}

              {project ? (
                <SettingsFoldCard
                  fold
                  storageId="carousel-project-settings-footer"
                  title="Caption footer"
                  description="Put at the end of every new carousel's caption, where it can still be changed."
                >
                  <div className="grid gap-2">
                    <FieldLabel htmlFor="carousel-project-footer" hint="Hashtags, a sign-off, a link line.">
                      Footer
                    </FieldLabel>
                    <Textarea
                      id="carousel-project-footer"
                      rows={3}
                      maxLength={CAROUSEL_FOOTER_MAX}
                      value={draft.footer}
                      placeholder="#fitness #tips"
                      onChange={(event) => setDraft({ ...draft, footer: event.target.value })}
                    />
                  </div>
                </SettingsFoldCard>
              ) : null}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={saving} onClick={requestClose}>
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

/** A colour in the look: the picker and its hex, which may be left empty. */
function ColorRow({
  id,
  label,
  draft,
  onChange,
}: {
  id: keyof CarouselLook
  label: string
  draft: LookDraft
  onChange: (key: keyof CarouselLook, value: string) => void
}) {
  const value = draft[id]
  return (
    <div className="grid gap-2">
      <Label htmlFor={`carousel-look-${id}`}>{label}</Label>
      <div className="flex items-center gap-2">
        <ColorSwatch
          aria-label={`${label} picker`}
          // Faded while unset, so the picker's black never reads as a choice.
          className={/^#[0-9a-f]{6}$/i.test(value) ? undefined : "opacity-30"}
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
          onChange={(event) => onChange(id, event.target.value)}
        />
        <Input
          id={`carousel-look-${id}`}
          className="w-28"
          value={value}
          placeholder="Usual"
          maxLength={7}
          onChange={(event) => onChange(id, event.target.value)}
        />
      </div>
    </div>
  )
}

function NumberRow({
  id,
  label,
  draft,
  onChange,
  min,
  max,
  step,
}: {
  id: keyof CarouselLook
  label: string
  draft: LookDraft
  onChange: (key: keyof CarouselLook, value: string) => void
  min: number
  max: number
  step: number
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={`carousel-look-${id}`}>{label}</Label>
      <Input
        id={`carousel-look-${id}`}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={draft[id]}
        placeholder="Usual"
        onChange={(event) => onChange(id, event.target.value)}
      />
    </div>
  )
}
