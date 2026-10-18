import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CircleCheckIcon,
  CopyIcon,
  Loader2Icon,
  PauseIcon,
  PlayIcon,
  SettingsIcon,
  Share2Icon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { calendarChanged } from "@/components/fitness/program/calendar-version"
import { NameDialog } from "@/components/fitness/program/name-dialog"
import type { ProgramPageData } from "@/components/fitness/program/program-data"
import { dateToDay, dayToDate } from "@/components/fitness/program/program-data"
import { StartingData } from "@/components/fitness/program/starting-data"
import { StrengthSettings } from "@/components/fitness/program/strength-rules"
import { Badge } from "@/components/ui/badge"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { changeProgram } from "@/lib/api/fitness/programs"
import { formatDay } from "@/lib/fitness/dates"
import { routineTypeLabel } from "@/lib/fitness/routine-types"
import { reportFitnessError } from "@/lib/fitness/report-error"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

const PAUSE_REASONS = [
  { id: "holiday", label: "Holiday" },
  { id: "injury", label: "Injury" },
  { id: "other", label: "Something else" },
] as const

/**
 * The cog in the program's header and everything about the program as a
 * whole. Tyler, 18 Oct 2026: "All of these settings should be in a cog icon
 * dropdown here and all the other options should live within this dropdown".
 * The same shape as Project's My settings: the actions at the top (rename,
 * make active, pause or resume, share, archive, delete), then the program's
 * own settings as cards that fold open, each saving as it changes: starting
 * data, weight rules and training blocks. Share is the owner's alone.
 */
export function ProgramSettingsMenu({
  data,
  onDeleted,
}: {
  data: ProgramPageData
  /** Called once the program is gone, so the dashboard can show another. */
  onDeleted: () => void
}) {
  const router = useRouter()
  const { program, pause } = data
  const [open, setOpen] = React.useState(false)
  const [renaming, setRenaming] = React.useState(false)
  const [pausing, setPausing] = React.useState(false)
  const [sharing, setSharing] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  // Leaving a field saves it, so closing the dropdown first leaves the field
  // being typed in, the way Project's My settings does.
  function changeOpen(next: boolean) {
    if (!next && document.activeElement instanceof HTMLElement) document.activeElement.blur()
    setOpen(next)
  }

  /** A window can't open inside the dropdown, so the dropdown closes first. */
  function openWindow(show: (value: boolean) => void) {
    changeOpen(false)
    show(true)
  }

  async function act(action: () => Promise<unknown>, success?: string) {
    setBusy(true)
    try {
      await action()
      if (success) toast.success(success)
      await router.invalidate()
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setBusy(false)
    }
  }

  const row = "h-8 w-full justify-start gap-2 px-2 font-normal"

  return (
    <>
      <Popover open={open} onOpenChange={changeOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Program settings"
                className={cn(open && "bg-muted")}
              >
                {busy ? <Loader2Icon className="animate-spin" /> : <SettingsIcon />}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Program settings</TooltipContent>
        </Tooltip>
        {/* Opens to the right of the cog, over the middle panel, rather than back over the left menu (Tyler, 18 Oct 2026). */}
        <PopoverContent
          align="start"
          collisionPadding={16}
          aria-label="Program settings"
          className="w-[min(24rem,calc(100vw-2rem))] gap-0 p-0"
        >
          <ScrollArea className="min-h-0" viewportClassName="max-h-[min(75vh,44rem)]">
            <div className="grid gap-2 p-3">
              <div className="grid">
                <Button type="button" variant="ghost" className={row} onClick={() => openWindow(setRenaming)}>
                  <SettingsIcon />
                  Rename
                </Button>
                {!program.isActive && !program.archived ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className={row}
                    disabled={busy}
                    onClick={() =>
                      void act(
                        () => changeProgram({ action: "activate", programId: program.id }),
                        program.mine ? "This is now your active program." : "This is now their active program."
                      )
                    }
                  >
                    <CircleCheckIcon />
                    Make active
                  </Button>
                ) : null}
                {pause ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className={row}
                    disabled={busy}
                    onClick={() => void act(() => changeProgram({ action: "resume", programId: program.id }), "Program resumed.")}
                  >
                    <PlayIcon />
                    Resume
                  </Button>
                ) : !program.archived ? (
                  <Button type="button" variant="ghost" className={row} onClick={() => openWindow(setPausing)}>
                    <PauseIcon />
                    Pause
                  </Button>
                ) : null}
                {program.mine && !program.archived ? (
                  <Button type="button" variant="ghost" className={row} onClick={() => openWindow(setSharing)}>
                    <Share2Icon />
                    Share
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  className={row}
                  disabled={busy}
                  onClick={() =>
                    void act(
                      () => changeProgram({ action: "archive", programId: program.id, archived: !program.archived }),
                      program.archived ? "Program brought back." : "Program archived."
                    )
                  }
                >
                  {program.archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
                  {program.archived ? "Bring back" : "Archive"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className={cn(row, "text-destructive hover:text-destructive")}
                  onClick={() => openWindow(setDeleting)}
                >
                  <Trash2Icon />
                  Delete
                </Button>
              </div>
              <div className="-mx-3 border-t" />
              <StartingData key={`start-${program.id}`} data={data} />
              <StrengthSettings key={`rules-${program.id}`} data={data} />
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>

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

/** The program's strength and badges, beside its name in the right panel's header. */
export function ProgramBadges({ data }: { data: ProgramPageData }) {
  const { program } = data
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      <span className="truncate">{routineTypeLabel(program.routineType)}</span>
      {program.isActive ? <Badge variant="secondary">Active</Badge> : null}
      {data.pause ? <Badge variant="outline">Paused</Badge> : null}
      {program.archived ? <Badge variant="outline">Archived</Badge> : null}
    </span>
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
