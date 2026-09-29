import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import type { AppFrontPageRowEditorProps } from "@/lib/app-options"
import {
  cleanPomodoroRowSettings,
  POMODORO_ROW_FLOOR_HINTS,
  POMODORO_ROW_FLOOR_LABEL,
  POMODORO_ROW_FLOOR_MAX,
  POMODORO_ROW_FLOOR_MIN,
  POMODORO_ROW_FLOOR_UNITS,
  type PomodoroRowKey,
} from "@/lib/pomodoro/front-page-rows"

/**
 * The one field behind each of this app's front page rows, inside the shell's
 * row window.
 *
 * Both rows publish a figure to people who are not members, and both hold the
 * same decision: how quiet is too quiet to say anything. So both panels are the
 * same box with different words, and the row is left off the page below it.
 *
 * The panel cleans what it is given on the way in and writes a whole set on the
 * way out, so a row saved before the floor existed still opens with a number in
 * the box.
 */
function FloorPanel({
  rowKey,
  settings,
  disabled,
  onChange,
}: AppFrontPageRowEditorProps & { rowKey: PomodoroRowKey }) {
  const { floor } = cleanPomodoroRowSettings(rowKey, settings)
  const id = `front-page-floor-${rowKey}`

  return (
    <div className="grid max-w-56 gap-2">
      <FieldLabel htmlFor={id} hint={POMODORO_ROW_FLOOR_HINTS[rowKey]}>
        {POMODORO_ROW_FLOOR_LABEL}
      </FieldLabel>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={POMODORO_ROW_FLOOR_MIN}
          max={POMODORO_ROW_FLOOR_MAX}
          value={floor}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...settings,
              // An emptied box is zero, which is "always show it".
              floor: Number(event.target.value) || 0,
            })
          }
        />
        <span className="text-sm text-muted-foreground">
          {POMODORO_ROW_FLOOR_UNITS[rowKey]}
        </span>
      </div>
    </div>
  )
}

export function FocusHoursRowPanel(props: AppFrontPageRowEditorProps) {
  return <FloorPanel rowKey="focus-hours" {...props} />
}

export function OpenRoomsRowPanel(props: AppFrontPageRowEditorProps) {
  return <FloorPanel rowKey="open-rooms" {...props} />
}
