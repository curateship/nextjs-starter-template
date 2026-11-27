import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { ArchiveIcon, ArchiveRestoreIcon, CopyIcon, PauseIcon, PinIcon, PinOffIcon, PlayIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react"

import { ActionRow } from "@/components/crm/crm-record-menu"
import { CoverRow, LockRow } from "@/components/shared/notes/page-rows"
import { PickGroup, PickMenuRow, PickRow } from "@/components/shared/notes/pick-rows"
import { TabbedMenu } from "@/components/shared/notes/tabbed-menu"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { PickPlaceRow } from "@/components/viral/place-select"
import { SocialIcon } from "@/components/viral/social-icon"
import { SavingInput, SavingTextarea } from "@/components/viral/saving-fields"
import { getViralErrorMessage } from "@/lib/api/viral/viral"
import {
  archiveViralProjectsFn,
  deleteViralProjectsFn,
  duplicateViralProjectFn,
  loadViralDeleteSummary,
  changeViralSocial,
  lockViralProjectNotesFn,
  pinViralProjectFn,
  saveViralProjectCoverFn,
  saveViralProjectSettingsFn,
  saveViralProjectTopicFn,
  type ViralDeleteSummary,
} from "@/lib/api/viral/viral-projects"
import { plural } from "@/lib/format/plural"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { showErrorToast } from "@/lib/toast/error-toast"
import { ANALYSIS_TOPIC_MAX } from "@/lib/viral/analysis"
import { countryOptions, languageOptions, type ViralCountryCode, type ViralLanguageCode } from "@/lib/viral/places"
import { formatCents, parseSpendLimit } from "@/lib/viral/project-spend"
import { SOCIAL_NAMES, SOCIALS, type Social } from "@/lib/viral/socials"
import {
  VIRAL_DAY_CHOICES,
  VIRAL_DESCRIPTION_MAX,
  VIRAL_PROJECT_NAME_MAX,
  VIRAL_VIDEO_LENGTHS,
  viralDayLabels,
  viralVideoLengthLabels,
  type ViralDays,
  type ViralProjectItem,
  type ViralVideoLength,
} from "@/lib/viral/viral"

type SettingsPatch = Partial<{
  name: string
  description: string
  days: ViralProjectItem["days"]
  regionCode: ViralCountryCode | null
  relevanceLanguage: ViralLanguageCode | null
  minViews: number
  minScore: number
  videoLength: ViralProjectItem["video_length"]
  spendLimitCents: number | null
}>

/**
 * Saves one or more of a project's settings, leaving the rest as stored, and
 * reads the project again. Resolves false when the save was refused, so a
 * self-saving field keeps what was typed (UI standard, "Settings").
 */
function useProjectSave(project: ViralProjectItem, refresh: () => Promise<unknown>) {
  return React.useCallback(
    async (patch: SettingsPatch): Promise<boolean> => {
      try {
        await saveViralProjectSettingsFn({
          projectId: project.id,
          name: project.name,
          description: project.description,
          days: project.days,
          minViews: project.min_views,
          minScore: project.min_score,
          videoLength: project.video_length,
          spendLimitCents: project.spend_limit_cents,
          ...patch,
        })
        await refresh()
        return true
      } catch (error) {
        showErrorToast(getViralErrorMessage(error))
        return false
      }
    },
    [project, refresh]
  )
}

/**
 * A project's ⋮: the Admin 3 panel design's tabbed menu of grouped rows
 * (`.agents/skills/Design/admin-3-panel-design/SKILL.md`, "Tabbed ⋮ menu"),
 * in place of the folding rows it had. It sits on the project's own
 * dashboard, at the top of its left panel, and on the Viral dashboard's
 * project preview. Every row saves itself.
 *
 * - **Page** (on the project's own page only): the shell's Cover photo row;
 *   Lock blocks is the tab's footer, as Promo's Lock description is.
 * - **Project:** Name and Your topic (what you make, which every script is
 *   written for).
 * - **Search** starts with Niche (the description: the kind of videos to
 *   find, which the AI suggests keywords from and scores each video against).
 * - **Search:** Posted within, Country, Language and Videos change what
 *   YouTube is asked for, so the next search uses them. Country and
 *   Language open a list you can type into, Anywhere first (Tyler, 6 Nov
 *   2026: "Every country + language"). The minimums only hide what is
 *   already found.
 * - **AI:** the spend limit.
 * - Then Pin, Duplicate, Archive, and Delete project in red under a line.
 * - **Socials** (on the project's own page only), as Promo's Networks tab:
 *   each social the project uses with Pause (or Check daily again) and Take
 *   off, which the server refuses while it still holds keywords or creators;
 *   then the socials it doesn't use, each a row to add it.
 */
export function ProjectSettingsMenu({
  project,
  refresh,
  onGone,
  page = false,
  research = false,
  align = "start",
}: {
  project: ViralProjectItem
  /** Reads the project again after a change. */
  refresh: () => Promise<unknown>
  /** The project was deleted: where to go. */
  onGone: () => Promise<unknown> | void
  /** On the project's own page: the Page group, Lock blocks and the Socials tab. */
  page?: boolean
  /**
   * Inside a Content project: Research's own settings alone, the Search and AI
   * groups and the Socials tab. The name, cover, topic and the project's
   * actions belong to the whole project and are on its page's ⋮
   * (`workspace/docs/content-app.md`, "A project's own page").
   */
  research?: boolean
  align?: "start" | "end"
}) {
  const save = useProjectSave(project, refresh)
  const navigate = useNavigate()
  const [open, setOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [summary, setSummary] = React.useState<ViralDeleteSummary | null>(null)
  const [run, busy] = useAsyncAction(getViralErrorMessage)
  // Every country and language, named by the browser once per menu.
  const countries = React.useMemo(() => countryOptions(), [])
  const languages = React.useMemo(() => languageOptions(), [])

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

  const action = (work: () => Promise<unknown>) => () =>
    void run(async () => {
      setOpen(false)
      await work()
    })

  return (
    <>
      <TabbedMenu
        label={research ? "Research settings" : "Project settings"}
        align={align}
        width="22.7rem"
        open={open}
        onOpenChange={setOpen}
        tabs={[
          {
            value: "general",
            label: "General",
            content: (
              <div className="grid gap-3 p-3">
                {page && !research ? (
                  <PickGroup title="Page">
                    {/* The banner behind the top of the left panel (Tyler, 4 Nov 2026: "there is no image for left panel top bg"). With none, it is the best video's thumbnail from the last search. */}
                    <CoverRow
                      cover={{
                        url: project.cover_chosen ? project.cover_url : null,
                        images: project.cover_images,
                        busy,
                        set: ({ url, images }) =>
                          void run(async () => {
                            await saveViralProjectCoverFn(project.id, url, images)
                            await refresh()
                          }),
                      }}
                    />
                  </PickGroup>
                ) : null}
                {research ? null : (
                <PickGroup title="Project">
                  <PickRow label="Name" value={project.name}>
                    <Label htmlFor={`project-menu-name-${project.id}`}>Name</Label>
                    <SavingInput
                      id={`project-menu-name-${project.id}`}
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
                  </PickRow>
                  <PickRow label="Your topic" value={project.topic || "Not set"} empty={!project.topic}>
                    <Label htmlFor={`project-menu-topic-${project.id}`}>Your topic</Label>
                    <SavingInput
                      id={`project-menu-topic-${project.id}`}
                      value={project.topic}
                      maxLength={ANALYSIS_TOPIC_MAX}
                      placeholder="A meal-prep course for busy dads"
                      onSave={saveTopic}
                    />
                    <p className="text-xs text-muted-foreground">
                      What you make or sell. Analyse with AI turns each winning video from the niche into a script
                      about this.
                    </p>
                  </PickRow>
                </PickGroup>
                )}
                <PickGroup title="Search">
                  {/* The description, first under Search on every ⋮ and named for what it does (Tyler, 21 Nov 2026:
                      "The discription should be in the 3 dots dropdown here and it needs better clarification",
                      then "because it belongs to search isnt it?"). */}
                  <PickRow label="Niche" value={project.description || "Not set"} empty={!project.description}>
                    <Label htmlFor={`project-menu-description-${project.id}`}>Niche</Label>
                    <SavingTextarea
                      id={`project-menu-description-${project.id}`}
                      rows={4}
                      value={project.description}
                      maxLength={VIRAL_DESCRIPTION_MAX}
                      placeholder="Cheap, high-protein lunches made on Sunday for the week"
                      onSave={(description) => save({ description })}
                    />
                    <p className="text-xs text-muted-foreground">
                      The kind of videos to find. The AI suggests keywords from it and scores how well each video
                      fits it, in the Fits column.
                    </p>
                  </PickRow>
                  <PickMenuRow
                    label="Posted within"
                    value={viralDayLabels[project.days]}
                    selected={String(project.days)}
                    options={VIRAL_DAY_CHOICES.map((days) => ({
                      value: String(days),
                      label: days === 365 ? "The last year" : `The last ${viralDayLabels[days]}`,
                    }))}
                    onPick={(value) => void save({ days: Number(value) as ViralDays })}
                  />
                  <PickPlaceRow
                    label="Country"
                    value={project.region_code}
                    options={countries}
                    searchLabel="Search countries"
                    noMatch="No country matches."
                    onPick={(code) => void save({ regionCode: code as ViralCountryCode | null })}
                  />
                  <PickPlaceRow
                    label="Language"
                    value={project.relevance_language}
                    options={languages}
                    searchLabel="Search languages"
                    noMatch="No language matches."
                    onPick={(code) => void save({ relevanceLanguage: code as ViralLanguageCode | null })}
                  />
                  <PickMenuRow
                    label="Videos"
                    value={viralVideoLengthLabels[project.video_length]}
                    selected={project.video_length}
                    options={VIRAL_VIDEO_LENGTHS.map((length) => ({ value: length, label: viralVideoLengthLabels[length] }))}
                    onPick={(value) => void save({ videoLength: value as ViralVideoLength })}
                  />
                  <PickRow
                    label="Minimum views"
                    value={project.min_views ? project.min_views.toLocaleString() : "None"}
                    empty={!project.min_views}
                  >
                    <Label htmlFor={`project-menu-min-views-${project.id}`}>Minimum views</Label>
                    <SavingInput
                      id={`project-menu-min-views-${project.id}`}
                      inputMode="numeric"
                      placeholder="0"
                      value={project.min_views ? String(project.min_views) : ""}
                      onSave={(text) => saveWhole("Minimum views", text, 1_000_000_000, "minViews")}
                    />
                  </PickRow>
                  <PickRow
                    label="Minimum score"
                    value={project.min_score ? String(project.min_score) : "None"}
                    empty={!project.min_score}
                  >
                    <Label htmlFor={`project-menu-min-score-${project.id}`}>Minimum score</Label>
                    <SavingInput
                      id={`project-menu-min-score-${project.id}`}
                      inputMode="numeric"
                      placeholder="0"
                      value={project.min_score ? String(project.min_score) : ""}
                      onSave={(text) => saveWhole("Minimum score", text, 100, "minScore")}
                    />
                    <p className="text-xs text-muted-foreground">The daily check rings the bell for new videos at or above it.</p>
                  </PickRow>
                </PickGroup>
                <PickGroup title="AI">
                  <PickRow
                    label="Spend limit"
                    value={project.spend_limit_cents === null ? "No limit" : formatCents(project.spend_limit_cents)}
                    empty={project.spend_limit_cents === null}
                  >
                    <Label htmlFor={`project-menu-spend-${project.id}`}>AI spend limit in dollars</Label>
                    <SavingInput
                      id={`project-menu-spend-${project.id}`}
                      inputMode="decimal"
                      placeholder="No limit"
                      value={project.spend_limit_cents === null ? "" : String(project.spend_limit_cents / 100)}
                      onSave={saveSpend}
                    />
                    <p className="text-xs text-muted-foreground">
                      Analyse with AI, keyword ideas and the topic match stop before they would pass it. YouTube searches are free.
                    </p>
                  </PickRow>
                </PickGroup>
                {research ? null : (
                <div className="grid">
                  <ActionRow
                    icon={project.pinned ? <PinOffIcon className="size-4" /> : <PinIcon className="size-4" />}
                    disabled={busy}
                    onClick={action(async () => {
                      await pinViralProjectFn(project.id, !project.pinned)
                      await refresh()
                    })}
                  >
                    {project.pinned ? "Unpin" : "Pin to the top"}
                  </ActionRow>
                  <ActionRow
                    icon={<CopyIcon className="size-4" />}
                    disabled={busy}
                    onClick={action(async () => {
                      const copy = await duplicateViralProjectFn(project.id)
                      await navigate({ to: "/admin/projects/$projectId/research", params: { projectId: copy.id } })
                    })}
                  >
                    Duplicate
                  </ActionRow>
                  <ActionRow
                    icon={project.archived ? <ArchiveRestoreIcon className="size-4" /> : <ArchiveIcon className="size-4" />}
                    disabled={busy}
                    onClick={action(async () => {
                      await archiveViralProjectsFn([project.id], !project.archived)
                      await refresh()
                    })}
                  >
                    {project.archived ? "Bring back" : "Archive"}
                  </ActionRow>
                  <div aria-hidden className="-mx-3 my-1.5 border-t" />
                  <ActionRow destructive icon={<Trash2Icon className="size-4" />} disabled={busy} onClick={() => void openDelete()}>
                    Delete project
                  </ActionRow>
                </div>
                )}
              </div>
            ),
            footer: page && !research ? (
              <LockRow
                locked={project.notes_locked}
                busy={busy}
                onLock={(locked) =>
                  void run(async () => {
                    await lockViralProjectNotesFn(project.id, locked)
                    await refresh()
                  })
                }
              />
            ) : undefined,
          },
          ...(page || research
            ? [
                {
                  // Promo's Networks tab, for socials: each one the project uses with Pause and Take off,
                  // then the ones it doesn't, each a row to add it.
                  value: "socials",
                  label: "Socials",
                  content: <SocialsTab project={project} refresh={refresh} />,
                },
              ]
            : []),
        ]}
      />
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
            await onGone()
          })
        }
      />
    </>
  )
}

/** The Socials tab: Promo's Networks tab, drawn as the shell's grouped rows. */
function SocialsTab({ project, refresh }: { project: ViralProjectItem; refresh: () => Promise<unknown> }) {
  const [busy, setBusy] = React.useState(false)
  const missing = SOCIALS.filter((social) => !project.socials.includes(social))

  async function change(social: Social, how: "add" | "remove" | "pause" | "resume") {
    setBusy(true)
    try {
      await changeViralSocial(project.id, social, how)
      await refresh()
    } catch (error) {
      showErrorToast(getViralErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-3 p-3">
      <PickGroup title="In this project">
        {project.socials.length ? (
          project.socials.map((social) => {
            const paused = project.paused_socials.includes(social)
            return (
              <div key={social} className="flex min-h-11 items-center gap-2 px-3 text-sm">
                <SocialIcon social={social} />
                <span className="min-w-0 flex-1 truncate">{SOCIAL_NAMES[social]}</span>
                {paused ? <span className="text-xs text-muted-foreground">Paused</span> : null}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={busy}
                      aria-label={paused ? `Check ${SOCIAL_NAMES[social]} daily again` : `Pause ${SOCIAL_NAMES[social]}'s daily check here`}
                      onClick={() => void change(social, paused ? "resume" : "pause")}
                    >
                      {paused ? <PlayIcon /> : <PauseIcon />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{paused ? "Check daily again" : "Pause the daily check here"}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={busy}
                      aria-label={`Take ${SOCIAL_NAMES[social]} off this project`}
                      onClick={() => void change(social, "remove")}
                    >
                      <XIcon />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Take off this project</TooltipContent>
                </Tooltip>
              </div>
            )
          })
        ) : (
          <p className="px-3 py-3 text-sm text-muted-foreground">This project uses no social yet.</p>
        )}
      </PickGroup>
      {missing.length ? (
        <PickGroup title="Add a social">
          {missing.map((social) => (
            <button
              key={social}
              type="button"
              disabled={busy}
              onClick={() => void change(social, "add")}
              className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm enabled:hover:bg-muted"
            >
              <SocialIcon social={social} />
              <span className="min-w-0 flex-1 truncate">{SOCIAL_NAMES[social]}</span>
              <PlusIcon className="size-4 text-muted-foreground" aria-hidden />
            </button>
          ))}
        </PickGroup>
      ) : null}
    </div>
  )
}
