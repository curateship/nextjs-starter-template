import * as React from "react"
import { Loader2Icon, PlusIcon, SettingsIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  applyTimerPreset,
  createTimerPreset,
  deleteTimerPreset,
  listTimerPresets,
  updateTimerPreset,
} from "@/lib/api/pomodoro/timer-presets"
import { useProductAuth } from "@/lib/pomodoro/auth-state"
import {
  GUEST_PRESETS_KEY,
  readGuestJson,
  writeGuestJson,
} from "@/lib/pomodoro/guest-storage"
import { normalizeCustomTimerPresets } from "@/lib/pomodoro/timer-presets"
import {
  builtinTimerPresets,
  matchTimerPreset,
  normalizePresetName,
  presetSummary,
  SESSIONS_BEFORE_LONG_BREAK_MAX,
  SESSIONS_BEFORE_LONG_BREAK_MIN,
  TIMER_PRESET_LIMIT,
  TIMER_PRESET_NAME_MAX,
  validPresetMinutes,
  validSessionsBeforeLongBreak,
  type CustomTimerPreset,
  type TimerPresetValues,
} from "@/lib/pomodoro/timer-presets"

function failureMessage(cause: unknown, fallback: string) {
  const text = cause instanceof Error ? cause.message : ""
  if (text.includes("PRESET_LIMIT_REACHED"))
    return `You can keep up to ${TIMER_PRESET_LIMIT} custom presets. Delete one to add another.`
  if (text.includes("PRESET_NAME_TAKEN"))
    return "You already have a preset with that name."
  if (text.includes("TIMER_RUNNING"))
    return "Presets can't change a running timer — pause or finish it first."
  return fallback
}

/**
 * The rhythm preset block, ported from the old app: a picker over the three
 * built-ins and up to 10 custom rows, saving the current values under a
 * name, editing and deleting. Applying goes through the server, which
 * refuses while a focus session is mid-countdown.
 */
export function FocusRhythmPresets({
  current,
  dailyGoalSessions,
  onApplied,
  onApplyLocally,
}: {
  current: TimerPresetValues
  dailyGoalSessions: number
  onApplied: (values: TimerPresetValues, name: string) => void
  /** The guest path: apply through the local engine; false = timer busy. */
  onApplyLocally: (values: TimerPresetValues) => boolean
}) {
  const [presets, setPresets] = React.useState<CustomTimerPreset[]>([])
  const [notice, setNotice] = React.useState("")
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState("")
  const [newName, setNewName] = React.useState("")
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState<CustomTimerPreset | null>(
    null
  )
  const { authenticated } = useProductAuth()

  React.useEffect(() => {
    if (!authenticated) {
      setPresets(
        normalizeCustomTimerPresets(
          readGuestJson<{ presets?: unknown }>(GUEST_PRESETS_KEY)?.presets
        )
      )
      return
    }
    let cancelled = false
    void listTimerPresets()
      .then((rows) => {
        if (!cancelled) setPresets(rows)
      })
      .catch(() => {
        if (!cancelled)
          setError("Your presets could not be loaded. Reload to try again.")
      })
    return () => {
      cancelled = true
    }
  }, [authenticated])

  const replaceGuestPresets = (next: CustomTimerPreset[]) => {
    setPresets(next)
    writeGuestJson(GUEST_PRESETS_KEY, { presets: next })
  }

  const matched = matchTimerPreset(current, presets)
  const allPresets = [...builtinTimerPresets, ...presets]
  const clearMessages = () => {
    setError("")
    setNotice("")
  }

  const apply = async (preset: { name: string } & TimerPresetValues) => {
    clearMessages()
    if (!authenticated) {
      const applied = onApplyLocally(preset)
      if (applied) setNotice(`${preset.name} applied and saved locally.`)
      else
        setError(
          "Presets can't change a running timer — pause or finish it first."
        )
      return
    }
    setBusy("apply")
    try {
      await applyTimerPreset({
        focusMinutes: preset.focusMinutes,
        shortBreakMinutes: preset.shortBreakMinutes,
        longBreakMinutes: preset.longBreakMinutes,
        sessionsBeforeLongBreak: preset.sessionsBeforeLongBreak,
        autoStart: preset.autoStart,
        dailyGoalSessions,
      })
      onApplied(preset, preset.name)
      setNotice(`${preset.name} applied.`)
    } catch (cause) {
      setError(failureMessage(cause, "The preset could not be applied."))
    } finally {
      setBusy("")
    }
  }

  const nameConflicts = (name: string, exceptId?: string) => {
    const lowered = name.toLowerCase()
    return (
      builtinTimerPresets.some(
        (preset) => preset.name.toLowerCase() === lowered
      ) ||
      presets.some(
        (preset) => preset.id !== exceptId && preset.name.toLowerCase() === lowered
      )
    )
  }

  const createFromCurrent = async () => {
    const name = normalizePresetName(newName)
    if (!name) return
    clearMessages()
    if (presets.length >= TIMER_PRESET_LIMIT) {
      setError(
        `You can keep up to ${TIMER_PRESET_LIMIT} custom presets. Delete one to add another.`
      )
      return
    }
    if (nameConflicts(name)) {
      setError("You already have a preset with that name.")
      return
    }
    if (!authenticated) {
      replaceGuestPresets([
        ...presets,
        { id: crypto.randomUUID(), name, ...current },
      ])
      setNewName("")
      setNotice(`${name} saved locally.`)
      return
    }
    setBusy("create")
    try {
      const created = await createTimerPreset({ name, ...current })
      setPresets((rows) => [...rows, created])
      setNewName("")
      setNotice(`${name} saved.`)
    } catch (cause) {
      setError(failureMessage(cause, "The preset could not be saved."))
    } finally {
      setBusy("")
    }
  }

  const saveEdit = async (
    presetId: string,
    values: { name: string } & TimerPresetValues
  ) => {
    clearMessages()
    if (nameConflicts(values.name, presetId)) {
      setError("You already have a preset with that name.")
      return
    }
    if (!authenticated) {
      replaceGuestPresets(
        presets.map((row) => (row.id === presetId ? { ...row, ...values } : row))
      )
      setEditingId(null)
      setNotice(`${values.name} updated locally.`)
      return
    }
    setBusy(`save:${presetId}`)
    try {
      const updated = await updateTimerPreset({ presetId, ...values })
      setPresets((rows) =>
        rows.map((row) => (row.id === presetId ? updated : row))
      )
      setEditingId(null)
      setNotice(`${values.name} updated.`)
    } catch (cause) {
      setError(failureMessage(cause, "The preset could not be updated."))
    } finally {
      setBusy("")
    }
  }

  const performDelete = async (preset: CustomTimerPreset) => {
    clearMessages()
    if (!authenticated) {
      replaceGuestPresets(presets.filter((row) => row.id !== preset.id))
      setNotice(`${preset.name} deleted.`)
      setDeleting(null)
      return
    }
    setBusy(`delete:${preset.id}`)
    try {
      await deleteTimerPreset(preset.id)
      setPresets((rows) => rows.filter((row) => row.id !== preset.id))
      setNotice(`${preset.name} deleted.`)
      setDeleting(null)
    } catch {
      setError("The preset could not be deleted.")
    } finally {
      setBusy("")
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2">
        <Label htmlFor="rhythm-preset">Preset</Label>
        <Select
          value={matched?.id ?? ""}
          onValueChange={(id) => {
            const preset = allPresets.find((candidate) => candidate.id === id)
            if (preset) void apply(preset)
          }}
        >
          <SelectTrigger id="rhythm-preset" aria-label="Focus rhythm preset">
            <SelectValue placeholder="Custom" />
          </SelectTrigger>
          {/* The shared Select has no group primitives, so built-ins simply
              come first and custom presets after them. */}
          <SelectContent position="popper">
            {builtinTimerPresets.map((preset) => (
              <SelectItem key={preset.id} value={preset.id}>
                {preset.name} · {presetSummary(preset)}
              </SelectItem>
            ))}
            {presets.map((preset) => (
              <SelectItem key={preset.id} value={preset.id}>
                {preset.name} · {presetSummary(preset)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {matched
            ? `Matches ${matched.name} (focus · short break · long break minutes · focuses before the long break).`
            : "Your current values don't match a preset — save them below to reuse them."}
        </span>
      </div>

      {presets.map((preset) =>
        editingId === preset.id ? (
          <PresetEditor
            key={preset.id}
            preset={preset}
            saving={busy === `save:${preset.id}`}
            onCancel={() => setEditingId(null)}
            onSave={(values) => void saveEdit(preset.id, values)}
          />
        ) : (
          <div
            key={preset.id}
            className="flex min-h-10 items-center gap-2 rounded-lg border px-3"
          >
            <span className="flex flex-1 items-baseline gap-2">
              <strong className="text-sm">{preset.name}</strong>
              <small className="font-mono text-[10px] text-muted-foreground">
                {presetSummary(preset)}
              </small>
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Edit preset ${preset.name}`}
              disabled={busy !== ""}
              onClick={() => {
                clearMessages()
                setEditingId(preset.id)
              }}
            >
              <SettingsIcon aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Delete preset ${preset.name}`}
              disabled={busy !== ""}
              onClick={() => setDeleting(preset)}
            >
              {busy === `delete:${preset.id}` ? (
                <Loader2Icon className="animate-spin" aria-hidden="true" />
              ) : (
                <Trash2Icon aria-hidden="true" />
              )}
            </Button>
          </div>
        )
      )}

      {presets.length < TIMER_PRESET_LIMIT ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void createFromCurrent()
          }}
        >
          <Input
            value={newName}
            maxLength={TIMER_PRESET_NAME_MAX}
            placeholder="Name the current rhythm…"
            aria-label="New preset name"
            onChange={(event) => setNewName(event.target.value)}
          />
          <Button
            type="submit"
            variant="outline"
            disabled={busy === "create" || !newName.trim()}
          >
            {busy === "create" ? (
              <Loader2Icon className="animate-spin" aria-hidden="true" />
            ) : (
              <PlusIcon aria-hidden="true" />
            )}
            Save preset
          </Button>
        </form>
      ) : (
        <span className="text-xs text-muted-foreground">
          Preset limit reached ({TIMER_PRESET_LIMIT}). Delete one to add
          another.
        </span>
      )}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="text-sm text-muted-foreground" role="status">
          {notice}
        </p>
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={deleting ? `Delete ${deleting.name}?` : ""}
        description="This removes the saved preset only — your current rhythm and any timer in progress stay exactly as they are."
        confirmLabel="Delete preset"
        loading={deleting ? busy === `delete:${deleting.id}` : false}
        onConfirm={() => {
          if (deleting) void performDelete(deleting)
        }}
      />
    </div>
  )
}

function PresetEditor({
  preset,
  saving,
  onSave,
  onCancel,
}: {
  preset: CustomTimerPreset
  saving: boolean
  onSave: (values: { name: string } & TimerPresetValues) => void
  onCancel: () => void
}) {
  const [name, setName] = React.useState(preset.name)
  const [focusMinutes, setFocusMinutes] = React.useState(preset.focusMinutes)
  const [shortBreakMinutes, setShortBreakMinutes] = React.useState(
    preset.shortBreakMinutes
  )
  const [longBreakMinutes, setLongBreakMinutes] = React.useState(
    preset.longBreakMinutes
  )
  const [sessionsBeforeLongBreak, setSessionsBeforeLongBreak] = React.useState(
    preset.sessionsBeforeLongBreak
  )
  const [autoStart, setAutoStart] = React.useState(preset.autoStart)
  const cleanName = normalizePresetName(name)
  const cycleValid = validSessionsBeforeLongBreak(sessionsBeforeLongBreak)
  const valid =
    Boolean(cleanName) &&
    cycleValid &&
    [focusMinutes, shortBreakMinutes, longBreakMinutes].every(
      validPresetMinutes
    )

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border p-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (cleanName && valid)
          onSave({
            name: cleanName,
            focusMinutes,
            shortBreakMinutes,
            longBreakMinutes,
            sessionsBeforeLongBreak,
            autoStart,
          })
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor={`preset-name-${preset.id}`}>Name</Label>
        <Input
          id={`preset-name-${preset.id}`}
          value={name}
          maxLength={TIMER_PRESET_NAME_MAX}
          aria-invalid={cleanName ? undefined : true}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ["Focus", focusMinutes, setFocusMinutes],
            ["Short break", shortBreakMinutes, setShortBreakMinutes],
            ["Long break", longBreakMinutes, setLongBreakMinutes],
          ] as const
        ).map(([label, value, setValue]) => (
          <div key={label} className="grid gap-2">
            <Label htmlFor={`preset-${label}-${preset.id}`}>{label}</Label>
            <Input
              id={`preset-${label}-${preset.id}`}
              type="number"
              min={1}
              max={90}
              value={value}
              aria-invalid={validPresetMinutes(value) ? undefined : true}
              onChange={(event) => setValue(event.target.valueAsNumber)}
            />
          </div>
        ))}
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`preset-cycle-${preset.id}`}>
          Sessions before long break
        </Label>
        <Input
          id={`preset-cycle-${preset.id}`}
          type="number"
          min={SESSIONS_BEFORE_LONG_BREAK_MIN}
          max={SESSIONS_BEFORE_LONG_BREAK_MAX}
          value={
            Number.isFinite(sessionsBeforeLongBreak)
              ? sessionsBeforeLongBreak
              : ""
          }
          aria-describedby={`preset-cycle-help-${preset.id}`}
          aria-invalid={cycleValid ? undefined : true}
          onChange={(event) =>
            setSessionsBeforeLongBreak(event.target.valueAsNumber)
          }
          className="sm:max-w-40"
        />
        <span
          id={`preset-cycle-help-${preset.id}`}
          className="text-xs text-muted-foreground"
        >
          How many focuses earn the long break. {SESSIONS_BEFORE_LONG_BREAK_MIN}{" "}
          to {SESSIONS_BEFORE_LONG_BREAK_MAX}, four in the classic pattern.
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id={`preset-auto-${preset.id}`}
          checked={autoStart}
          onCheckedChange={(state) => setAutoStart(state === true)}
        />
        <Label htmlFor={`preset-auto-${preset.id}`}>Auto-start next</Label>
      </div>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={saving || !valid}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  )
}
