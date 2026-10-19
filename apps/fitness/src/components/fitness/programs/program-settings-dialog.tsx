import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { SettingsSwitchRow } from "@/components/settings/settings-switch-row"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { changeProgram, type ProgramSummary } from "@/lib/api/fitness/programs"
import { FITNESS_ERRORS } from "@/lib/fitness/errors"
import { reportFitnessError } from "@/lib/fitness/report-error"
import { showErrorToast } from "@/lib/toast/error-toast"

/** Renames a program, makes it the active one, or archives it. */
export function ProgramSettingsDialog({
  program,
  onClose,
}: {
  program: ProgramSummary | null
  onClose: () => void
}) {
  return (
    <ProgramSettingsForm key={program?.id ?? "none"} program={program} onClose={onClose} />
  )
}

function ProgramSettingsForm({ program, onClose }: { program: ProgramSummary | null; onClose: () => void }) {
  const router = useRouter()
  const nameId = React.useId()
  const activeId = React.useId()
  const archivedId = React.useId()
  const [name, setName] = React.useState(program?.name ?? "")
  const [active, setActive] = React.useState(program?.isActive ?? false)
  const [archived, setArchived] = React.useState(program?.archived ?? false)
  const [nameInvalid, setNameInvalid] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const dirty =
    program !== null &&
    (name !== program.name || active !== program.isActive || archived !== program.archived)

  async function save() {
    if (!program) return
    if (!name.trim()) {
      setNameInvalid(true)
      showErrorToast(FITNESS_ERRORS.nameNeeded)
      return
    }
    setBusy(true)
    try {
      if (name !== program.name) await changeProgram({ action: "rename", programId: program.id, name })
      if (archived !== program.archived) {
        await changeProgram({ action: "archive", programId: program.id, archived })
      }
      if (active && !program.isActive && !archived) {
        await changeProgram({ action: "activate", programId: program.id })
      }
      toast.success("Program saved.")
      await router.invalidate()
      onClose()
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog open={program !== null} dirty={dirty} busy={busy} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <form
            className="contents"
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
          >
            <DialogHeader>
              <DialogTitle>Program settings</DialogTitle>
            </DialogHeader>
            <DialogBody className="grid gap-6">
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Name</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor={nameId}>Program name</Label>
                    <Input
                      id={nameId}
                      value={name}
                      maxLength={80}
                      aria-invalid={nameInvalid || undefined}
                      onChange={(event) => {
                        setName(event.target.value)
                        if (nameInvalid && event.target.value.trim()) setNameInvalid(false)
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Status</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <SettingsSwitchRow
                    id={activeId}
                    checked={active}
                    disabled={program?.isActive || archived}
                    onCheckedChange={setActive}
                    label="This is my active program"
                    hint={
                      program?.isActive
                        ? "This is already the active program. Making another one active turns this one off."
                        : archived
                          ? "An archived program can't be the active one. Switch archive off first."
                          : "The active program is the one reminders and the weekly goal follow. Making this one active turns the old one off."
                    }
                  />
                  <SettingsSwitchRow
                    id={archivedId}
                    checked={archived}
                    onCheckedChange={(next) => {
                      setArchived(next)
                      if (next) setActive(false)
                    }}
                    label="Archive this program"
                    hint="Archiving takes it off the calendar and reminders. Its logged workouts stay in History."
                  />
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" size="lg" onClick={requestClose}>
                Cancel
              </Button>
              <Button type="submit" size="lg" disabled={busy}>
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
