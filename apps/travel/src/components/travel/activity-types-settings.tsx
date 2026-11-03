import * as React from "react"
import { ArrowDownIcon, ArrowUpIcon, Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react"

import { useReportedSaveStatus } from "@/components/settings/use-reported-save-status"
import { TYPE_ICON_COMPONENT } from "@/components/travel/type-icon"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { LoadingRow } from "@/components/ui/loading-row"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  addActivityType,
  countActivityTypeUse,
  getActivityTypes,
  orderActivityTypes,
  removeActivityType,
  saveActivityType,
} from "@/lib/api/travel/types"
import {
  MAX_TYPES,
  TYPE_COLORS,
  TYPE_COLOR_BAR,
  TYPE_COLOR_LABEL,
  TYPE_COLOR_TEXT,
  TYPE_ICONS,
  TYPE_ICON_LABEL,
  type ActivityType,
  type TypeColor,
  type TypeIcon,
} from "@/lib/travel/activity-types"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/** Wait this long after the last letter before a name saves (UI standard, "Settings"). */
const TYPING_SAVE_MS = 700

// Held for the page's life, so moving between Settings tabs never shows a load (UI standard, "Settings").
let heldTypes: ActivityType[] | null = null

/**
 * Settings → App settings → Activity types (task part 19; Tyler, 2 Nov 2026:
 * each person edits their own). Every change saves itself: a name 700ms after
 * the last letter or when the field is left, an icon, colour or order the
 * moment it's picked. Only removing a type asks first, saying how many
 * activities move to Other. Other itself can't be removed.
 */
export default function ActivityTypesSettings() {
  const [types, setTypesState] = React.useState<ActivityType[] | null>(heldTypes)
  const setTypes = React.useCallback((next: ActivityType[]) => {
    heldTypes = next
    setTypesState(next)
  }, [])
  const setStatus = useReportedSaveStatus()
  const [removing, setRemoving] = React.useState<{ type: ActivityType; uses: number } | null>(null)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    let alive = true
    getActivityTypes()
      .then((loaded) => {
        if (alive) setTypes(loaded)
      })
      .catch((error: unknown) => showErrorToast(getTravelErrorMessage(error)))
    return () => {
      alive = false
    }
  }, [setTypes])

  /** Runs one save, says Saving… then Saved, and on a refusal puts the list back and says why. */
  const saveWith = React.useCallback(
    async (next: ActivityType[], work: () => Promise<unknown>) => {
      const before = heldTypes ?? []
      setTypes(next)
      setStatus("saving")
      try {
        await work()
        setStatus("saved")
      } catch (error) {
        setTypes(before)
        setStatus({ blocked: getTravelErrorMessage(error) })
        showErrorToast(getTravelErrorMessage(error))
      }
    },
    [setStatus, setTypes]
  )

  if (!types) return <LoadingRow label="Loading activity types" />

  const change = (type: ActivityType, patch: Partial<Pick<ActivityType, "name" | "icon" | "color">>) =>
    saveWith(
      types.map((item) => (item.id === type.id ? { ...item, ...patch } : item)),
      () => saveActivityType({ typeId: type.id, ...patch })
    )

  const move = (index: number, by: -1 | 1) => {
    const next = [...types]
    const [moved] = next.splice(index, 1)
    next.splice(index + by, 0, moved)
    void saveWith(next, () => orderActivityTypes(next.map((type) => type.id)))
  }

  async function add() {
    setBusy(true)
    setStatus("saving")
    try {
      const made = await addActivityType({ name: "New type", icon: "star", color: "pink" })
      setTypes([...(heldTypes ?? []), made])
      setStatus("saved")
    } catch (error) {
      setStatus({ blocked: getTravelErrorMessage(error) })
      showErrorToast(getTravelErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function askRemove(type: ActivityType) {
    try {
      setRemoving({ type, uses: await countActivityTypeUse(type.id) })
    } catch (error) {
      showErrorToast(getTravelErrorMessage(error))
    }
  }

  async function remove(type: ActivityType) {
    setRemoving(null)
    // Its activities moved to Other on the server, so the list is read again.
    await saveWith(
      (heldTypes ?? []).filter((item) => item.id !== type.id),
      () => removeActivityType(type.id)
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity types</CardTitle>
        <CardDescription>
          The kinds of activity on your trips, each with its own icon and colour on the cards. Other always stays: a
          removed type's activities move there.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        <ul className="grid gap-2">
          {types.map((type, index) => (
            <TypeRow
              key={type.id}
              type={type}
              first={index === 0}
              last={index === types.length - 1}
              onChange={(patch) => void change(type, patch)}
              onMove={(by) => move(index, by)}
              onRemove={() => void askRemove(type)}
            />
          ))}
        </ul>
        <div>
          <Button type="button" variant="outline" disabled={busy || types.length >= MAX_TYPES} onClick={() => void add()}>
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
            Add type
          </Button>
        </div>
      </CardContent>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => (open ? undefined : setRemoving(null))}
        title={`Remove ${removing?.type.name ?? "this type"}?`}
        description={
          removing && removing.uses > 0
            ? `${removing.uses === 1 ? "1 activity uses" : `${removing.uses} activities use`} it. ${removing.uses === 1 ? "It moves" : "They move"} to Other.`
            : "No activity uses it."
        }
        confirmLabel="Remove type"
        destructive
        onConfirm={() => (removing ? void remove(removing.type) : undefined)}
      />
    </Card>
  )
}

function TypeRow({
  type,
  first,
  last,
  onChange,
  onMove,
  onRemove,
}: {
  type: ActivityType
  first: boolean
  last: boolean
  onChange: (patch: Partial<Pick<ActivityType, "name" | "icon" | "color">>) => void
  onMove: (by: -1 | 1) => void
  onRemove: () => void
}) {
  const [name, setName] = React.useState(type.name)
  const timer = React.useRef<number | null>(null)
  const idBase = `type-${type.id}`
  const isOther = type.builtin === "other"

  function commit(next: string) {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    if (!next.trim()) {
      showErrorToast("Give the type a name.")
      return
    }
    if (next.trim() !== type.name) onChange({ name: next.trim() })
  }

  return (
    <li className="flex flex-wrap items-center gap-2">
      <Select value={type.icon} onValueChange={(value) => onChange({ icon: value as TypeIcon })}>
        <SelectTrigger id={`${idBase}-icon`} aria-label={`${type.name} icon`} className="w-16">
          <SelectValue>
            <IconOf icon={type.icon} color={type.color} />
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {TYPE_ICONS.map((icon) => (
            <SelectItem key={icon} value={icon}>
              <span className="flex items-center gap-2">
                <IconOf icon={icon} color={type.color} />
                {TYPE_ICON_LABEL[icon]}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={type.color} onValueChange={(value) => onChange({ color: value as TypeColor })}>
        <SelectTrigger id={`${idBase}-color`} aria-label={`${type.name} colour`} className="w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TYPE_COLORS.map((color) => (
            <SelectItem key={color} value={color}>
              <span className="flex items-center gap-2">
                <span aria-hidden className={cn("size-3 rounded-full", TYPE_COLOR_BAR[color])} />
                {TYPE_COLOR_LABEL[color]}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        id={`${idBase}-name`}
        aria-label="Type name"
        className="min-w-32 flex-1"
        value={name}
        maxLength={40}
        aria-invalid={!name.trim() || undefined}
        onChange={(event) => {
          const next = event.target.value
          setName(next)
          if (timer.current !== null) window.clearTimeout(timer.current)
          timer.current = window.setTimeout(() => commit(next), TYPING_SAVE_MS)
        }}
        onBlur={() => commit(name)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            commit(name)
          }
        }}
      />
      <div className="flex items-center">
        <Button type="button" variant="ghost" size="icon" aria-label={`Move ${type.name} up`} disabled={first} onClick={() => onMove(-1)}>
          <ArrowUpIcon className="size-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" aria-label={`Move ${type.name} down`} disabled={last} onClick={() => onMove(1)}>
          <ArrowDownIcon className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={isOther ? "Other can't be removed" : `Remove ${type.name}`}
          disabled={isOther}
          onClick={onRemove}
        >
          <Trash2Icon className="size-4" />
        </Button>
      </div>
    </li>
  )
}

function IconOf({ icon, color }: { icon: TypeIcon; color: TypeColor }) {
  const Icon = TYPE_ICON_COMPONENT[icon]
  return <Icon aria-hidden className={cn("size-4", TYPE_COLOR_TEXT[color])} />
}
