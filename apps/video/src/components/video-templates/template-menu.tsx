import * as React from "react"
import {
  CopyIcon,
  Loader2Icon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  RotateCcwIcon,
  SettingsIcon,
  SparklesIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"

import { FoldingMenu, MenuAction, MenuLine, MenuSection, useOpenSections } from "@/components/shared/folding-menu"
import { SettingsFoldCard } from "@/components/video-assets/settings-fold-card"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MultiCombobox } from "@/components/ui/multi-combobox"
import { NumberField } from "@/components/ui/number-field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { CaptionLookFields } from "@/components/video-editor/caption-look-fields"
import { useCaptionSettings } from "@/components/video-editor/caption-settings-context"
import { useEditorRuntime } from "@/components/video-editor/editor-store"
import { useSaveAfterTyping } from "@/components/video-editor/use-save-after-typing"
import { useTemplateSources } from "@/components/video-templates/template-sources"
import {
  addTemplateReference,
  deleteTemplate,
  duplicateTemplate,
  getTemplateErrorMessage,
  previewTemplatePrompt,
  removeTemplateReference,
  tryTemplate,
  updateTemplate,
  type TemplateItem,
} from "@/lib/api/video/templates"
import type { WriterId } from "@/lib/video/ai-choices"
import { formatAiEstimate, videoBreakdownCostCents, withEstimate } from "@/lib/video/ai-estimates"
import { aiUnitCostCents } from "@/lib/ai/ai-models"
import { IMAGE_MODELS } from "@/lib/video/asset-factories"
import { BRIEF_PLATFORMS, briefLengthRange, platformFor } from "@/lib/video/brief"
import { DEFAULT_CAPTION_LOOK } from "@/lib/video/caption-look"
import { formatCents } from "@/lib/video/project-spend"
import {
  SCENES_TOKEN,
  TEMPLATE_PROMPT_MAX,
  TEMPLATE_LANGUAGES_MAX,
  TEMPLATE_MUSIC_MOOD_MAX,
  TEMPLATE_NAME_MAX,
  TEMPLATE_PACES,
  TEMPLATE_REFERENCE_KINDS,
  TEMPLATE_REFERENCES_MAX,
  TEMPLATE_SCRIPT_MAX,
  cleanTags,
  fitLength,
  paceLabel,
  templateScriptCostCents,
  type TemplateFields,
  type TemplateFieldsPatch,
  type TemplatePace,
  type TemplateReferenceKind,
} from "@/lib/video/templates"
import { TRANSLATE_LANGUAGES, type TranslateLanguage } from "@/lib/video/translate"
import { createDefaultVoiceSettings, VOICE_MODELS, type VoiceModelId } from "@/lib/video/voice"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * A template's edit dropdown (templates.md, part 3): the shell's one folding
 * menu, one folding row per thing the template holds, each saving itself
 * 700ms after the last change, then Pin, Duplicate and Delete under the line.
 * Tyler, 5 Nov 2026: "Click edit should open a dropdown to edit template".
 */

const SAVE_DELAY_MS = 700
const USUAL_VOICE = "usual"
const NONE = "none"
const SAVED_LOOK = "saved"
const OWN_LOOK = "own"

type Section =
  | "instructions"
  | "name"
  | "platform"
  | "pace"
  | "voice"
  | "pictures"
  | "references"
  | "captions"
  | "music"
  | "intro"
  | "languages"
  | "cap"
  | "try"

const REFERENCE_LABELS: Record<TemplateReferenceKind, string> = {
  picture: "A picture",
  video: "A video",
  viral: "A Viral original",
  link: "A link",
}

/** "45s" on a short platform, "3 min" on YouTube. */
function lengthLabel(seconds: number, platform: TemplateFields["platform"]) {
  return platformFor(platform).short ? `${seconds}s` : `${Math.max(1, Math.round(seconds / 60))} min`
}

/**
 * The length after switching platform: brought into the platform's range,
 * and to whole minutes on YouTube, at least one.
 */
function lengthFor(seconds: number, platform: TemplateFields["platform"]) {
  const fitted = fitLength(seconds, platform)
  return platformFor(platform).short ? fitted : Math.max(60, Math.round(fitted / 60) * 60)
}

function firstWords(text: string, count = 4) {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return "Not written"
  return words.length > count ? `${words.slice(0, count).join(" ")}…` : words.join(" ")
}

function dollarsToCents(value: string) {
  const cleaned = value.replace(/[$,\s]/g, "")
  if (!cleaned) return null
  const dollars = Number(cleaned)
  return Number.isFinite(dollars) && dollars > 0 ? Math.round(dollars * 100) : NaN
}

type EditorProps = {
  template: TemplateItem
  /** The writer the AI presses use, for their prices. Null with no key for any writer. */
  writer: WriterId | null
  onSaved: (template: TemplateItem) => void
  onDuplicated: (template: TemplateItem) => void
  onDeleted: (templateId: string) => void
}

/** The cog on a template's row in the Templates panel: the editor in the shell's folding menu. */
export function TemplateMenu(props: EditorProps) {
  const [open, setOpen] = React.useState(false)
  return (
    <FoldingMenu
      label={`Edit ${props.template.name}`}
      align="start"
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Edit ${props.template.name}`}>
          <SettingsIcon />
        </Button>
      }
    >
      <TemplateEditor {...props} active={open} onDone={() => setOpen(false)} />
    </FoldingMenu>
  )
}

type RowLook = {
  look: "menu" | "cards"
  shown: ReadonlySet<Section>
  toggle: (section: Section) => void
  /** Rows left out, such as the template's own name for a video's copy. */
  hidden: ReadonlySet<Section>
}

/** What a video's own copy leaves out: these belong to the template. */
const VIDEO_HIDDEN = new Set<Section>(["name", "references", "try"])
const NONE_HIDDEN = new Set<Section>()

const RowLookContext = React.createContext<RowLook | null>(null)

/**
 * One thing a template holds. In the cog's dropdown it is a folding row of
 * the shell's menu; in the header's settings window it is the folding card
 * every other settings window uses (Tyler, 5 Nov 2026: "each of the settings
 * should be the regular cards with collapseble like other modals"), with
 * what it holds now under its title.
 */
function Row({ id, label, value, children }: { id: Section; label: string; value: string; children: React.ReactNode }) {
  const row = React.useContext(RowLookContext)
  if (!row || row.hidden.has(id)) return null
  if (row.look === "cards") {
    return (
      <SettingsFoldCard fold storageId={`video-template-${id}`} title={label} description={value || undefined}>
        {children}
      </SettingsFoldCard>
    )
  }
  return (
    <MenuSection label={label} value={value} open={row.shown.has(id)} onToggle={() => row.toggle(id)}>
      {children}
    </MenuSection>
  )
}

/**
 * Every setting a template holds, then Pin, Duplicate and Delete under the
 * line: the same editor in the cog on a template in the Templates panel and
 * in the header's settings window. Each setting saves itself 700ms after
 * the last change.
 */
export function TemplateEditor({
  template,
  writer,
  onSaved,
  onDuplicated,
  onDeleted,
  active,
  actions = true,
  look = "menu",
  onDone,
  forVideo,
}: EditorProps & {
  /**
   * Edits the open video's own copy of the settings instead of the template
   * (the header's settings window, templates.md). The name, references and
   * Try it belong to the template, so they are left out; every change saves
   * onto the video and never reaches the template.
   */
  forVideo?: { save: (fields: TemplateFieldsPatch) => Promise<void> }
  /** Pin, Duplicate and Delete under the line. The header's window has none. */
  actions?: boolean
  /** Folding menu rows, or the folding cards of a settings window. */
  look?: "menu" | "cards"
  /**
   * Being looked at: its choices are fetched, and it keeps what is typed
   * rather than taking a fresh copy saved elsewhere.
   */
  active: boolean
  /** After Duplicate or Delete, such as closing the dropdown it sits in. */
  onDone?: () => void
}) {
  const { projectId, videoId } = useEditorRuntime()
  const captionSettings = useCaptionSettings()
  const open = active
  const [shown, toggle] = useOpenSections<Section>()
  const sources = useTemplateSources(projectId, open)
  const [name, setName] = React.useState(template.name)
  const [tags, setTags] = React.useState(template.tags.join(", "))
  const [fields, setFields] = React.useState<TemplateFields>(template.fields)
  const [capText, setCapText] = React.useState(
    template.fields.spendCapCents ? (template.fields.spendCapCents / 100).toFixed(2) : ""
  )
  const [capInvalid, setCapInvalid] = React.useState(false)
  const [busy, setBusy] = React.useState<null | "duplicate" | "delete" | "pin">(null)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  // Changes waiting for the save after typing stops, merged as they come.
  const pending = React.useRef<{ name?: string; tags?: string[]; fields: TemplateFieldsPatch }>({ fields: {} })
  const { later } = useSaveAfterTyping(SAVE_DELAY_MS)

  // A template saved elsewhere (another row's Duplicate, a reference that
  // finished) comes in fresh, unless this menu is open and being typed in.
  const [seen, setSeen] = React.useState(template)
  if (seen !== template && !open) {
    setSeen(template)
    setName(template.name)
    setTags(template.tags.join(", "))
    setFields(template.fields)
    setCapText(template.fields.spendCapCents ? (template.fields.spendCapCents / 100).toFixed(2) : "")
  }

  function save() {
    const patch = pending.current
    pending.current = { fields: {} }
    const hasFields = Object.keys(patch.fields).length > 0
    if (!hasFields && patch.name === undefined && patch.tags === undefined) return
    if (forVideo) {
      if (hasFields) {
        forVideo.save(patch.fields).catch((error: unknown) => showErrorToast(getTemplateErrorMessage(error)))
      }
      return
    }
    updateTemplate({
      templateId: template.id,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.tags ? { tags: patch.tags } : {}),
      ...(hasFields ? { fields: patch.fields } : {}),
    })
      .then(onSaved)
      .catch((error: unknown) => showErrorToast(getTemplateErrorMessage(error)))
  }

  function change(patch: TemplateFieldsPatch, now = false) {
    setFields((current) => ({ ...current, ...patch }))
    pending.current = { ...pending.current, fields: { ...pending.current.fields, ...patch } }
    if (now) save()
    else later(save)
  }

  async function act(kind: "duplicate" | "delete" | "pin") {
    setBusy(kind)
    try {
      if (kind === "duplicate") {
        onDuplicated(await duplicateTemplate(template.id))
        onDone?.()
      } else if (kind === "pin") {
        onSaved(await updateTemplate({ templateId: template.id, pinned: !template.pinned }))
      } else {
        await deleteTemplate(template.id)
        setConfirmDelete(false)
        onDone?.()
        onDeleted(template.id)
      }
    } catch (error) {
      showErrorToast(getTemplateErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  const platform = platformFor(fields.platform)
  const range = briefLengthRange(fields.platform)
  const voiceName = fields.voice?.name ?? "Usual voice"
  const isOpenAi = fields.voice?.speaker === "openai"
  const pictureLabel = IMAGE_MODELS.find((model) => model.id === fields.pictureModel)?.label ?? fields.pictureModel
  const actorName = fields.actorId ? (sources?.actors.find((actor) => actor.id === fields.actorId)?.name ?? "An actor") : null

  return (
    <RowLookContext.Provider value={{ look, shown, toggle, hidden: forVideo ? VIDEO_HIDDEN : NONE_HIDDEN }}>
        {/* First, in both the cog's dropdown and the video's settings window
            (Tyler, 5 Nov 2026: "This should be the first card"). It replaced
            the What it is and What the AI reads cards and the idea's own
            instructions, which said the same things three ways ("There is too
            many redundency here"). */}
        <Row
          id="instructions"
          label="Instructions"
          value={fields.scriptPrompt !== null ? "Your own" : firstWords(fields.instructions)}
        >
          <InstructionsEditor
            templateId={template.id}
            videoId={videoId}
            open={look === "cards" || shown.has("instructions")}
            fields={fields}
            onChange={change}
          />
        </Row>

        <Row id="name" label="Name" value={name}>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor={`template-${template.id}-name`}>Name</Label>
              <Input
                id={`template-${template.id}-name`}
                value={name}
                maxLength={TEMPLATE_NAME_MAX}
                onChange={(event) => {
                  setName(event.target.value)
                  if (!event.target.value.trim()) return
                  pending.current = { ...pending.current, name: event.target.value }
                  later(save)
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`template-${template.id}-tags`}>Tags, with a comma between</Label>
              <Input
                id={`template-${template.id}-tags`}
                value={tags}
                placeholder="Ads, Series"
                onChange={(event) => {
                  setTags(event.target.value)
                  pending.current = { ...pending.current, tags: cleanTags(event.target.value.split(",")) }
                  later(save)
                }}
              />
            </div>
          </div>
        </Row>

        <Row
          id="platform"
          label="Platform"
          value={`${platform.label} · ${lengthLabel(fields.lengthSeconds, fields.platform)}`}
        >
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor={`template-${template.id}-platform`}>Platform</Label>
              <Select
                value={fields.platform}
                onValueChange={(next) => {
                  if (!next) return
                  const picked = next as TemplateFields["platform"]
                  change({ platform: picked, lengthSeconds: lengthFor(fields.lengthSeconds, picked) }, true)
                }}
              >
                <SelectTrigger id={`template-${template.id}-platform`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BRIEF_PLATFORMS.map((one) => (
                    <SelectItem key={one.id} value={one.id}>
                      {one.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* YouTube runs in minutes (Tyler, 5 Nov 2026: "if I select youtube,
                this should be minutes"); the length is kept in seconds. */}
            {platform.short ? (
              <NumberField
                id={`template-${template.id}-length`}
                label="Length in seconds"
                hint={`${range.min} to ${range.max} seconds on ${platform.label}. A pasted script runs its own length; this sets the typical price.`}
                value={fields.lengthSeconds}
                min={range.min}
                max={range.max}
                onChange={(lengthSeconds) => change({ lengthSeconds })}
              />
            ) : (
              <NumberField
                id={`template-${template.id}-length`}
                label="Length in minutes"
                hint={`1 to ${range.max / 60} minutes on ${platform.label}. A pasted script runs its own length; this sets the typical price.`}
                value={Math.max(1, Math.round(fields.lengthSeconds / 60))}
                min={1}
                max={range.max / 60}
                onChange={(minutes) => change({ lengthSeconds: minutes * 60 })}
              />
            )}
          </div>
        </Row>

        <Row id="pace" label="Pace" value={paceLabel(fields.pace)}>
          <div className="grid gap-2">
            <Tabs value={fields.pace} onValueChange={(next) => change({ pace: next as TemplatePace }, true)}>
              <TabsList aria-label="Pace" className="w-full">
                {TEMPLATE_PACES.map((pace) => (
                  <TabsTrigger key={pace.id} value={pace.id} className="flex-1">
                    {pace.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <p className="text-muted-foreground">
              {(() => {
                const one = TEMPLATE_PACES.find((pace) => pace.id === fields.pace) ?? TEMPLATE_PACES[1]
                const seconds = platform.short ? one.short : one.long
                return `${seconds.min} to ${seconds.max} seconds a scene. Faster means more pictures, so a higher price.`
              })()}
            </p>
          </div>
        </Row>

        <Row id="voice" label="Voice" value={voiceName}>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor={`template-${template.id}-voice`}>Voice</Label>
              <Select
                value={fields.voice?.id ?? USUAL_VOICE}
                onValueChange={(next) => {
                  if (!next) return
                  if (next === USUAL_VOICE) {
                    change({ voice: null }, true)
                    return
                  }
                  const picked = sources?.voices.find((voice) => voice.id === next)
                  if (!picked) return
                  change(
                    {
                      voice: {
                        id: picked.id,
                        name: picked.name,
                        speaker: picked.speaker,
                        modelId: fields.voice?.modelId ?? "eleven_multilingual_v2",
                        settings: fields.voice?.settings ?? createDefaultVoiceSettings(),
                      },
                    },
                    true
                  )
                }}
              >
                <SelectTrigger id={`template-${template.id}-voice`} className="w-full">
                  <SelectValue placeholder={sources ? "Usual voice" : "Fetching voices…"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={USUAL_VOICE}>The usual voice</SelectItem>
                  {fields.voice && !sources?.voices.some((voice) => voice.id === fields.voice?.id) ? (
                    <SelectItem value={fields.voice.id}>{fields.voice.name}</SelectItem>
                  ) : null}
                  {sources?.voices.map((voice) => (
                    <SelectItem key={voice.id} value={voice.id}>
                      {voice.name}
                      {voice.yours ? " (yours)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {fields.voice && !isOpenAi ? (
              <div className="grid gap-2">
                <Label htmlFor={`template-${template.id}-quality`}>Voice quality</Label>
                <Select
                  value={fields.voice.modelId}
                  onValueChange={(next) => {
                    if (next && fields.voice) change({ voice: { ...fields.voice, modelId: next as VoiceModelId } }, true)
                  }}
                >
                  <SelectTrigger id={`template-${template.id}-quality`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VOICE_MODELS.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.label}, {model.note.toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <p className="text-muted-foreground">
              The usual voice is the one saved with &quot;Make this the usual voice&quot; in the Voice window.
            </p>
          </div>
        </Row>

        <Row
          id="pictures"
          label="Pictures"
          value={actorName ? `${pictureLabel} · ${actorName}` : pictureLabel}
        >
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor={`template-${template.id}-model`}>Picture model</Label>
              <Select
                value={fields.pictureModel}
                onValueChange={(next) => {
                  if (next) change({ pictureModel: next as TemplateFields["pictureModel"] }, true)
                }}
              >
                <SelectTrigger id={`template-${template.id}-model`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IMAGE_MODELS.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.label} · {formatCents(aiUnitCostCents(model.id, 1))} a picture
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`template-${template.id}-actor`}>Actor</Label>
              <Select
                value={fields.actorId ?? NONE}
                onValueChange={(next) => {
                  if (next) change({ actorId: next === NONE ? null : next }, true)
                }}
              >
                <SelectTrigger id={`template-${template.id}-actor`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No actor</SelectItem>
                  {fields.actorId && !sources?.actors.some((actor) => actor.id === fields.actorId) ? (
                    <SelectItem value={fields.actorId}>The actor set before</SelectItem>
                  ) : null}
                  {sources?.actors.map((actor) => (
                    <SelectItem key={actor.id} value={actor.id}>
                      {actor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground">
                The same person in every scene that shows a person. Their sheet pictures go with each of those
                pictures.
              </p>
            </div>
          </div>
        </Row>

        <Row
          id="references"
          label="References"
          value={template.references.length ? String(template.references.length) : "None"}
        >
          <ReferencesEditor template={template} sources={sources} onSaved={onSaved} />
        </Row>

        <Row
          id="captions"
          label="Captions"
          value={fields.captions.on ? (fields.captions.look ? "Own look" : "Saved look") : "Off"}
        >
          <div className="grid gap-4">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`template-${template.id}-captions`}>Captions</Label>
              <Switch
                id={`template-${template.id}-captions`}
                checked={fields.captions.on}
                onCheckedChange={(on) => change({ captions: { ...fields.captions, on } }, true)}
              />
            </div>
            {fields.captions.on ? (
              <div className="grid gap-2">
                <Label htmlFor={`template-${template.id}-look`}>Look</Label>
                <Select
                  value={fields.captions.look ? OWN_LOOK : SAVED_LOOK}
                  onValueChange={(next) =>
                    change(
                      {
                        captions: {
                          on: true,
                          look: next === OWN_LOOK ? (fields.captions.look ?? captionSettings.look ?? DEFAULT_CAPTION_LOOK) : null,
                        },
                      },
                      true
                    )
                  }
                >
                  <SelectTrigger id={`template-${template.id}-look`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SAVED_LOOK}>The look in Settings → Captions</SelectItem>
                    <SelectItem value={OWN_LOOK}>This template&apos;s own look</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {fields.captions.on && fields.captions.look ? (
              <CaptionLookFields
                idPrefix={`template-${template.id}-caption`}
                look={fields.captions.look}
                safeBoxes={captionSettings.safeBoxes}
                onChange={(look) => change({ captions: { on: true, look } })}
              />
            ) : null}
          </div>
        </Row>

        <Row
          id="music"
          label="Music"
          value={fields.music.kind === "none" ? "None" : fields.music.kind === "ai" ? "AI music" : fields.music.name}
        >
          <MusicEditor fields={fields} sources={sources} onChange={(music, now) => change({ music }, now)} templateId={template.id} />
        </Row>

        <Row
          id="intro"
          label="Intro and outro"
          value={fields.introMediaId || fields.outroMediaId ? "Own" : "The project's"}
        >
          <div className="grid gap-4">
            {(["introMediaId", "outroMediaId"] as const).map((key) => (
              <div key={key} className="grid gap-2">
                <Label htmlFor={`template-${template.id}-${key}`}>{key === "introMediaId" ? "Intro" : "Outro"}</Label>
                <Select
                  value={fields[key] ?? NONE}
                  onValueChange={(next) => {
                    if (next) change({ [key]: next === NONE ? null : next }, true)
                  }}
                >
                  <SelectTrigger id={`template-${template.id}-${key}`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>The project&apos;s, if it has one</SelectItem>
                    {fields[key] && !sources?.videos.some((file) => file.id === fields[key]) ? (
                      <SelectItem value={fields[key] as string}>The video set before</SelectItem>
                    ) : null}
                    {sources?.videos.map((file) => (
                      <SelectItem key={file.id} value={file.id}>
                        {file.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
            <p className="text-muted-foreground">Picked from this project&apos;s Media. They go round every export of the video.</p>
          </div>
        </Row>

        <Row
          id="languages"
          label="Languages"
          value={fields.languages.length ? fields.languages.join(", ") : "None"}
        >
          <div className="grid gap-2">
            <Label htmlFor={`template-${template.id}-languages`}>A copy in each, once it is made</Label>
            <MultiCombobox
              id={`template-${template.id}-languages`}
              value={fields.languages}
              options={TRANSLATE_LANGUAGES}
              placeholder="No copies"
              onChange={(languages) =>
                change({ languages: languages.slice(0, TEMPLATE_LANGUAGES_MAX) as TranslateLanguage[] }, true)
              }
            />
            <p className="text-muted-foreground">
              Each copy is a new video in the project, with the same pictures and its own voice. Up to{" "}
              {TEMPLATE_LANGUAGES_MAX}.
            </p>
          </div>
        </Row>

        <Row
          id="cap"
          label="Spending cap"
          value={fields.spendCapCents ? `${formatCents(fields.spendCapCents)} a video` : "None"}
        >
          <div className="grid gap-2">
            <Label htmlFor={`template-${template.id}-cap`}>Most one video may cost, in dollars</Label>
            <Input
              id={`template-${template.id}-cap`}
              inputMode="decimal"
              value={capText}
              placeholder="No cap"
              aria-invalid={capInvalid || undefined}
              onChange={(event) => {
                setCapText(event.target.value)
                const cents = dollarsToCents(event.target.value)
                if (Number.isNaN(cents)) {
                  setCapInvalid(true)
                  return
                }
                setCapInvalid(false)
                change({ spendCapCents: cents })
              }}
            />
            <p className="text-muted-foreground">Make it says so and stops before a video would cost more.</p>
          </div>
        </Row>

        <Row id="try" label="Try it" value="">
          <TryTemplate templateId={template.id} videoId={videoId} fields={fields} writer={writer} />
        </Row>


      {actions ? (
        <>
        <MenuLine />
        <MenuAction
          icon={busy === "pin" ? <Loader2Icon className="animate-spin" /> : template.pinned ? <PinOffIcon /> : <PinIcon />}
          disabled={busy !== null}
          onClick={() => void act("pin")}
        >
          {template.pinned ? "Unpin" : "Pin to the top"}
        </MenuAction>
        <MenuAction
          icon={busy === "duplicate" ? <Loader2Icon className="animate-spin" /> : <CopyIcon />}
          disabled={busy !== null}
          onClick={() => void act("duplicate")}
        >
          Duplicate
        </MenuAction>
        <MenuAction icon={<Trash2Icon />} destructive disabled={busy !== null} onClick={() => setConfirmDelete(true)}>
          Delete
        </MenuAction>
        </>
      ) : null}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${template.name}?`}
        description={
          template.used
            ? `The ${template.used} ${template.used === 1 ? "video" : "videos"} made with it keep what they were made with. This can't be undone.`
            : "This can't be undone."
        }
        confirmLabel="Delete"
        loading={busy === "delete"}
        onConfirm={() => void act("delete")}
      />
    </RowLookContext.Provider>
  )
}

function MusicEditor({
  templateId,
  fields,
  sources,
  onChange,
}: {
  templateId: string
  fields: TemplateFields
  sources: ReturnType<typeof useTemplateSources>
  onChange: (music: TemplateFields["music"], now: boolean) => void
}) {
  const [mood, setMood] = React.useState(fields.music.kind === "ai" ? fields.music.mood : "")
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor={`template-${templateId}-music`}>Music</Label>
        <Select
          value={fields.music.kind}
          onValueChange={(next) => {
            if (next === "none") onChange({ kind: "none" }, true)
            if (next === "ai") onChange({ kind: "ai", mood: mood.trim() || "Calm, warm and steady" }, true)
            if (next === "track") {
              const first = sources?.music[0]
              if (!first) {
                showErrorToast("Your Music list is empty. Add a track in Sounds → Music first.")
                return
              }
              onChange({ kind: "track", mediaId: first.id, name: first.name }, true)
            }
          }}
        >
          <SelectTrigger id={`template-${templateId}-music`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No music</SelectItem>
            <SelectItem value="track">A track from your music</SelectItem>
            <SelectItem value="ai">AI music to a mood</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {fields.music.kind === "track" ? (
        <div className="grid gap-2">
          <Label htmlFor={`template-${templateId}-track`}>Track</Label>
          <Select
            value={fields.music.mediaId}
            onValueChange={(next) => {
              const picked = sources?.music.find((file) => file.id === next)
              if (picked) onChange({ kind: "track", mediaId: picked.id, name: picked.name }, true)
            }}
          >
            <SelectTrigger id={`template-${templateId}-track`} className="w-full">
              <SelectValue placeholder={fields.music.name} />
            </SelectTrigger>
            <SelectContent>
              {sources?.music.some((file) => file.id === (fields.music as { mediaId: string }).mediaId) ? null : (
                <SelectItem value={fields.music.mediaId}>{fields.music.name}</SelectItem>
              )}
              {sources?.music.map((file) => (
                <SelectItem key={file.id} value={file.id}>
                  {file.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {fields.music.kind === "ai" ? (
        <div className="grid gap-2">
          <Label htmlFor={`template-${templateId}-mood`}>What it sounds like</Label>
          <Input
            id={`template-${templateId}-mood`}
            value={mood}
            maxLength={TEMPLATE_MUSIC_MOOD_MAX}
            onChange={(event) => {
              setMood(event.target.value)
              if (event.target.value.trim()) onChange({ kind: "ai", mood: event.target.value.trim() }, false)
            }}
          />
          <p className="text-muted-foreground">Made as long as the video when Make it is pressed, at 30¢ a minute.</p>
        </div>
      ) : null}
      {fields.music.kind !== "none" ? (
        <p className="text-muted-foreground">Laid under the whole video with the last scene, ducking under the voice.</p>
      ) : null}
    </div>
  )
}

function ReferencesEditor({
  template,
  sources,
  onSaved,
}: {
  template: TemplateItem
  sources: ReturnType<typeof useTemplateSources>
  onSaved: (template: TemplateItem) => void
}) {
  const [kind, setKind] = React.useState<TemplateReferenceKind>("picture")
  const [mediaId, setMediaId] = React.useState("")
  const [url, setUrl] = React.useState("")
  const [busy, setBusy] = React.useState<string | null>(null)
  const options =
    kind === "picture"
      ? (sources?.pictures ?? [])
      : kind === "video"
        ? (sources?.videos ?? [])
        : (sources?.originals.map((one) => ({ id: one.mediaId, name: one.name })) ?? [])

  async function add() {
    if (kind === "link" ? !url.trim() : !mediaId) {
      showErrorToast(kind === "link" ? "Paste a YouTube, TikTok or Instagram link first." : "Pick the file first.")
      return
    }
    setBusy("add")
    try {
      onSaved(
        await addTemplateReference({
          templateId: template.id,
          kind,
          ...(kind === "link" ? { url: url.trim() } : { mediaId }),
        })
      )
      setUrl("")
      setMediaId("")
    } catch (error) {
      showErrorToast(getTemplateErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function remove(referenceId: string) {
    setBusy(referenceId)
    try {
      onSaved(await removeTemplateReference(template.id, referenceId))
    } catch (error) {
      showErrorToast(getTemplateErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="grid gap-4">
      {template.references.length ? (
        <ul className="grid gap-2" aria-label="References">
          {template.references.map((ref) => (
            <li key={ref.id} className="flex items-start gap-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate">{ref.name}</span>
                <span className={cn("block text-xs", ref.state === "failed" ? "text-destructive" : "text-muted-foreground")}>
                  {REFERENCE_LABELS[ref.kind]} ·{" "}
                  {ref.state === "ready"
                    ? ref.kind === "picture"
                      ? "sent with every picture"
                      : "broken down, ready"
                    : ref.state === "failed"
                      ? (ref.error ?? "failed")
                      : "being broken down"}
                </span>
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${ref.name}`}
                    disabled={busy !== null}
                    onClick={() => void remove(ref.id)}
                  >
                    {busy === ref.id ? <Loader2Icon className="animate-spin" /> : <XIcon />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Remove this reference</TooltipContent>
              </Tooltip>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">
          Pictures go with every picture. Videos are broken down shot by shot once, so the AI can follow their
          format.
        </p>
      )}
      {template.references.length < TEMPLATE_REFERENCES_MAX ? (
        <div className="grid gap-2">
          <Label htmlFor={`template-${template.id}-ref-kind`}>Add a reference</Label>
          <Select
            value={kind}
            onValueChange={(next) => {
              setKind(next as TemplateReferenceKind)
              setMediaId("")
            }}
          >
            <SelectTrigger id={`template-${template.id}-ref-kind`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEMPLATE_REFERENCE_KINDS.map((one) => (
                <SelectItem key={one} value={one}>
                  {REFERENCE_LABELS[one]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {kind === "link" ? (
            <Input
              aria-label="Video link"
              value={url}
              placeholder="https://www.tiktok.com/@…/video/…"
              onChange={(event) => setUrl(event.target.value)}
            />
          ) : (
            <Select value={mediaId} onValueChange={setMediaId}>
              <SelectTrigger aria-label="File" className="w-full">
                <SelectValue placeholder={options.length ? "Pick one" : "None in this project yet"} />
              </SelectTrigger>
              <SelectContent>
                {options.map((file) => (
                  <SelectItem key={file.id} value={file.id}>
                    {file.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button type="button" variant="outline" className="justify-self-start" disabled={busy !== null} onClick={() => void add()}>
            {busy === "add" ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
            {kind === "picture" ? "Add it" : `Add it · about ${formatAiEstimate(videoBreakdownCostCents(null)).replace(/^about /, "")} a minute`}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function TryTemplate({
  templateId,
  videoId,
  fields,
  writer,
}: {
  templateId: string
  videoId: string
  fields: TemplateFields
  writer: WriterId | null
}) {
  const [script, setScript] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [result, setResult] = React.useState<Awaited<ReturnType<typeof tryTemplate>> | null>(null)
  const cents = templateScriptCostCents(writer, fields, script || "A short sample.")

  async function run() {
    if (!script.trim()) {
      showErrorToast("Paste a sample script first.")
      return
    }
    setBusy(true)
    try {
      setResult(await tryTemplate({ templateId, videoId, script }))
    } catch (error) {
      showErrorToast(getTemplateErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={`template-${templateId}-sample`}>A sample script</Label>
      <Textarea
        id={`template-${templateId}-sample`}
        rows={2}
        maxLength={TEMPLATE_SCRIPT_MAX}
        value={script}
        onChange={(event) => setScript(event.target.value)}
      />
      <Button type="button" variant="outline" className="justify-self-start" disabled={busy} onClick={() => void run()}>
        {busy ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
        {withEstimate("Try it", writer ? cents : null)}
      </Button>
      <p className="text-muted-foreground">Writes the storyboard only. Nothing is saved, and no pictures are made.</p>
      {result ? (
        <div className="grid gap-2" aria-label="Sample storyboard">
          <p className="font-medium">{result.title}</p>
          <ol className="grid gap-2">
            {result.scenes.map((scene, index) => (
              <li key={index} className="grid gap-0.5">
                <span className="[overflow-wrap:anywhere]">
                  {index + 1}. {scene.words}
                </span>
                <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">Picture: {scene.picture}</span>
              </li>
            ))}
          </ol>
          <p className="text-muted-foreground">Making this one would cost about {formatCents(result.cents)}.</p>
        </div>
      ) : null}
    </div>
  )
}

/**
 * The Instructions card: everything the writer is told, editable (Tyler,
 * 5 Nov 2026: "I should be able to edit these", then one card in place of
 * What it is, What the AI reads and the idea's instructions). It starts on
 * the app's own wording, built from the template's description, audience,
 * rules and reference videos; once typed in, the typed wording is sent as it
 * is, with the script's scenes where {{scenes}} stands. The answer's format
 * is added by the app after it and is not shown.
 */
function InstructionsEditor({
  templateId,
  videoId,
  open,
  fields,
  onChange,
}: {
  templateId: string
  videoId: string
  open: boolean
  fields: TemplateFields
  onChange: (patch: TemplateFieldsPatch, now?: boolean) => void
}) {
  const [read, setRead] = React.useState<{ templateId: string; scriptDefault: string; waiting: string[] } | null>(null)

  React.useEffect(() => {
    if (!open) return
    let active = true
    previewTemplatePrompt({ templateId, videoId })
      .then((answer) => {
        if (active) setRead({ templateId, ...answer })
      })
      .catch((error: unknown) => {
        if (active) showErrorToast(getTemplateErrorMessage(error))
      })
    return () => {
      active = false
    }
  }, [open, templateId, videoId])

  const defaults = read?.templateId === templateId ? read : null
  const own = fields.scriptPrompt
  const value = own ?? defaults?.scriptDefault ?? ""

  return (
    <div className="grid gap-2">
      <Label htmlFor={`template-${templateId}-instructions`} className="sr-only">
        Instructions
      </Label>
      <Textarea
        id={`template-${templateId}-instructions`}
        rows={12}
        maxLength={TEMPLATE_PROMPT_MAX}
        value={value}
        disabled={!defaults && own === null}
        className="font-mono text-xs"
        onChange={(event) => onChange({ scriptPrompt: event.target.value })}
      />
      {own !== null ? (
        <Button type="button" variant="outline" className="justify-self-start" onClick={() => onChange({ scriptPrompt: null }, true)}>
          <RotateCcwIcon />
          Use the app&apos;s wording
        </Button>
      ) : null}
      {defaults?.waiting.length ? (
        <p className="text-muted-foreground">Still being broken down, so not in it yet: {defaults.waiting.join(", ")}.</p>
      ) : null}
      <p className="text-muted-foreground">
        Everything the AI is told when it turns your script into scenes. Your script&apos;s scenes go where{" "}
        {SCENES_TOKEN} stands, and the app adds the answer&apos;s format after it.
      </p>
    </div>
  )
}
