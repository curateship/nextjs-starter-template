import * as React from "react"
import { ExternalLinkIcon, Loader2Icon, SettingsIcon, Trash2Icon, Volume2Icon } from "lucide-react"

import {
  InspectorCard,
  InspectorCollapseAllButton,
  InspectorCollapseAllProvider,
  useInspectorCollapseAll,
} from "@/components/shared/inspector-card"
import { SettingsSwitchRow } from "@/components/settings/settings-switch-row"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { ImageUpload } from "@/components/shared/image-upload"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { makeAudio, removeAudio } from "@/lib/api/courses/admin"
import { chapterBodyText } from "@/lib/courses/chapter-body"
import {
  COURSE_ACCESS,
  COURSE_ACCESS_LABELS,
  type CourseAccess,
} from "@/lib/courses/course-access"
import { getCourseErrorMessage } from "@/lib/courses/course-errors"
import { slugProblem } from "@/lib/courses/course-slugs"
import type { AdminChapter, AdminCourse, PlanChoice } from "@/lib/courses/course-types"
import { useSiteAddress } from "@/lib/hooks/use-site-address"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/** What one character of ElevenLabs reading costs, from `lib/ai/ai-models.ts`. */
const DOLLARS_PER_CHARACTER = 0.00015

type Saver<Patch> = (patch: Patch) => Promise<boolean>

/**
 * A text box that saves itself: 700ms after typing stops, or straight away
 * when the box is left or Enter is pressed. A refused save keeps what was
 * typed and marks the box, and the toast says why.
 */
function AutoSaveText({
  id,
  label,
  hint,
  value,
  multiline,
  maxLength,
  placeholder,
  check,
  onSave,
}: {
  id: string
  label: string
  hint?: string
  value: string
  multiline?: boolean
  maxLength: number
  placeholder?: string
  /** A problem with the text in words, or null, checked before sending. */
  check?: (text: string) => string | null
  onSave: (text: string) => Promise<boolean>
}) {
  const [text, setText] = React.useState(value)
  const [invalid, setInvalid] = React.useState(false)
  const sent = React.useRef(value)
  const [lastValue, setLastValue] = React.useState(value)
  // A save from somewhere else (the server tidying the text) replaces the box.
  if (value !== lastValue) {
    setLastValue(value)
    setText(value)
  }

  const save = React.useCallback(
    async (next: string) => {
      if (next === sent.current || next === value) return
      const problem = check?.(next) ?? null
      setInvalid(Boolean(problem))
      if (problem) {
        showErrorToast(problem)
        return
      }
      sent.current = next
      const ok = await onSave(next)
      if (!ok) {
        sent.current = ""
        setInvalid(true)
      }
    },
    [check, onSave, value]
  )

  React.useEffect(() => {
    if (text === sent.current || text === value) return
    const timer = setTimeout(() => void save(text), 700)
    return () => clearTimeout(timer)
  }, [text, value, save])

  const shared = {
    id,
    value: text,
    maxLength,
    placeholder,
    "aria-invalid": invalid || undefined,
    onChange: (event: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => {
      setText(event.target.value)
      setInvalid(false)
    },
    onBlur: () => void save(text),
  }

  return (
    <div className="grid gap-2">
      <FieldLabel htmlFor={id} hint={hint}>
        {label}
      </FieldLabel>
      {multiline ? (
        <Textarea {...shared} />
      ) : (
        <Input
          {...shared}
          onKeyDown={(event) => {
            if (event.key === "Enter") void save(text)
          }}
        />
      )}
    </div>
  )
}

/** A `datetime-local` value for a date, in the browser's own time zone. */
function localDateTime(date: Date | null): string {
  if (!date) return ""
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return shifted.toISOString().slice(0, 16)
}

/**
 * The editor's right panel: the open chapter's own settings, then the
 * course's. Everything saves itself, like every other options panel in the
 * app; only deleting asks first.
 */
export function CourseInspector({
  course,
  chapter,
  plans,
  voiceReady,
  onSaveCourse,
  onSaveChapter,
  onChapterChanged,
  onDeleteChapter,
}: {
  course: AdminCourse
  chapter: AdminChapter | null
  plans: PlanChoice[]
  voiceReady: boolean
  onSaveCourse: Saver<Partial<Omit<AdminCourse, "id">>>
  onSaveChapter: Saver<{
    slug?: string
    status?: AdminChapter["status"]
    isPreview?: boolean
    opensAfterDays?: number | null
    publishAt?: Date | null
  }>
  /** A change the server already made, such as new audio. */
  onChapterChanged: (chapter: AdminChapter) => void
  onDeleteChapter: (chapter: AdminChapter) => Promise<void>
}) {
  const siteAddress = useSiteAddress()
  const collapseAll = useInspectorCollapseAll()
  const [deleting, setDeleting] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [audioBusy, setAudioBusy] = React.useState(false)
  const paidPlans = plans.filter((plan) => plan.paid)

  const characters = chapter
    ? `${chapter.title}. ${chapterBodyText(chapter.body)}`.replace(/\s+/g, " ").trim().length
    : 0
  const audioCost = (characters * DOLLARS_PER_CHARACTER).toFixed(2)

  async function audio(make: boolean) {
    if (!chapter) return
    if (make && !voiceReady) {
      showErrorToast("Add an ElevenLabs key in Settings → AI first.")
      return
    }
    setAudioBusy(true)
    dismissErrorToast()
    try {
      onChapterChanged(make ? await makeAudio(chapter.id) : await removeAudio(chapter.id))
    } catch (error) {
      showErrorToast(getCourseErrorMessage(error))
    } finally {
      setAudioBusy(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-card">
      <DashboardCardTitleHeader
        icon={<SettingsIcon className="size-4" />}
        title="Settings"
        meta={chapter ? chapter.title : course.title}
        action={
          <InspectorCollapseAllButton
            nextOpen={collapseAll.nextOpen}
            onPress={() => collapseAll.setAll(collapseAll.nextOpen)}
          />
        }
      />
      <ScrollArea className="min-h-0 flex-1">
        <InspectorCollapseAllProvider signal={collapseAll.signal}>
          <div className="grid gap-4 p-4 sm:p-5">
            {chapter ? (
              <InspectorCard
                key={chapter.id}
                storageId="course-chapter"
                title="This chapter"
                description="Its address, whether readers can see it, and when it opens."
              >
                <div className="grid gap-4">
                  <SettingsSwitchRow
                    id="chapter-published"
                    checked={chapter.status === "published"}
                    onCheckedChange={(on) =>
                      void onSaveChapter({ status: on ? "published" : "draft" })
                    }
                    label="Published"
                    hint="A draft chapter is only seen by admins."
                  />
                  <SettingsSwitchRow
                    id="chapter-preview"
                    checked={chapter.isPreview}
                    onCheckedChange={(on) => void onSaveChapter({ isPreview: on })}
                    label="Free preview"
                    hint="Anyone can read this chapter, even when the course is for members or paying members."
                  />
                  <AutoSaveText
                    key={`slug-${chapter.id}`}
                    id="chapter-slug"
                    label="Address"
                    hint={`/courses/${course.slug}/${chapter.slug}`}
                    value={chapter.slug}
                    maxLength={160}
                    check={(text) => slugProblem(text.trim(), "chapter")}
                    onSave={(slug) => onSaveChapter({ slug: slug.trim() })}
                  />
                  <AutoSaveText
                    key={`days-${chapter.id}`}
                    id="chapter-opens-after"
                    label="Opens after this many days"
                    hint="Counted from the day each member first opens the course. Leave empty to open straight away."
                    value={chapter.opensAfterDays ? String(chapter.opensAfterDays) : ""}
                    maxLength={3}
                    placeholder="Straight away"
                    check={(text) =>
                      !text.trim() ||
                      (/^\d+$/.test(text.trim()) && Number(text) >= 1 && Number(text) <= 365)
                        ? null
                        : "Use a whole number of days from 1 to 365, or leave it empty."
                    }
                    onSave={(text) =>
                      onSaveChapter({ opensAfterDays: text.trim() ? Number(text) : null })
                    }
                  />
                  <PublishAtField
                    key={`at-${chapter.id}`}
                    value={chapter.publishAt}
                    onSave={(publishAt) => onSaveChapter({ publishAt })}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                      <a
                        href={siteAddress(
                          `/courses/${encodeURIComponent(course.slug)}/${encodeURIComponent(chapter.slug)}`
                        )}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLinkIcon className="size-4" />
                        Open this chapter
                      </a>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => setConfirmDelete(true)}
                    >
                      <Trash2Icon className="size-4" />
                      Delete chapter
                    </Button>
                  </div>
                </div>
              </InspectorCard>
            ) : null}

            {chapter ? (
              <InspectorCard
                key={`audio-${chapter.id}`}
                storageId="course-chapter-audio"
                title="Read aloud"
                description="A play button above the chapter that reads it in an AI voice, made with your ElevenLabs key."
              >
                <div className="grid gap-3">
                  {chapter.audioUrl ? (
                    <audio src={chapter.audioUrl} controls preload="none" className="w-full" />
                  ) : null}
                  {chapter.audioUrl && !chapter.audioCurrent ? (
                    <p className="text-sm text-destructive">
                      The words changed after this audio was made, so readers do not see it
                      until it is made again.
                    </p>
                  ) : null}
                  <p className="text-sm text-muted-foreground">
                    This chapter is {characters.toLocaleString("en-US")} characters, so making
                    the audio costs about ${audioCost}.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" onClick={() => void audio(true)} disabled={audioBusy}>
                      {audioBusy ? (
                        <Loader2Icon className="size-4 animate-spin" />
                      ) : (
                        <Volume2Icon className="size-4" />
                      )}
                      {chapter.audioUrl ? "Make audio again" : "Make audio"}
                    </Button>
                    {chapter.audioUrl ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void audio(false)}
                        disabled={audioBusy}
                      >
                        Take audio off
                      </Button>
                    ) : null}
                  </div>
                </div>
              </InspectorCard>
            ) : null}

            <InspectorCard
              storageId="course-settings"
              title="This course"
              description="What the course is called, where it answers, and its card on /courses."
            >
              <div className="grid gap-4">
                <SettingsSwitchRow
                  id="course-published"
                  checked={course.status === "published"}
                  onCheckedChange={(on) => void onSaveCourse({ status: on ? "published" : "draft" })}
                  label="Published"
                  hint="A draft course is only seen by admins. Each chapter also needs its own Published switch on."
                />
                <AutoSaveText
                  id="course-title"
                  label="Name"
                  value={course.title}
                  maxLength={200}
                  check={(text) => (text.trim() ? null : "A course needs a name.")}
                  onSave={(title) => onSaveCourse({ title })}
                />
                <AutoSaveText
                  id="course-slug"
                  label="Address"
                  hint={`/courses/${course.slug}`}
                  value={course.slug}
                  maxLength={160}
                  check={(text) => slugProblem(text.trim(), "course")}
                  onSave={(slug) => onSaveCourse({ slug: slug.trim() })}
                />
                <AutoSaveText
                  id="course-description"
                  label="What it covers"
                  hint="Shown on the course's card and its intro page."
                  value={course.description}
                  multiline
                  maxLength={600}
                  onSave={(description) => onSaveCourse({ description })}
                />
                <ImageUpload
                  label="Picture"
                  value={course.image}
                  onChange={(image) => void onSaveCourse({ image })}
                  emptyLabel="Add a picture"
                />
              </div>
            </InspectorCard>

            <InspectorCard
              storageId="course-access"
              title="Who can read it"
              description="Free preview chapters are open to anyone whatever this says."
            >
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <FieldLabel htmlFor="course-access">Readers</FieldLabel>
                  <Select
                    value={course.access}
                    onValueChange={(access) => void onSaveCourse({ access: access as CourseAccess })}
                  >
                    <SelectTrigger id="course-access" className="w-fit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COURSE_ACCESS.map((access) => (
                        <SelectItem key={access} value={access}>
                          {COURSE_ACCESS_LABELS[access]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {course.access === "paid" ? (
                  <div className="grid gap-2">
                    <p className="text-sm font-medium">Plans that unlock it</p>
                    <p className="text-xs text-muted-foreground">
                      Tick none and any paid plan unlocks it.
                    </p>
                    {paidPlans.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        There are no paid plans yet. Add one in Admin → Plans.
                      </p>
                    ) : (
                      paidPlans.map((plan) => {
                        const id = `course-plan-${plan.id}`
                        const ticked = course.planIds.includes(plan.id)
                        return (
                          <div key={plan.id} className="flex items-center gap-3">
                            <Checkbox
                              id={id}
                              checked={ticked}
                              onCheckedChange={(checked) =>
                                void onSaveCourse({
                                  planIds: checked
                                    ? [...course.planIds, plan.id]
                                    : course.planIds.filter((one) => one !== plan.id),
                                })
                              }
                            />
                            <FieldLabel htmlFor={id} className="font-normal">
                              {plan.name}
                            </FieldLabel>
                          </div>
                        )
                      })
                    )}
                  </div>
                ) : null}
                <Button asChild size="sm" variant="outline" className="w-fit">
                  <a
                    href={siteAddress(
                      `/courses/${encodeURIComponent(course.slug)}?preview=free`
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLinkIcon className="size-4" />
                    Read as a free member
                  </a>
                </Button>
              </div>
            </InspectorCard>
          </div>
        </InspectorCollapseAllProvider>
      </ScrollArea>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this chapter?"
        description={
          chapter
            ? `${chapter.title} goes for good, with every member's ticks, notes and questions on it.`
            : null
        }
        confirmLabel="Delete chapter"
        loading={deleting}
        onConfirm={async () => {
          if (!chapter) return
          setDeleting(true)
          try {
            await onDeleteChapter(chapter)
            setConfirmDelete(false)
          } finally {
            setDeleting(false)
          }
        }}
      />
    </div>
  )
}

/** When a published chapter goes live. Empty means it is live once published. */
function PublishAtField({
  value,
  onSave,
}: {
  value: Date | null
  onSave: (date: Date | null) => Promise<boolean>
}) {
  const [text, setText] = React.useState(localDateTime(value))
  const save = () => {
    const next = text ? new Date(text) : null
    if (next && Number.isNaN(next.getTime())) {
      showErrorToast("That date can't be read. Pick it again.")
      return
    }
    if ((next?.getTime() ?? null) === (value?.getTime() ?? null)) return
    void onSave(next)
  }
  return (
    <div className="grid gap-2">
      <FieldLabel
        htmlFor="chapter-publish-at"
        hint="A published chapter stays hidden until then. Leave it empty to go live as soon as it is published."
      >
        Goes live on
      </FieldLabel>
      <div className="flex gap-2">
        <Input
          id="chapter-publish-at"
          type="datetime-local"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={save}
        />
        {text ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setText("")
              if (value) void onSave(null)
            }}
          >
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  )
}
