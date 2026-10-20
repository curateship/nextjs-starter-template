import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CircleCheckIcon,
  CopyIcon,
  EllipsisIcon,
  Loader2Icon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  SettingsIcon,
  ShareIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { calendarChanged } from "@/components/fitness/program/calendar-version"
import { NameDialog } from "@/components/fitness/program/name-dialog"
import type { ProgramPageData } from "@/components/fitness/program/program-data"
import { dateToDay, dayToDate } from "@/components/fitness/program/program-data"
import { StartingData } from "@/components/fitness/program/starting-data"
import { StrengthSettings } from "@/components/fitness/program/strength-rules"
import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { ImageUpload } from "@/components/shared/image-upload"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DatePicker } from "@/components/ui/date-picker"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Dialog,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { changeProgram } from "@/lib/api/fitness/programs"
import { formatDay } from "@/lib/fitness/dates"
import { reportFitnessError } from "@/lib/fitness/report-error"
import { showErrorToast } from "@/lib/toast/error-toast"

const PAUSE_REASONS = [
  { id: "holiday", label: "Holiday" },
  { id: "injury", label: "Injury" },
  { id: "other", label: "Something else" },
] as const

/**
 * The three dots in the program's header: what can be done to the program as
 * a whole. Its settings sit behind the cog beside it
 * (`ProgramSettingsWindow`), because the UI standard keeps the cog for
 * settings (Tyler, 20 Oct 2026, picking the standard's settings window over
 * his 18 Oct cog dropdown). Share is the owner's alone; Delete is at the foot
 * of the settings window.
 */
export function ProgramActionsMenu({ data }: { data: ProgramPageData }) {
  const router = useRouter()
  const { program, pause } = data
  const [renaming, setRenaming] = React.useState(false)
  const [pausing, setPausing] = React.useState(false)
  const [sharing, setSharing] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  async function act(action: () => Promise<unknown>, success: string) {
    setBusy(true)
    try {
      await action()
      toast.success(success)
      calendarChanged()
      await router.invalidate()
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="Program actions">
                {busy ? <Loader2Icon className="animate-spin" /> : <EllipsisIcon />}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Program actions</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuItem disabled={program.archived} onSelect={() => setRenaming(true)}>
            <PencilIcon />
            Rename
          </DropdownMenuItem>
          {!program.isActive && !program.archived ? (
            <DropdownMenuItem
              onSelect={() =>
                void act(
                  () => changeProgram({ action: "activate", programId: program.id }),
                  program.mine ? "This is now your active program." : "This is now their active program."
                )
              }
            >
              <CircleCheckIcon />
              Make it the active program
            </DropdownMenuItem>
          ) : null}
          {pause ? (
            <DropdownMenuItem
              onSelect={() => void act(() => changeProgram({ action: "resume", programId: program.id }), "Program resumed.")}
            >
              <PlayIcon />
              Resume program
            </DropdownMenuItem>
          ) : !program.archived ? (
            <DropdownMenuItem onSelect={() => setPausing(true)}>
              <PauseIcon />
              Pause program
            </DropdownMenuItem>
          ) : null}
          {program.mine && !program.archived ? (
            <DropdownMenuItem onSelect={() => setSharing(true)}>
              <ShareIcon />
              Share
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() =>
              void act(
                () => changeProgram({ action: "archive", programId: program.id, archived: !program.archived }),
                program.archived ? "Program brought back." : "Program archived."
              )
            }
          >
            {program.archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
            {program.archived ? "Bring back" : "Archive"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <NameDialog
        open={renaming}
        title="Rename program"
        name={program.name}
        maxLength={80}
        saveLabel="Save changes"
        onClose={() => setRenaming(false)}
        onSave={async (name) => {
          await changeProgram({ action: "rename", programId: program.id, name })
          await router.invalidate()
        }}
      />
      <PauseDialog
        open={pausing}
        today={data.today}
        onClose={() => setPausing(false)}
        onSave={async (input) => {
          await changeProgram({ action: "pause", programId: program.id, ...input })
          toast.success("Program paused.")
          calendarChanged()
          await router.invalidate()
        }}
      />
      <ShareDialog
        open={sharing}
        programId={program.id}
        shareCode={data.strength.shareSlug}
        onClose={() => setSharing(false)}
      />
    </>
  )
}

/**
 * The cog in the program's header and the window it opens (UI standard,
 * "Settings": the cog opens the settings window for the panel's subject).
 * Tyler, 20 Oct 2026, chose this window over his 18 Oct cog dropdown, and a
 * Pictures card in it over clicking the picture.
 *
 * - Pictures: the banner and the round picture, from the person's own
 *   uploads (`setProgramPictures` refuses anything else).
 * - Starting data, Weight rules, Training blocks: each field saves as it
 *   changes, so the window ends with Done. A save that fails says so in a
 *   toast.
 * - Delete program sits at the foot on the left. The window closes before
 *   the question opens, so one window never sits on another.
 */
export function ProgramSettingsWindow({ data, onDeleted }: { data: ProgramPageData; onDeleted: () => void }) {
  const { program } = data
  const [open, setOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  // Fields save when they are left, so the one being typed in is left first:
  // Escape or a click outside would otherwise close the window over it.
  function close() {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    setOpen(false)
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant="ghost" size="icon" aria-label="Program settings" onClick={() => setOpen(true)}>
            <SettingsIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Program settings</TooltipContent>
      </Tooltip>

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Program settings</DialogTitle>
            <DialogDescription>
              {program.archived
                ? "This program is archived, so nothing in it can change. Bring it back from the program's actions."
                : "Changes save as you make them."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <ProgramPicturesCard data={data} />
            <StartingData key={`start-${program.id}`} data={data} />
            <StrengthSettings key={`rules-${program.id}`} data={data} />
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="text-destructive hover:text-destructive sm:mr-auto"
              onClick={() => {
                close()
                setDeleting(true)
              }}
            >
              <Trash2Icon />
              Delete program
            </Button>
            <Button type="button" size="lg" onClick={close}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this program?"
        description="Its week and calendar are deleted. Workouts already logged stay in History and keep counting toward records."
        confirmLabel="Delete program"
        destructive
        loading={busy}
        onConfirm={() =>
          void (async () => {
            setBusy(true)
            try {
              await changeProgram({ action: "delete", programId: program.id })
              toast.success("Program deleted.")
              setDeleting(false)
              onDeleted()
            } catch (error) {
              reportFitnessError(error)
            } finally {
              setBusy(false)
            }
          })()
        }
      />
    </>
  )
}

/**
 * The banner and the round picture, both optional, from the person's own
 * uploads. The banner lies faintly behind the top of the left panel and the
 * picture sits at its foot beside the program's name.
 */
function ProgramPicturesCard({ data }: { data: ProgramPageData }) {
  const router = useRouter()
  const { program } = data
  const [busy, setBusy] = React.useState(false)

  async function save(fields: { bannerUrl?: string | null; avatarUrl?: string | null }, done: string) {
    setBusy(true)
    try {
      await changeProgram({ action: "pictures", programId: program.id, ...fields })
      toast.success(done)
      await router.invalidate()
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <CollapsibleSettingsCard
      storageId="fitness-program-pictures"
      title="Pictures"
      size="sm"
      contentClassName="flex flex-col gap-4 sm:flex-row sm:items-start"
    >
      <ImageUpload
        label="Banner"
        hint="A wide picture shown faintly behind the top of the program's left panel."
        value={program.bannerUrl ?? ""}
        emptyLabel="Add a banner"
        className="max-w-48"
        disabled={program.archived || busy}
        onChange={(url) => void save({ bannerUrl: url || null }, url ? "Banner saved." : "Banner removed.")}
      />
      <ImageUpload
        label="Picture"
        hint="A round picture beside the program's name at the top of its left panel."
        value={program.avatarUrl ?? ""}
        aspect="square"
        emptyLabel="Add a picture"
        className="max-w-20"
        disabled={program.archived || busy}
        onChange={(url) => void save({ avatarUrl: url || null }, url ? "Picture saved." : "Picture removed.")}
      />
    </CollapsibleSettingsCard>
  )
}

/**
 * The program's state in one line under the right panel's header: paused,
 * archived, or not the active one. Resume and Make active sit beside it.
 */
export function ProgramStateLine({ data }: { data: ProgramPageData }) {
  const router = useRouter()
  const { program, pause } = data
  const [busy, setBusy] = React.useState(false)

  async function act(action: () => Promise<unknown>, success: string) {
    setBusy(true)
    try {
      await action()
      toast.success(success)
      calendarChanged()
      await router.invalidate()
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setBusy(false)
    }
  }

  const pausedNow = pause && pause.fromDay <= data.today
  const sentence = program.archived
    ? "Archived. Bring it back from the program's actions to change it."
    : pause
      ? pausedNow
        ? pause.untilDay
          ? `Paused until ${formatDay(pause.untilDay)}.`
          : "Paused until you resume."
        : `Pauses from ${formatDay(pause.fromDay)}.`
      : null
  if (!sentence) return null
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
      {pause && !program.archived ? <PauseIcon className="size-4 text-muted-foreground" aria-hidden /> : null}
      <span className="min-w-0 flex-1">{sentence}</span>
      {pause && !program.archived ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void act(() => changeProgram({ action: "resume", programId: program.id }), "Program resumed.")}
        >
          {busy ? <Loader2Icon className="animate-spin" /> : <PlayIcon />}
          Resume
        </Button>
      ) : null}
    </div>
  )
}

function PauseDialog({
  open,
  today,
  onClose,
  onSave,
}: {
  open: boolean
  today: string
  onClose: () => void
  onSave: (input: { fromDay: string; untilDay: string | null; reason: "holiday" | "injury" | "other" }) => Promise<void>
}) {
  const [fromDay, setFromDay] = React.useState(today)
  const [untilDay, setUntilDay] = React.useState<string | null>(null)
  const [untilResume, setUntilResume] = React.useState(true)
  const [reason, setReason] = React.useState<"holiday" | "injury" | "other">("holiday")
  const [busy, setBusy] = React.useState(false)
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setFromDay(today)
      setUntilDay(null)
      setUntilResume(true)
      setReason("holiday")
    }
  }
  const fromId = React.useId()
  const untilId = React.useId()
  const reasonId = React.useId()
  const resumeId = React.useId()

  async function save() {
    if (!untilResume && !untilDay) {
      showErrorToast("Pick the day the pause ends, or tick Until I resume.")
      return
    }
    setBusy(true)
    try {
      await onSave({ fromDay, untilDay: untilResume ? null : untilDay, reason })
      onClose()
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog open={open} dirty={false} busy={busy} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Pause program</DialogTitle>
            <DialogDescription>
              Planned days inside the pause leave the calendar and the plan carries on after it. No missed days, no
              reminders, and your weights stay where they are.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>When</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor={fromId}>From</Label>
                    <DatePicker
                      id={fromId}
                      value={dayToDate(fromDay)}
                      onChange={(date) => date && setFromDay(dateToDay(date))}
                    />
                  </div>
                  {!untilResume ? (
                    <div className="grid gap-2">
                      <Label htmlFor={untilId}>Until</Label>
                      <DatePicker
                        id={untilId}
                        value={untilDay ? dayToDate(untilDay) : undefined}
                        onChange={(date) => setUntilDay(date ? dateToDay(date) : null)}
                      />
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={resumeId}
                    checked={untilResume}
                    onCheckedChange={(checked) => setUntilResume(checked === true)}
                  />
                  <Label htmlFor={resumeId}>Until I resume</Label>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={reasonId}>Why</Label>
                  <Select value={reason} onValueChange={(value) => setReason(value as typeof reason)}>
                    <SelectTrigger id={reasonId} className="sm:w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAUSE_REASONS.map((entry) => (
                        <SelectItem key={entry.id} value={entry.id}>
                          {entry.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" size="lg" onClick={requestClose}>
              Cancel
            </Button>
            <Button type="button" size="lg" disabled={busy} onClick={() => void save()}>
              {busy ? <Loader2Icon className="animate-spin" /> : null}
              Pause program
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}

function ShareDialog({
  open,
  programId,
  shareCode,
  onClose,
}: {
  open: boolean
  programId: string
  shareCode: string | null
  onClose: () => void
}) {
  const router = useRouter()
  const [code, setCode] = React.useState(shareCode)
  const [lastCode, setLastCode] = React.useState(shareCode)
  if (lastCode !== shareCode) {
    setLastCode(shareCode)
    setCode(shareCode)
  }
  const [busy, setBusy] = React.useState(false)
  const switchId = React.useId()
  const address = code && typeof window !== "undefined" ? `${window.location.origin}/r/${code}` : null

  async function toggle(shared: boolean) {
    setBusy(true)
    try {
      const result = await changeProgram({ action: "share", programId, shared })
      setCode(result.shareCode ?? null)
      await router.invalidate()
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Share program</DialogTitle>
          <DialogDescription>
            Anyone with the link sees this program&apos;s days, lifts, sets, reps and rest, and can copy it into
            their own account. They never see your name, weights, workouts or photos.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardContent className="grid gap-4">
              <div className="flex items-center justify-between gap-4">
                <FieldLabel htmlFor={switchId} hint="Switching it off stops the link working straight away.">
                  Share as a public page
                </FieldLabel>
                <Switch
                  id={switchId}
                  checked={Boolean(code)}
                  disabled={busy}
                  onCheckedChange={(checked) => void toggle(checked)}
                />
              </div>
              {address ? (
                <div className="flex gap-2">
                  <Input readOnly value={address} aria-label="Public address" />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      void navigator.clipboard.writeText(address).then(
                        () => toast.success("Link copied."),
                        () => showErrorToast("The link couldn't be copied. Select it and copy it by hand.")
                      )
                    }
                  >
                    <CopyIcon />
                    Copy
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </DialogBody>
        <DialogFooter>
          <Button type="button" size="lg" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
