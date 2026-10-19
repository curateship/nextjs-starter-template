import * as React from "react"
import { Loader2Icon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  KeywordChips,
  KeywordIdeas,
} from "@/components/video-viral/keyword-chips"
import { getViralErrorMessage } from "@/lib/api/video/viral"
import {
  createViralProjectFn,
  saveViralProjectSettingsFn,
  suggestViralKeywords,
  unhideViralChannelFn,
  type ViralFolderSummary,
} from "@/lib/api/video/viral-projects"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { NO_FOLDER } from "@/lib/video/project-folders"
import { parseSpendLimit } from "@/lib/video/project-spend"
import {
  unitsPerKeyword,
  VIRAL_DAY_CHOICES,
  VIRAL_DESCRIPTION_MAX,
  VIRAL_VIDEO_LENGTHS,
  viralVideoLengthLabels,
  type ViralDays,
  type ViralHiddenChannel,
  type ViralProjectItem,
  type ViralVideoLength,
} from "@/lib/video/viral"
import { creatorPlatformLabels } from "@/lib/video/creators"

/**
 * A new Viral project (name, description, keywords, folder), or an existing
 * project's settings (the same plus what YouTube is asked, the read-time
 * filters, the spend limit and the hidden channels). Keywords of an existing
 * project are changed on its left panel, because adding one searches it.
 */

type Draft = {
  name: string
  description: string
  keywords: string[]
  days: ViralDays
  length: ViralVideoLength
  minViews: string
  minScore: string
  /** Dollars as typed; empty is no limit. */
  spendLimit: string
}

function draftOf(project: ViralProjectItem | null): Draft {
  return {
    name: project?.name ?? "",
    description: project?.description ?? "",
    keywords: project?.keywords ?? [],
    days: project?.days ?? 30,
    length: project?.video_length ?? "shorts",
    minViews: project?.min_views ? String(project.min_views) : "",
    minScore: project?.min_score ? String(project.min_score) : "",
    spendLimit:
      project?.spend_limit_cents != null
        ? String(project.spend_limit_cents / 100)
        : "",
  }
}

/** A whole number from a box, or the sentence saying what is wrong with it. */
function readWhole(value: string, label: string, max: number): number {
  const cleaned = value.trim().replace(/,/g, "")
  if (!cleaned) return 0
  const number = Number(cleaned)
  if (!Number.isInteger(number) || number < 0 || number > max) {
    throw new Error(`${label} must be a whole number from 0 to ${max.toLocaleString()}.`)
  }
  return number
}

export function ViralProjectDialog({
  open,
  project,
  hidden = [],
  folderId,
  folders = [],
  onClose,
  onCreated,
  onSaved,
}: {
  open: boolean
  /** The project whose settings these are, or null when making a new one. */
  project: ViralProjectItem | null
  /** The project's hidden channels, which the settings can bring back. */
  hidden?: ViralHiddenChannel[]
  /** The folder a new project starts in: the one the list is showing. */
  folderId: string | null
  folders?: ViralFolderSummary[]
  onClose: () => void
  onCreated: (project: ViralProjectItem) => void
  /**
   * Handed the saved project and whether what YouTube is asked changed, so
   * the screen can offer to search again.
   */
  onSaved: (saved: ViralProjectItem, searchChanged: boolean) => void
}) {
  const [draft, setDraft] = React.useState(() => draftOf(project))
  const [saving, setSaving] = React.useState(false)
  const [invalid, setInvalid] = React.useState<keyof Draft | null>(null)
  const [newFolderId, setNewFolderId] = React.useState(folderId)
  const [ideas, setIdeas] = React.useState<string[]>([])
  const [ideasBusy, setIdeasBusy] = React.useState(false)
  const [shownHidden, setShownHidden] = React.useState(hidden)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Start from what is stored every time the window opens.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setDraft(draftOf(project))
      setInvalid(null)
      setNewFolderId(folderId)
      setIdeas([])
      setShownHidden(hidden)
    }
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(project))
  const set = (patch: Partial<Draft>) => {
    setDraft((was) => ({ ...was, ...patch }))
    setInvalid(null)
  }

  function refuse(field: keyof Draft, message: string) {
    setInvalid(field)
    showErrorToast(message)
    if (field === "name") inputRef.current?.focus()
  }

  async function suggest() {
    if (ideasBusy) return
    setIdeasBusy(true)
    dismissErrorToast()
    try {
      const answer = await suggestViralKeywords({
        description: draft.description,
        existing: draft.keywords,
        projectId: project?.id ?? null,
      })
      setIdeas(answer.ideas)
      if (!answer.ideas.length) toast.message("No new ideas came back. Try a fuller description.")
    } catch (error) {
      showErrorToast(getViralErrorMessage(error))
    } finally {
      setIdeasBusy(false)
    }
  }

  function toggleIdea(idea: string) {
    const has = draft.keywords.some((one) => one.toLowerCase() === idea.toLowerCase())
    set({
      keywords: has
        ? draft.keywords.filter((one) => one.toLowerCase() !== idea.toLowerCase())
        : [...draft.keywords, idea],
    })
  }

  async function handleSave() {
    if (!draft.name.trim()) return refuse("name", "A project needs a name.")
    setSaving(true)
    try {
      if (!project) {
        if (!draft.keywords.length) {
          refuse("keywords", "Add at least one keyword.")
          return
        }
        const created = await createViralProjectFn({
          name: draft.name,
          description: draft.description,
          keywords: draft.keywords,
          folderId: newFolderId,
        })
        dismissErrorToast()
        onCreated(created)
        onClose()
        return
      }
      if (!dirty) {
        onClose()
        return
      }
      let minViews: number
      let minScore: number
      let spendLimitCents: number | null
      try {
        minViews = readWhole(draft.minViews, "Minimum views", 1_000_000_000)
      } catch (error) {
        return refuse("minViews", (error as Error).message)
      }
      try {
        minScore = readWhole(draft.minScore, "Minimum score", 100)
      } catch (error) {
        return refuse("minScore", (error as Error).message)
      }
      try {
        spendLimitCents = parseSpendLimit(draft.spendLimit)
      } catch (error) {
        return refuse("spendLimit", (error as Error).message)
      }
      const saved = await saveViralProjectSettingsFn({
        projectId: project.id,
        name: draft.name,
        description: draft.description,
        days: draft.days,
        minViews,
        minScore,
        videoLength: draft.length,
        spendLimitCents,
      })
      dismissErrorToast()
      toast.success("Project settings saved.")
      onSaved(
        saved,
        draft.days !== project.days || draft.length !== project.video_length
      )
      onClose()
    } catch (error) {
      showErrorToast(getViralErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function bringBack(channel: ViralHiddenChannel) {
    if (!project) return
    try {
      await unhideViralChannelFn(project.id, channel)
      setShownHidden((was) =>
        was.filter(
          (one) => !(one.platform === channel.platform && one.channelId === channel.channelId)
        )
      )
      onSaved(project, false)
      toast.success(`${channel.channelName || "That channel"} shows again.`)
    } catch (error) {
      showErrorToast(getViralErrorMessage(error))
    }
  }

  return (
    <FormDialog open={open} dirty={dirty} busy={saving} onClose={onClose}>
      {(requestClose) => (
        <DialogContent
          variant="admin"
          className="sm:max-w-xl"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            inputRef.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>{project ? "Project settings" : "New project"}</DialogTitle>
            <DialogDescription>
              {project
                ? "What the niche is, what YouTube is asked for, which videos show, and the most this project may spend on AI."
                : "One niche: say what it is about and the words people search for it. Nothing is searched until you press Search."}
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
                  <CardTitle>The niche</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="viral-project-name">Project name</Label>
                    <Input
                      id="viral-project-name"
                      ref={inputRef}
                      value={draft.name}
                      maxLength={200}
                      aria-invalid={invalid === "name" || undefined}
                      placeholder="Gym tips"
                      onChange={(event) => set({ name: event.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <FieldLabel
                      htmlFor="viral-project-description"
                      hint="A sentence or two about the niche. The AI reads it to suggest keywords and to judge how well each video fits."
                    >
                      Description
                    </FieldLabel>
                    <Textarea
                      id="viral-project-description"
                      rows={1}
                      maxLength={VIRAL_DESCRIPTION_MAX}
                      value={draft.description}
                      placeholder="Short workout tips for busy people over 30"
                      onChange={(event) => set({ description: event.target.value })}
                    />
                  </div>
                </CardContent>
              </Card>

              {project ? null : (
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Keywords</CardTitle>
                    <CardDescription>
                      Each keyword is one YouTube search of{" "}
                      {unitsPerKeyword(draft.length)} units, out of 10,000 free
                      a day.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="viral-project-keywords">Keywords</Label>
                      <KeywordChips
                        id="viral-project-keywords"
                        value={draft.keywords}
                        onChange={(keywords) => set({ keywords })}
                        invalid={invalid === "keywords"}
                      />
                    </div>
                    <div className="grid gap-2">
                      <div>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={ideasBusy}
                          onClick={() => void suggest()}
                        >
                          {ideasBusy ? (
                            <Loader2Icon className="animate-spin" />
                          ) : (
                            <SparklesIcon />
                          )}
                          Suggest keywords
                        </Button>
                      </div>
                      <KeywordIdeas
                        ideas={ideas}
                        picked={draft.keywords}
                        onToggle={toggleIdea}
                      />
                    </div>
                  </CardContent>
                </Card>
              )}

              {!project && folders.length ? (
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Folder</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="viral-project-folder">Put it in</Label>
                      <Select
                        value={newFolderId ?? NO_FOLDER}
                        onValueChange={(value) =>
                          setNewFolderId(value === NO_FOLDER ? null : value)
                        }
                      >
                        <SelectTrigger id="viral-project-folder" className="sm:w-60">
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
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>What YouTube is asked for</CardTitle>
                    <CardDescription>
                      Changing these needs a new search of every keyword.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="viral-project-days">Posted within</Label>
                      <Select
                        value={String(draft.days)}
                        onValueChange={(value) => set({ days: Number(value) as ViralDays })}
                      >
                        <SelectTrigger id="viral-project-days">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {VIRAL_DAY_CHOICES.map((days) => (
                            <SelectItem key={days} value={String(days)}>
                              The last {days} days
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <FieldLabel
                        htmlFor="viral-project-length"
                        hint="Both runs two searches per keyword, so it costs twice as much."
                      >
                        Videos
                      </FieldLabel>
                      <Select
                        value={draft.length}
                        onValueChange={(value) => set({ length: value as ViralVideoLength })}
                      >
                        <SelectTrigger id="viral-project-length">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {VIRAL_VIDEO_LENGTHS.map((length) => (
                            <SelectItem key={length} value={length}>
                              {viralVideoLengthLabels[length]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              {project ? (
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Which videos show</CardTitle>
                    <CardDescription>
                      Applied to what is already found, so changing them costs
                      nothing.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="viral-project-min-views">Minimum views</Label>
                      <Input
                        id="viral-project-min-views"
                        inputMode="numeric"
                        value={draft.minViews}
                        placeholder="0"
                        aria-invalid={invalid === "minViews" || undefined}
                        onChange={(event) => set({ minViews: event.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="viral-project-min-score">Minimum score</Label>
                      <Input
                        id="viral-project-min-score"
                        inputMode="numeric"
                        value={draft.minScore}
                        placeholder="0"
                        aria-invalid={invalid === "minScore" || undefined}
                        onChange={(event) => set({ minScore: event.target.value })}
                      />
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              {project ? (
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Spending</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="grid gap-2">
                      <FieldLabel
                        htmlFor="viral-project-spend-limit"
                        hint="Keyword ideas, the topic match and breakdowns pressed in this project stop and say so before they would take it past this. YouTube searches are free and are not counted. Leave it empty for no limit."
                      >
                        AI spend limit in dollars
                      </FieldLabel>
                      <Input
                        id="viral-project-spend-limit"
                        inputMode="decimal"
                        className="sm:max-w-40"
                        value={draft.spendLimit}
                        placeholder="No limit"
                        aria-invalid={invalid === "spendLimit" || undefined}
                        onChange={(event) => set({ spendLimit: event.target.value })}
                      />
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              {project ? (
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Hidden channels</CardTitle>
                    <CardDescription>
                      Their videos and their creator entry are left out of this
                      project only.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-2">
                    {shownHidden.length ? (
                      shownHidden.map((channel) => (
                        <div
                          key={`${channel.platform}:${channel.channelId}`}
                          className="flex items-center justify-between gap-3"
                        >
                          <span className="min-w-0 truncate text-sm">
                            {channel.channelName || channel.channelId}
                            <span className="text-muted-foreground">
                              {" "}
                              · {creatorPlatformLabels[channel.platform]}
                            </span>
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void bringBack(channel)}
                          >
                            Show again
                          </Button>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Nothing is hidden.
                      </p>
                    )}
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
