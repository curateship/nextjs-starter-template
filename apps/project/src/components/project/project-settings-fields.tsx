import * as React from "react"

import { ClientSelect } from "@/components/project/client-select"
import { ProjectColorSelect } from "@/components/project/project-form-fields"
import { ImageUpload } from "@/components/shared/image-upload"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DatePicker } from "@/components/ui/date-picker"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useSaveProject } from "@/components/project/use-save-project"
import { saveProjectClient, saveWholeTeam, type ProjectPage } from "@/lib/api/project/projects"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { dateFromKey, keyFromDate } from "@/lib/project/dates"
import { LIMITS } from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * The project's settings, one field at a time, drawn in two places: as cards
 * in the Projects table's settings window, and as folding rows in the project
 * page's ⋮ menu (`project-menu.tsx`). Every field saves itself when it is
 * left, Enter is pressed or a value is picked.
 *
 * `bare` is the menu's drawing: the folding row already names the field, so
 * its label is read out by screen readers only (Travel's rule, Tyler, 4 Nov
 * 2026: "Remove all these duplicate labels").
 */
type Project = ProjectPage["project"]
type FieldProps = { project: Project; bare?: boolean }

/** The label above a field, or one only screen readers hear when the menu row already names it. */
function FieldName({ htmlFor, hint, bare, children }: { htmlFor: string; hint?: string; bare?: boolean; children: string }) {
  if (bare) {
    return (
      <Label htmlFor={htmlFor} className="sr-only">
        {hint ? `${children}. ${hint}` : children}
      </Label>
    )
  }
  return (
    <FieldLabel htmlFor={htmlFor} hint={hint}>
      {children}
    </FieldLabel>
  )
}

function leaveOnEnter(event: React.KeyboardEvent<HTMLInputElement>) {
  if (event.key === "Enter") event.currentTarget.blur()
}

export function ProjectNameField({ project, bare }: FieldProps) {
  const { save } = useSaveProject(project.id)
  const [name, setName] = useSyncedDraft(project.name)
  const [invalid, setInvalid] = React.useState(false)

  function commit() {
    const next = name.trim()
    if (next === project.name) return
    if (!next) {
      setInvalid(true)
      showErrorToast("The project name can't be empty.")
      return
    }
    void save({ name: next })
  }

  return (
    <div className="grid gap-2">
      <FieldName htmlFor="project-name" bare={bare}>
        Name
      </FieldName>
      <Input
        id="project-name"
        value={name}
        maxLength={LIMITS.projectName}
        disabled={project.archived}
        aria-invalid={invalid || undefined}
        onChange={(event) => {
          setName(event.target.value)
          setInvalid(false)
        }}
        onBlur={commit}
        onKeyDown={leaveOnEnter}
      />
    </div>
  )
}

export function ProjectColorField({ project, bare }: FieldProps) {
  const { save } = useSaveProject(project.id)
  return (
    <div className="grid gap-2">
      <FieldName htmlFor="project-color" bare={bare}>
        Colour
      </FieldName>
      <ProjectColorSelect
        id="project-color"
        className={bare ? "w-full" : undefined}
        value={project.color}
        disabled={project.archived}
        onChange={(color) => void save({ color })}
      />
    </div>
  )
}

export function ProjectClientField({ project, names, bare }: FieldProps & { names: string[] }) {
  const { run, busy, router } = useSaveProject(project.id)
  async function saveClient(client: string | null) {
    const ok = await run(() => saveProjectClient(project.id, client), "Saved.")
    if (ok) await router.invalidate()
  }
  return (
    <div className="grid gap-2">
      <FieldName
        htmlFor="project-client"
        bare={bare}
        hint="Pick one of the team's clients or type a new name. The Projects table can group by it."
      >
        Client
      </FieldName>
      <ClientSelect
        id="project-client"
        value={project.client}
        names={names}
        disabled={project.archived || busy}
        onChange={(client) => void saveClient(client)}
      />
    </div>
  )
}

export function ProjectCategoryField({ project, names, bare }: FieldProps & { names: string[] }) {
  const { save, busy } = useSaveProject(project.id)
  return (
    <div className="grid gap-2">
      <FieldName
        htmlFor="project-category"
        bare={bare}
        hint="Pick a category or type a new one. Every team shares one list, and the Projects page can filter by it."
      >
        Category
      </FieldName>
      <ClientSelect
        id="project-category"
        kind="category"
        value={project.category}
        names={names}
        disabled={project.archived || busy}
        onChange={(category) => void save({ category })}
      />
    </div>
  )
}

export function ProjectDueField({ project, bare }: FieldProps) {
  const { save, busy } = useSaveProject(project.id)
  return (
    <div className="grid gap-2">
      <FieldName htmlFor="project-due" bare={bare}>
        Due date
      </FieldName>
      <div className={cn("flex items-center gap-2", !bare && "flex-wrap")}>
        <DatePicker
          id="project-due"
          className={bare ? "w-auto min-w-0 flex-1" : undefined}
          value={dateFromKey(project.dueDate)}
          placeholder="No due date"
          disabled={project.archived || busy}
          onChange={(date) => void save({ dueDate: keyFromDate(date) })}
        />
        {project.dueDate && !project.archived ? (
          <Button
            type="button"
            variant={bare ? "outline" : "ghost"}
            size={bare ? "default" : "sm"}
            disabled={busy}
            onClick={() => void save({ dueDate: null })}
          >
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  )
}

/** Empty means no limit. A number that isn't 1 to 99 stays in the box, marked, until it's fixed. */
export function ProjectDoingLimitField({ project, bare }: FieldProps) {
  const { save } = useSaveProject(project.id)
  const [text, setText] = useSyncedDraft(project.doingLimit ? String(project.doingLimit) : "")
  const [invalid, setInvalid] = React.useState(false)

  async function commit() {
    const trimmed = text.trim()
    const next = trimmed === "" ? null : Number(trimmed)
    if (next === project.doingLimit) return
    if (next !== null && (!Number.isInteger(next) || next < 1 || next > LIMITS.doingLimit)) {
      setInvalid(true)
      showErrorToast(`Type a whole number from 1 to ${LIMITS.doingLimit}, or leave it empty for no limit.`)
      return
    }
    if (!(await save({ doingLimit: next }))) setInvalid(true)
  }

  return (
    <div className="grid gap-2">
      <FieldName
        htmlFor="project-doing-limit"
        bare={bare}
        hint="The Board warns when someone has more than this in Doing. It never stops anyone. Leave it empty for no limit."
      >
        Doing per person
      </FieldName>
      <Input
        id="project-doing-limit"
        type="number"
        inputMode="numeric"
        min={1}
        max={LIMITS.doingLimit}
        className={bare ? "w-full" : "w-full sm:w-28"}
        value={text}
        disabled={project.archived}
        placeholder="No limit"
        aria-invalid={invalid || undefined}
        onChange={(event) => {
          setText(event.target.value)
          setInvalid(false)
        }}
        onBlur={() => void commit()}
        onKeyDown={leaveOnEnter}
      />
    </div>
  )
}

/** Turning it on asks first, because everyone then sees every task, chat and file. */
export function ProjectWholeTeamField({ project, bare }: FieldProps) {
  const { run, busy, router } = useSaveProject(project.id)
  const [confirming, setConfirming] = React.useState(false)

  async function setWholeTeam(on: boolean) {
    const ok = await run(
      () => saveWholeTeam(project.id, on),
      on ? "Everyone on the team is on this project." : "Everyone stays on as an ordinary member."
    )
    if (!ok) return
    setConfirming(false)
    await router.invalidate()
  }

  const hint =
    "Every teammate is on this project, including people who join later. Nobody can be taken off while it's on."
  return (
    <div className="flex items-center justify-between gap-4">
      {bare ? (
        <Label htmlFor="project-whole-team" className="font-normal text-muted-foreground">
          Every teammate, and anyone who joins later
        </Label>
      ) : (
        <FieldLabel htmlFor="project-whole-team" hint={hint}>
          Everyone on the team
        </FieldLabel>
      )}
      <Switch
        id="project-whole-team"
        checked={project.wholeTeam}
        disabled={project.archived || busy}
        onCheckedChange={(on) => (on ? setConfirming(true) : void setWholeTeam(false))}
      />
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Show this project to everyone on the team?"
        description="Every teammate joins it and sees all its tasks, chat and files, and so does anyone who joins the team later. Nobody can leave it or be taken off until you turn this off."
        confirmLabel="Add everyone"
        loading={busy}
        onConfirm={() => setWholeTeam(true)}
      />
    </div>
  )
}

/**
 * How many late tasks make the project Slowing down and Behind (Tyler,
 * 19 Oct 2026: "Let me setup what constitute certain status like behind, on
 * track or slowing down"). Fewer than both is On track. Each number saves when
 * its box is left or Enter is pressed; one that isn't a whole number from 1 to
 * 99, or a Behind below Slowing down, stays in the box, marked, until fixed.
 */
export function ProjectPaceFields({ project }: { project: Project }) {
  const { save } = useSaveProject(project.id)
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        A task is late when it isn't Done and its due date has passed. With fewer late tasks than both
        numbers, the project is On track.
      </p>
      {/* Side by side at their own width, so Behind sits next to Slowing down (Tyler, 19 Oct 2026). */}
      <div className="flex flex-wrap gap-x-8 gap-y-4">
        {(["slowingAt", "behindAt"] as const).map((field) => (
          <LateTasksField
            key={field}
            id={`project-${field}`}
            label={field === "slowingAt" ? "Slowing down from" : "Behind from"}
            dot={field === "slowingAt" ? "bg-amber-500" : "bg-red-500"}
            value={project[field]}
            disabled={project.archived}
            onSave={(next) => save(field === "slowingAt" ? { slowingAt: next } : { behindAt: next })}
          />
        ))}
      </div>
    </div>
  )
}

function LateTasksField({
  id,
  label,
  dot,
  value,
  disabled,
  onSave,
}: {
  id: string
  label: string
  /** The status's own dot colour, so the field reads as the status it sets. */
  dot: string
  value: number
  disabled: boolean
  onSave: (next: number) => Promise<boolean>
}) {
  const [text, setText] = useSyncedDraft(String(value))
  const [invalid, setInvalid] = React.useState(false)

  async function commit() {
    const next = Number(text.trim())
    if (next === value) return
    if (!Number.isInteger(next) || next < 1 || next > LIMITS.lateTasks) {
      setInvalid(true)
      showErrorToast(`Type a whole number from 1 to ${LIMITS.lateTasks}.`)
      return
    }
    if (!(await onSave(next))) setInvalid(true)
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={id} className="flex items-center gap-1.5">
        <span aria-hidden className={`inline-block size-2 shrink-0 rounded-full ${dot}`} />
        {label}
      </Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={1}
          max={LIMITS.lateTasks}
          className="w-20"
          value={text}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          onChange={(event) => {
            setText(event.target.value)
            setInvalid(false)
          }}
          onBlur={() => void commit()}
          onKeyDown={leaveOnEnter}
        />
        <span className="shrink-0 text-sm text-muted-foreground">late tasks</span>
      </div>
    </div>
  )
}

const BANNER_HINT = "A wide picture shown faintly behind the top of the project's left panel."

/** The banner behind the top of the project page's left panel. It saves the moment it's picked, and its × takes it away. */
export function ProjectBannerField({ project, bare }: FieldProps) {
  const { save, busy } = useSaveProject(project.id)
  return (
    <ImageUpload
      label="Banner"
      showLabel={!bare}
      hint={BANNER_HINT}
      value={project.bannerUrl ?? ""}
      emptyLabel="Add a banner"
      // Sized like the shell's own picture fields when it's a card: Share image is max-w-48.
      className={bare ? undefined : "max-w-48"}
      disabled={project.archived || busy}
      onChange={(url) => void save({ bannerUrl: url }, url ? "Banner saved." : "Banner removed.")}
    />
  )
}
