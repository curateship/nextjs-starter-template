import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { ArchiveIcon, ArchiveRestoreIcon } from "lucide-react"

import { ClientSelect } from "@/components/project/client-select"
import { ProjectColorSelect } from "@/components/project/project-form-fields"
import { ProjectMembersCard } from "@/components/project/project-members-card"
import { ProjectTaskTypesCard } from "@/components/project/project-task-types-card"
import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { ImageUpload } from "@/components/shared/image-upload"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DatePicker } from "@/components/ui/date-picker"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  archiveProject,
  saveProject,
  saveProjectClient,
  saveWholeTeam,
  type ProjectPage,
} from "@/lib/api/project/projects"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { dateFromKey, keyFromDate } from "@/lib/project/dates"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { LIMITS, type ProjectColor } from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"

type Project = ProjectPage["project"]

/**
 * The project's name, colour, description, client, due date, Doing limit,
 * "Everyone on the team", Archive, its status rule, its banner and avatar,
 * members (with the lead) and task types, in a window
 * opened from the cog on the project page's details panel. Each field saves when it
 * is left or Enter is pressed, and the colour, due date and pictures the moment they are picked, so the
 * window ends with Done. Each card folds shut from its heading and stays as it
 * was left in this browser (Tyler, 19 Oct 2026).
 */
export function ProjectSettingsDialog({
  page,
  open,
  onClose,
}: {
  page: ProjectPage
  open: boolean
  onClose: () => void
}) {
  const { project } = page
  // Fields save when they are left, so the one being typed in is left first:
  // Escape or a click outside would otherwise close the window over it.
  function close() {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : close())}>
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Project settings</DialogTitle>
          <DialogDescription>
            {project.archived
              ? "This project is archived, so nothing in it can change. Bring it back to work on it."
              : "Changes save as you make them."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <ProjectSettingsFields project={project} teamClients={page.teamClients} />
          <ProjectPaceCard project={project} />
          <ProjectPicturesCard project={project} />
          <ProjectMembersCard page={page} />
          <ProjectTaskTypesCard page={page} />
        </DialogBody>
        <DialogFooter>
          <Button type="button" onClick={close}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ProjectSettingsFields({ project, teamClients }: { project: Project; teamClients: string[] }) {
  const router = useRouter()
  const [name, setName] = useSyncedDraft(project.name)
  const [description, setDescription] = useSyncedDraft(project.description)
  const [doingLimit, setDoingLimit] = useSyncedDraft(project.doingLimit ? String(project.doingLimit) : "")
  const [limitInvalid, setLimitInvalid] = React.useState(false)
  const [nameInvalid, setNameInvalid] = React.useState(false)
  const [confirmingWholeTeam, setConfirmingWholeTeam] = React.useState(false)
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const readOnly = project.archived

  async function save(fields: {
    name?: string
    color?: ProjectColor
    description?: string
    dueDate?: string | null
    doingLimit?: number | null
  }) {
    const ok = await run(() => saveProject({ projectId: project.id, ...fields }), "Saved.")
    if (ok) await router.invalidate()
    return ok
  }

  /** Empty means no limit. A number that isn't 1 to 99 stays in the box, marked, until it's fixed. */
  async function commitDoingLimit() {
    const text = doingLimit.trim()
    const next = text === "" ? null : Number(text)
    if (next === project.doingLimit) return
    if (next !== null && (!Number.isInteger(next) || next < 1 || next > LIMITS.doingLimit)) {
      setLimitInvalid(true)
      showErrorToast(`Type a whole number from 1 to ${LIMITS.doingLimit}, or leave it empty for no limit.`)
      return
    }
    if (!(await save({ doingLimit: next }))) setLimitInvalid(true)
  }

  function commitName() {
    const next = name.trim()
    if (next === project.name) return
    if (!next) {
      setNameInvalid(true)
      showErrorToast("The project name can't be empty.")
      return
    }
    void save({ name: next })
  }

  function commitDescription() {
    if (description.trim() === project.description) return
    void save({ description: description.trim() })
  }

  async function saveClient(client: string | null) {
    const ok = await run(() => saveProjectClient(project.id, client), "Saved.")
    if (ok) await router.invalidate()
  }

  async function setWholeTeam(on: boolean) {
    const ok = await run(
      () => saveWholeTeam(project.id, on),
      on ? "Everyone on the team is on this project." : "Everyone stays on as an ordinary member."
    )
    if (!ok) return
    setConfirmingWholeTeam(false)
    await router.invalidate()
  }

  async function toggleArchived() {
    const ok = await run(
      () => archiveProject(project.id, !project.archived),
      project.archived ? "Project brought back." : "Project archived."
    )
    if (ok) await router.invalidate()
  }

  return (
    <CollapsibleSettingsCard storageId="project-settings-project" title="Project" size="sm" contentClassName="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="project-name">Name</Label>
        <Input
          id="project-name"
          value={name}
          maxLength={LIMITS.projectName}
          disabled={readOnly}
          aria-invalid={nameInvalid || undefined}
          onChange={(event) => {
            setName(event.target.value)
            setNameInvalid(false)
          }}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur()
          }}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="project-color">Colour</Label>
        <ProjectColorSelect
          id="project-color"
          value={project.color}
          disabled={readOnly}
          onChange={(color) => void save({ color })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="project-description">Description</Label>
        <Textarea
          id="project-description"
          value={description}
          maxLength={LIMITS.projectDescription}
          disabled={readOnly}
          placeholder="What this project is for"
          onChange={(event) => setDescription(event.target.value)}
          onBlur={commitDescription}
        />
      </div>
      <div className="grid gap-2">
        <FieldLabel
          htmlFor="project-client"
          hint="Pick one of the team's clients or type a new name. The Projects table can group by it."
        >
          Client
        </FieldLabel>
        <ClientSelect
          id="project-client"
          value={project.client}
          clients={teamClients}
          disabled={readOnly || busy}
          onChange={(client) => void saveClient(client)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="project-due">Due date</Label>
        <div className="flex flex-wrap items-center gap-2">
          <DatePicker
            id="project-due"
            value={dateFromKey(project.dueDate)}
            placeholder="No due date"
            disabled={readOnly || busy}
            onChange={(date) => void save({ dueDate: keyFromDate(date) })}
          />
          {project.dueDate && !readOnly ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void save({ dueDate: null })}
            >
              Clear
            </Button>
          ) : null}
        </div>
      </div>
      <div className="grid gap-2">
        <FieldLabel
          htmlFor="project-doing-limit"
          hint="The Board warns when someone has more than this in Doing. It never stops anyone. Leave it empty for no limit."
        >
          Doing per person
        </FieldLabel>
        <Input
          id="project-doing-limit"
          type="number"
          inputMode="numeric"
          min={1}
          max={LIMITS.doingLimit}
          className="w-full sm:w-28"
          value={doingLimit}
          disabled={readOnly}
          placeholder="No limit"
          aria-invalid={limitInvalid || undefined}
          onChange={(event) => {
            setDoingLimit(event.target.value)
            setLimitInvalid(false)
          }}
          onBlur={() => void commitDoingLimit()}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur()
          }}
        />
      </div>
      <div className="flex items-center justify-between gap-4">
        <FieldLabel
          htmlFor="project-whole-team"
          hint="Every teammate is on this project, including people who join later. Nobody can be taken off while it's on."
        >
          Everyone on the team
        </FieldLabel>
        <Switch
          id="project-whole-team"
          checked={project.wholeTeam}
          disabled={readOnly || busy}
          onCheckedChange={(on) => (on ? setConfirmingWholeTeam(true) : void setWholeTeam(false))}
        />
      </div>
      <ConfirmDialog
        open={confirmingWholeTeam}
        onOpenChange={setConfirmingWholeTeam}
        title="Show this project to everyone on the team?"
        description="Every teammate joins it and sees all its tasks, chat and files, and so does anyone who joins the team later. Nobody can leave it or be taken off until you turn this off."
        confirmLabel="Add everyone"
        loading={busy}
        onConfirm={() => setWholeTeam(true)}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={() => void toggleArchived()}>
          {project.archived ? (
            <ArchiveRestoreIcon className="size-4" />
          ) : (
            <ArchiveIcon className="size-4" />
          )}
          {project.archived ? "Bring back" : "Archive project"}
        </Button>
      </div>
    </CollapsibleSettingsCard>
  )
}

/**
 * How many late tasks make the project Slowing down and Behind (Tyler,
 * 19 Oct 2026: "Let me setup what constitute certain status like behind, on
 * track or slowing down"). Fewer than both is On track. Each number saves when
 * its box is left or Enter is pressed; one that isn't a whole number from 1 to
 * 99, or a Behind below Slowing down, stays in the box, marked, until fixed.
 */
function ProjectPaceCard({ project }: { project: Project }) {
  const router = useRouter()
  const [run] = useAsyncAction(getProjectErrorMessage)
  const readOnly = project.archived
  return (
    <CollapsibleSettingsCard storageId="project-settings-status" title="Status" size="sm" contentClassName="grid gap-4">
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
            disabled={readOnly}
            onSave={async (next) => {
              const ok = await run(() => saveProject({ projectId: project.id, [field]: next }), "Saved.")
              if (ok) await router.invalidate()
              return ok
            }}
          />
        ))}
      </div>
    </CollapsibleSettingsCard>
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
          className="w-full sm:w-20"
          value={text}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          onChange={(event) => {
            setText(event.target.value)
            setInvalid(false)
          }}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur()
          }}
        />
        <span className="shrink-0 text-sm text-muted-foreground">late tasks</span>
      </div>
    </div>
  )
}

/**
 * The banner, drawn faintly behind the top of the project page's left panel,
 * and the round avatar at its foot (Tyler, 19 Oct 2026). Each saves the
 * moment it is picked, and its × takes it away.
 */
function ProjectPicturesCard({ project }: { project: Project }) {
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const readOnly = project.archived

  async function save(fields: { bannerUrl?: string; avatarUrl?: string }, done: string) {
    const ok = await run(() => saveProject({ projectId: project.id, ...fields }), done)
    if (ok) await router.invalidate()
  }

  return (
    // Sized like the shell's own picture fields: Share image is max-w-48 and an account Photo max-w-20,
    // side by side on a wide screen as on the account page.
    <CollapsibleSettingsCard
      storageId="project-settings-pictures"
      title="Pictures"
      size="sm"
      contentClassName="flex flex-col gap-4 sm:flex-row sm:items-start"
    >
      <ImageUpload
        label="Banner"
        hint="A wide picture shown faintly behind the top of the project's left panel."
        value={project.bannerUrl ?? ""}
        emptyLabel="Add a banner"
        className="max-w-48"
        disabled={readOnly || busy}
        onChange={(url) => void save({ bannerUrl: url }, url ? "Banner saved." : "Banner removed.")}
      />
      <ImageUpload
        label="Avatar"
        hint="A round picture beside the project's name at the top of its left panel."
        value={project.avatarUrl ?? ""}
        aspect="square"
        emptyLabel="Add an avatar"
        className="max-w-20"
        disabled={readOnly || busy}
        onChange={(url) => void save({ avatarUrl: url }, url ? "Avatar saved." : "Avatar removed.")}
      />
    </CollapsibleSettingsCard>
  )
}
