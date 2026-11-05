import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { ArchiveIcon, CopyIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { FoldingMenu, MenuAction, MenuLine, MenuSection, useOpenSections } from "@/components/shared/folding-menu"
import { ImageUpload } from "@/components/shared/image-upload"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useProject, useSaveProject } from "@/components/viral/project-context"
import { SavingInput } from "@/components/viral/saving-fields"
import { getViralErrorMessage } from "@/lib/api/viral/viral"
import {
  archiveViralProjectsFn,
  deleteViralProjectsFn,
  duplicateViralProjectFn,
  loadViralDeleteSummary,
  saveViralProjectCoverFn,
  saveViralProjectTopicFn,
  type ViralDeleteSummary,
} from "@/lib/api/viral/viral-projects"
import { plural } from "@/lib/format/plural"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { showErrorToast } from "@/lib/toast/error-toast"
import { ANALYSIS_TOPIC_MAX } from "@/lib/viral/analysis"
import { formatCents, parseSpendLimit } from "@/lib/viral/project-spend"
import {
  VIRAL_DAY_CHOICES,
  VIRAL_PROJECT_NAME_MAX,
  VIRAL_VIDEO_LENGTHS,
  viralVideoLengthLabels,
  type ViralDays,
  type ViralVideoLength,
} from "@/lib/viral/viral"

type Section = "cover" | "name" | "topic" | "days" | "length" | "minViews" | "minScore" | "spend"

/**
 * The project's ⋮ at the top of its left panel, Travel's trip menu drawn for
 * a project (Tyler, 4 Nov 2026, picked Travel's trip page for Viral): a
 * folding row per setting, each saving itself, then a line, Duplicate,
 * Archive, and Delete project in red. The description isn't in it; it is
 * written in place under the panel's header.
 *
 * Posted within and Videos change what YouTube is asked for, so the next
 * search uses them; the minimums only hide what is already found.
 */
export function ProjectMenu() {
  const { screen, refresh } = useProject()
  const project = screen.project
  const save = useSaveProject()
  const navigate = useNavigate()
  const [open, setOpen] = React.useState(false)
  const [shown, toggle] = useOpenSections<Section>()
  const [deleting, setDeleting] = React.useState(false)
  const [summary, setSummary] = React.useState<ViralDeleteSummary | null>(null)
  const [run, busy] = useAsyncAction(getViralErrorMessage)
  const row = (section: Section) => ({ open: shown.has(section), onToggle: () => toggle(section) })

  async function saveTopic(topic: string) {
    try {
      await saveViralProjectTopicFn(project.id, topic)
      await refresh()
      return true
    } catch (error) {
      showErrorToast(getViralErrorMessage(error))
      return false
    }
  }

  async function saveCover(url: string | null) {
    try {
      await saveViralProjectCoverFn(project.id, url)
      await refresh()
    } catch (error) {
      showErrorToast(getViralErrorMessage(error))
    }
  }

  function saveWhole(label: string, text: string, max: number, key: "minViews" | "minScore") {
    const cleaned = text.trim().replace(/,/g, "")
    const number = cleaned ? Number(cleaned) : 0
    if (!Number.isInteger(number) || number < 0 || number > max) {
      showErrorToast(`${label} must be a whole number from 0 to ${max.toLocaleString()}.`)
      return Promise.resolve(false)
    }
    return save({ [key]: number })
  }

  function saveSpend(text: string) {
    let cents: number | null
    try {
      cents = parseSpendLimit(text)
    } catch (error) {
      showErrorToast((error as Error).message)
      return Promise.resolve(false)
    }
    return save({ spendLimitCents: cents })
  }

  async function openDelete() {
    setOpen(false)
    setSummary(null)
    setDeleting(true)
    try {
      setSummary(await loadViralDeleteSummary([project.id]))
    } catch {
      // The window still works without the counts.
    }
  }

  return (
    <>
      <FoldingMenu label="Project settings" align="start" open={open} onOpenChange={setOpen} busy={busy}>
        {/* The banner behind the top of the left panel (Tyler, 4 Nov 2026: "there is no image for left panel top bg"). */}
        <MenuSection
          label="Cover photo"
          value={project.cover_chosen ? "Uploaded" : project.cover_url ? "Best video" : "None"}
          {...row("cover")}
        >
          <ImageUpload
            label="Cover photo"
            showLabel={false}
            value={project.cover_chosen ? (project.cover_url ?? "") : ""}
            aspect="video"
            fit="cover"
            emptyLabel="Upload a cover photo"
            onChange={(url) => void saveCover(url || null)}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            With none, the banner is the best video's thumbnail from the last search.
          </p>
        </MenuSection>
        <MenuSection label="Name" value={project.name} {...row("name")}>
          <Label htmlFor="viral-project-menu-name" className="sr-only">
            Name
          </Label>
          <SavingInput
            id="viral-project-menu-name"
            value={project.name}
            maxLength={VIRAL_PROJECT_NAME_MAX}
            onSave={(name) => {
              if (!name.trim()) {
                showErrorToast("Give the project a name.")
                return Promise.resolve(false)
              }
              return save({ name })
            }}
          />
        </MenuSection>
        <MenuSection label="Your topic" value={project.topic || "Not set"} {...row("topic")}>
          <Label htmlFor="viral-project-menu-topic" className="sr-only">
            Your topic
          </Label>
          <SavingInput
            id="viral-project-menu-topic"
            value={project.topic}
            maxLength={ANALYSIS_TOPIC_MAX}
            placeholder="A meal-prep course for busy dads"
            onSave={saveTopic}
          />
        </MenuSection>
        <MenuSection label="Posted within" value={`${project.days} days`} {...row("days")}>
          <Label htmlFor="viral-project-menu-days" className="sr-only">
            Posted within
          </Label>
          <Select value={String(project.days)} onValueChange={(value) => void save({ days: Number(value) as ViralDays })}>
            <SelectTrigger id="viral-project-menu-days" className="w-full">
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
        </MenuSection>
        <MenuSection label="Videos" value={viralVideoLengthLabels[project.video_length]} {...row("length")}>
          <Label htmlFor="viral-project-menu-length" className="sr-only">
            Videos
          </Label>
          <Select
            value={project.video_length}
            onValueChange={(value) => void save({ videoLength: value as ViralVideoLength })}
          >
            <SelectTrigger id="viral-project-menu-length" className="w-full">
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
          <p className="mt-2 text-xs text-muted-foreground">Both runs two YouTube searches per keyword.</p>
        </MenuSection>
        <MenuSection
          label="Minimum views"
          value={project.min_views ? project.min_views.toLocaleString() : "None"}
          {...row("minViews")}
        >
          <Label htmlFor="viral-project-menu-min-views" className="sr-only">
            Minimum views
          </Label>
          <SavingInput
            id="viral-project-menu-min-views"
            inputMode="numeric"
            placeholder="0"
            value={project.min_views ? String(project.min_views) : ""}
            onSave={(text) => saveWhole("Minimum views", text, 1_000_000_000, "minViews")}
          />
        </MenuSection>
        <MenuSection label="Minimum score" value={project.min_score ? String(project.min_score) : "None"} {...row("minScore")}>
          <Label htmlFor="viral-project-menu-min-score" className="sr-only">
            Minimum score
          </Label>
          <SavingInput
            id="viral-project-menu-min-score"
            inputMode="numeric"
            placeholder="0"
            value={project.min_score ? String(project.min_score) : ""}
            onSave={(text) => saveWhole("Minimum score", text, 100, "minScore")}
          />
          <p className="mt-2 text-xs text-muted-foreground">The daily check rings the bell for new videos at or above it.</p>
        </MenuSection>
        <MenuSection
          label="AI spend limit"
          value={project.spend_limit_cents === null ? "No limit" : formatCents(project.spend_limit_cents)}
          {...row("spend")}
        >
          <Label htmlFor="viral-project-menu-spend" className="sr-only">
            AI spend limit in dollars
          </Label>
          <SavingInput
            id="viral-project-menu-spend"
            inputMode="decimal"
            placeholder="No limit"
            value={project.spend_limit_cents === null ? "" : String(project.spend_limit_cents / 100)}
            onSave={saveSpend}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Analyse with AI, keyword ideas and the topic match stop before they would pass it. YouTube searches are free.
          </p>
        </MenuSection>
        <MenuLine />
        <MenuAction
          icon={<CopyIcon className="size-4" />}
          disabled={busy}
          onClick={() =>
            void run(async () => {
              setOpen(false)
              const copy = await duplicateViralProjectFn(project.id)
              toast.success(`Made "${copy.name}".`)
              await navigate({ to: "/admin/projects/$projectId", params: { projectId: copy.id } })
            })
          }
        >
          Duplicate
        </MenuAction>
        <MenuAction
          icon={<ArchiveIcon className="size-4" />}
          disabled={busy}
          onClick={() =>
            void run(async () => {
              setOpen(false)
              await archiveViralProjectsFn([project.id], !project.archived)
              await refresh()
              toast.success(project.archived ? `${project.name} is back.` : `${project.name} is archived.`)
            })
          }
        >
          {project.archived ? "Bring back" : "Archive"}
        </MenuAction>
        <MenuAction icon={<Trash2Icon className="size-4" />} destructive disabled={busy} onClick={() => void openDelete()}>
          Delete project
        </MenuAction>
      </FoldingMenu>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this project?"
        description={
          summary
            ? `Its keywords go for good, with ${summary.videos} found ${plural(summary.videos, "video")} and ${summary.vault_items} ${plural(summary.vault_items, "idea")} in its vault. Saved videos and creators followed in other projects stay.`
            : "Its keywords, found videos and vault go for good. Saved videos and creators followed in other projects stay."
        }
        confirmLabel="Delete project"
        loading={busy}
        onConfirm={() =>
          void run(async () => {
            await deleteViralProjectsFn([project.id])
            setDeleting(false)
            toast.success(`${project.name} is deleted.`)
            await navigate({ to: "/admin/projects" })
          })
        }
      />
    </>
  )
}
