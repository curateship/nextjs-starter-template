import * as React from "react"
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react"

import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ConfirmDialog, type ConfirmRequest } from "@/components/pomoder/confirm-dialog"
import type { usePomodoro } from "@/hooks/use-pomodoro"
import { createTimerPreset, deleteTimerPreset, loadTimerPresets, updateTimerPreset } from "@/lib/api/timer-presets"
import {
  builtinTimerPresets,
  loadGuestTimerPresets,
  matchTimerPreset,
  normalizePresetName,
  presetSummary,
  saveGuestTimerPresets,
  TIMER_PRESET_LIMIT,
  TIMER_PRESET_NAME_MAX,
  validPresetMinutes,
  type CustomTimerPreset,
  type TimerPresetValues,
} from "@/lib/timer-presets"

type PomodoroApi = ReturnType<typeof usePomodoro>

function failureMessage(cause: unknown, fallback: string) {
  const text = cause instanceof Error ? cause.message : ""
  if (text.includes("PRESET_LIMIT_REACHED")) return `You can keep up to ${TIMER_PRESET_LIMIT} custom presets. Delete one to add another.`
  if (text.includes("PRESET_NAME_TAKEN")) return "You already have a preset with that name."
  return fallback
}

export function FocusRhythmPresets({ pomodoro, authenticated }: { pomodoro: PomodoroApi; authenticated: boolean }) {
  const [presets, setPresets] = React.useState<CustomTimerPreset[]>([])
  const [notice, setNotice] = React.useState("")
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState("")
  const [newName, setNewName] = React.useState("")
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [confirm, setConfirm] = React.useState<ConfirmRequest | null>(null)

  React.useEffect(() => {
    if (!authenticated) { setPresets(loadGuestTimerPresets()); return }
    let cancelled = false
    void loadTimerPresets().then((rows) => { if (!cancelled) setPresets(rows) }).catch(() => { if (!cancelled) setError("Your presets could not be loaded. Reload to try again.") })
    return () => { cancelled = true }
  }, [authenticated])

  const current: TimerPresetValues = { focusMinutes: pomodoro.durations.focus, shortBreakMinutes: pomodoro.durations.short, longBreakMinutes: pomodoro.durations.long, autoStart: pomodoro.autoStart }
  const matched = matchTimerPreset(current, presets)
  const allPresets = [...builtinTimerPresets, ...presets]

  const replacePresets = (next: CustomTimerPreset[]) => {
    setPresets(next)
    if (!authenticated) saveGuestTimerPresets(next)
  }

  const clearMessages = () => { setError(""); setNotice("") }

  const apply = (preset: { name: string } & TimerPresetValues) => {
    clearMessages()
    if (!pomodoro.applyPreset(preset)) {
      setError("Presets can't change a running or paused timer — reset it first.")
      return
    }
    setNotice(authenticated ? `${preset.name} applied.` : `${preset.name} applied and saved locally.`)
  }

  const nameConflicts = (name: string, exceptId?: string) => {
    const lowered = name.toLowerCase()
    return builtinTimerPresets.some((preset) => preset.name.toLowerCase() === lowered) || presets.some((preset) => preset.id !== exceptId && preset.name.toLowerCase() === lowered)
  }

  const createFromCurrent = async () => {
    const name = normalizePresetName(newName)
    if (!name) return
    clearMessages()
    if (presets.length >= TIMER_PRESET_LIMIT) { setError(`You can keep up to ${TIMER_PRESET_LIMIT} custom presets. Delete one to add another.`); return }
    if (nameConflicts(name)) { setError("You already have a preset with that name."); return }
    if (authenticated) {
      setBusy("create")
      try {
        const created = await createTimerPreset({ name, ...current })
        setPresets((rows) => [...rows, created])
        setNewName("")
        setNotice(`${name} saved.`)
      } catch (cause) { setError(failureMessage(cause, "The preset could not be saved.")) } finally { setBusy("") }
      return
    }
    replacePresets([...presets, { id: crypto.randomUUID(), name, ...current }])
    setNewName("")
    setNotice(`${name} saved locally.`)
  }

  const saveEdit = async (presetId: string, values: { name: string } & TimerPresetValues) => {
    clearMessages()
    if (nameConflicts(values.name, presetId)) { setError("You already have a preset with that name."); return }
    if (authenticated) {
      setBusy(`save:${presetId}`)
      try {
        const updated = await updateTimerPreset({ presetId, ...values })
        setPresets((rows) => rows.map((row) => (row.id === presetId ? updated : row)))
        setEditingId(null)
        setNotice(`${values.name} updated.`)
      } catch (cause) { setError(failureMessage(cause, "The preset could not be updated.")) } finally { setBusy("") }
      return
    }
    replacePresets(presets.map((row) => (row.id === presetId ? { ...row, ...values } : row)))
    setEditingId(null)
    setNotice(`${values.name} updated locally.`)
  }

  const performDelete = async (preset: CustomTimerPreset) => {
    clearMessages()
    if (authenticated) {
      setBusy(`delete:${preset.id}`)
      try {
        await deleteTimerPreset(preset.id)
        setPresets((rows) => rows.filter((row) => row.id !== preset.id))
        setNotice(`${preset.name} deleted.`)
      } catch { setError("The preset could not be deleted.") } finally { setBusy("") }
      return
    }
    replacePresets(presets.filter((row) => row.id !== preset.id))
    setNotice(`${preset.name} deleted.`)
  }

  const requestDelete = (preset: CustomTimerPreset) => setConfirm({
    title: `Delete ${preset.name}?`,
    description: "This removes the saved preset only — your current rhythm and any timer in progress stay exactly as they are.",
    confirmLabel: "Delete preset",
    onConfirm: () => void performDelete(preset),
  })

  return (
    <div className="preset-block">
      <label className="preset-select-label">Preset
        <Select value={matched?.id ?? ""} onValueChange={(id) => { const preset = allPresets.find((candidate) => candidate.id === id); if (preset) apply(preset) }} disabled={!pomodoro.canApplyPreset}>
          <SelectTrigger aria-label="Focus rhythm preset"><SelectValue placeholder="Custom" /></SelectTrigger>
          {/* Portaled to <body>; inherits the active theme from <html>. */}
          <SelectContent position="popper">
            <SelectGroup>
              <SelectLabel>Built-in</SelectLabel>
              {builtinTimerPresets.map((preset) => <SelectItem key={preset.id} value={preset.id}>{preset.name} · {presetSummary(preset)}</SelectItem>)}
            </SelectGroup>
            {presets.length ? (
              <SelectGroup>
                <SelectLabel>Your presets</SelectLabel>
                {presets.map((preset) => <SelectItem key={preset.id} value={preset.id}>{preset.name} · {presetSummary(preset)}</SelectItem>)}
              </SelectGroup>
            ) : null}
          </SelectContent>
        </Select>
      </label>
      <span className="preset-help">
        {pomodoro.canApplyPreset
          ? matched
            ? `Matches ${matched.name} (focus · short break · long break minutes).`
            : "Your current values don't match a preset — save them below to reuse them."
          : "Presets apply while the timer is stopped. Reset or finish the current session first."}
      </span>

      {presets.map((preset) => editingId === preset.id ? (
        <PresetEditor key={preset.id} preset={preset} saving={busy === `save:${preset.id}`} onCancel={() => setEditingId(null)} onSave={(values) => void saveEdit(preset.id, values)} />
      ) : (
        <div className="preset-row" key={preset.id}>
          <span className="preset-row-name"><strong>{preset.name}</strong><small>{presetSummary(preset)}</small></span>
          <button type="button" className="preset-icon-button" aria-label={`Edit preset ${preset.name}`} title="Edit preset" disabled={busy !== ""} onClick={() => { clearMessages(); setEditingId(preset.id) }}><Pencil aria-hidden="true" /></button>
          <button type="button" className="preset-icon-button" aria-label={`Delete preset ${preset.name}`} title="Delete preset" disabled={busy !== ""} onClick={() => requestDelete(preset)}>{busy === `delete:${preset.id}` ? <Loader2 className="player-spinner" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}</button>
        </div>
      ))}

      {presets.length < TIMER_PRESET_LIMIT ? (
        <form className="preset-create" onSubmit={(event) => { event.preventDefault(); void createFromCurrent() }}>
          <input value={newName} maxLength={TIMER_PRESET_NAME_MAX} placeholder="Name the current rhythm…" aria-label="New preset name" onChange={(event) => setNewName(event.target.value)} />
          <button type="submit" className="outline-pill" disabled={busy === "create" || !newName.trim()}>{busy === "create" ? <Loader2 className="player-spinner" aria-hidden="true" /> : <Plus aria-hidden="true" />}Save preset</button>
        </form>
      ) : (
        <span className="preset-help">Preset limit reached ({TIMER_PRESET_LIMIT}). Delete one to add another.</span>
      )}

      {error ? <p className="preset-message" role="alert">{error}</p> : null}
      {notice ? <p className="preset-message" role="status">{notice}</p> : null}
      <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />
    </div>
  )
}

function PresetEditor({ preset, saving, onSave, onCancel }: { preset: CustomTimerPreset; saving: boolean; onSave: (values: { name: string } & TimerPresetValues) => void; onCancel: () => void }) {
  const [name, setName] = React.useState(preset.name)
  const [focusMinutes, setFocusMinutes] = React.useState(preset.focusMinutes)
  const [shortBreakMinutes, setShortBreakMinutes] = React.useState(preset.shortBreakMinutes)
  const [longBreakMinutes, setLongBreakMinutes] = React.useState(preset.longBreakMinutes)
  const [autoStart, setAutoStart] = React.useState(preset.autoStart)
  const cleanName = normalizePresetName(name)
  const valid = Boolean(cleanName) && [focusMinutes, shortBreakMinutes, longBreakMinutes].every(validPresetMinutes)

  return (
    <form className="preset-editor" onSubmit={(event) => { event.preventDefault(); if (cleanName && valid) onSave({ name: cleanName, focusMinutes, shortBreakMinutes, longBreakMinutes, autoStart }) }}>
      <label>Name<input value={name} maxLength={TIMER_PRESET_NAME_MAX} aria-invalid={cleanName ? undefined : true} onChange={(event) => setName(event.target.value)} /></label>
      <div className="preset-editor-durations">
        <label>Focus<input type="number" min={1} max={90} value={focusMinutes} aria-invalid={validPresetMinutes(focusMinutes) ? undefined : true} onChange={(event) => setFocusMinutes(event.target.valueAsNumber)} /></label>
        <label>Short break<input type="number" min={1} max={90} value={shortBreakMinutes} aria-invalid={validPresetMinutes(shortBreakMinutes) ? undefined : true} onChange={(event) => setShortBreakMinutes(event.target.valueAsNumber)} /></label>
        <label>Long break<input type="number" min={1} max={90} value={longBreakMinutes} aria-invalid={validPresetMinutes(longBreakMinutes) ? undefined : true} onChange={(event) => setLongBreakMinutes(event.target.valueAsNumber)} /></label>
      </div>
      <label className="preset-editor-check"><Checkbox checked={autoStart} onCheckedChange={(state) => setAutoStart(state === true)} />Auto-start next</label>
      <div className="preset-editor-actions">
        <button type="button" className="outline-pill" disabled={saving} onClick={onCancel}>Cancel</button>
        <button type="submit" className="pill-button" disabled={saving || !valid}>{saving ? "Saving…" : "Save changes"}</button>
      </div>
    </form>
  )
}
