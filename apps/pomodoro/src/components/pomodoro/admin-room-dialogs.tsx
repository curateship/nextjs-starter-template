import * as React from "react"
import { Loader2Icon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SettingsSwitchRow } from "@/components/settings/settings-switch-row"
import { RhythmMinutesFields } from "@/components/pomodoro/rhythm-minutes-fields"
import {
  getRoomsAdminErrorMessage,
  loadPomodoroRoom,
  savePomodoroRoom,
  savePomodoroRoomPreset,
  type AdminRoomItem,
  type RoomPreset,
} from "@/lib/api/pomodoro/admin-rooms"
import type { MediaCatalog } from "@/lib/pomodoro/catalog"
import { catalogTags } from "@/lib/pomodoro/media-pool"
import { showErrorToast } from "@/lib/toast/error-toast"
import { useHeldWhileClosing } from "@/lib/pomodoro/use-held-while-closing"

/**
 * The rooms admin's two windows (admin task 04): a room's own settings, and
 * a house preset hosts pick from. See `workspace/docs/rooms-admin.md`.
 */

/** A refused pair names its own problem; anything else goes through the lookup. */
function roomErrorMessage(error: unknown) {
  const text = error instanceof Error ? error.message : ""
  const marker = "ROOM_PAIR_REJECTED: "
  const at = text.indexOf(marker)
  return at >= 0 ? text.slice(at + marker.length) : getRoomsAdminErrorMessage(error)
}

/**
 * The sound and theme a room gets: one item, shuffle, or one tag, the same
 * choices a host has (`rooms-page.tsx`).
 */
function RoomPairFields({
  idPrefix,
  catalog,
  sound,
  background,
  onSound,
  onBackground,
  optional = false,
}: {
  idPrefix: string
  catalog: MediaCatalog
  sound: string
  background: string
  onSound: (value: string) => void
  onBackground: (value: string) => void
  /** A preset may leave the pair to the host. */
  optional?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-4">
      <div className="grid gap-2">
        <FieldLabel htmlFor={`${idPrefix}-sound`}>Sound</FieldLabel>
        <Select value={sound || "none"} onValueChange={(value) => onSound(value === "none" ? "" : value)}>
          <SelectTrigger id={`${idPrefix}-sound`} className="w-fit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {optional ? <SelectItem value="none">Left to the host</SelectItem> : null}
            <SelectItem value="shuffle">Shuffle every sound</SelectItem>
            {catalogTags(catalog.sounds).map(({ tag }) => (
              <SelectItem key={`tag-${tag}`} value={`tags:${tag}`}>
                Only {tag} sounds
              </SelectItem>
            ))}
            {catalog.sounds.map((item) => (
              <SelectItem key={item.key} value={`curated:${item.key}`}>
                {item.label}
                {item.locked ? " · Pro" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <FieldLabel htmlFor={`${idPrefix}-theme`}>Theme</FieldLabel>
        <Select
          value={background || "none"}
          onValueChange={(value) => onBackground(value === "none" ? "" : value)}
        >
          <SelectTrigger id={`${idPrefix}-theme`} className="w-fit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {optional ? <SelectItem value="none">Left to the host</SelectItem> : null}
            <SelectItem value="shuffle">Shuffle every theme</SelectItem>
            {catalogTags(catalog.themes).map(({ tag }) => (
              <SelectItem key={`tag-${tag}`} value={`tags:${tag}`}>
                Only {tag} themes
              </SelectItem>
            ))}
            {catalog.themes.map((item) => (
              <SelectItem key={item.key} value={`scene:${item.key}`}>
                {item.label}
                {item.locked ? " · Pro" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

type RoomDraft = Omit<AdminRoomItem, "id" | "slug" | "phase" | "featuredAt" | "closedAt" | "hostName" | "sound" | "background" | "visibility"> & {
  visibility: "public" | "unlisted"
  sound: string
  background: string
  featured: boolean
}

function roomDraft(room: AdminRoomItem): RoomDraft {
  return {
    name: room.name,
    visibility: room.visibility === "unlisted" ? "unlisted" : "public",
    focusMinutes: room.focusMinutes,
    shortBreakMinutes: room.shortBreakMinutes,
    longBreakMinutes: room.longBreakMinutes,
    autoStart: room.autoStart,
    sound: room.sound ?? "",
    background: room.background ?? "",
    featured: room.featuredAt !== null,
  }
}

/**
 * A room's settings, from its name or its cog on Focus rooms. A change of
 * rhythm applies from the next phase, so a focus under way keeps its time, and
 * the host hears about it in the bell.
 */
export function AdminRoomDialog({
  openId,
  onClose,
  onSaved,
}: {
  openId: string | undefined
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [loaded, setLoaded] = React.useState<{
    room: AdminRoomItem
    catalog: MediaCatalog
  } | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState<RoomDraft | null>(null)
  const [initial, setInitial] = React.useState<RoomDraft | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [nameInvalid, setNameInvalid] = React.useState(false)
  const nameId = React.useId()
  const visibilityId = React.useId()
  const autoId = React.useId()
  const featuredId = React.useId()

  // Closing clears nothing, so the window fades out as it was.
  const [shownFor, setShownFor] = React.useState<string | undefined>(undefined)
  if (shownFor !== openId && openId === undefined) setShownFor(undefined)
  else if (shownFor !== openId) {
    setShownFor(openId)
    setLoaded(null)
    setLoadError(null)
    setDraft(null)
    setInitial(null)
    setNameInvalid(false)
  }

  React.useEffect(() => {
    if (!openId) return
    let live = true
    loadPomodoroRoom(openId).then(
      (answer) => {
        if (!live) return
        setLoaded(answer)
        setDraft(roomDraft(answer.room))
        setInitial(roomDraft(answer.room))
      },
      (error) => {
        if (live) setLoadError(getRoomsAdminErrorMessage(error))
      }
    )
    return () => {
      live = false
    }
  }, [openId])

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  const update = <K extends keyof RoomDraft>(key: K, value: RoomDraft[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current))

  const save = async () => {
    if (!draft || !loaded) return
    if (!draft.name.trim()) {
      setNameInvalid(true)
      showErrorToast("Give the room a name.")
      return
    }
    setSaving(true)
    try {
      await savePomodoroRoom({ id: loaded.room.id, ...draft })
      toast.success("Room saved. The people in it see the change.")
      await onSaved()
      onClose()
    } catch (error) {
      showErrorToast(roomErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormDialog open={openId !== undefined} dirty={dirty} busy={saving} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>{loaded?.room.name ?? "Room"}</DialogTitle>
            <DialogDescription>
              {loaded
                ? `Hosted by ${loaded.room.hostName}. New minutes apply from the next phase, so a focus under way keeps its time. The host is told.`
                : "Reading the room…"}
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
          >
            <DialogBody>
              {loadError ? (
                <p role="alert" className="text-sm text-destructive">
                  {loadError}
                </p>
              ) : !draft || !loaded ? (
                <div className="flex justify-center py-10">
                  <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>Room</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                      <div className="flex flex-wrap gap-4">
                        <div className="grid min-w-56 flex-1 gap-2">
                          <FieldLabel htmlFor={nameId}>Name</FieldLabel>
                          <Input
                            id={nameId}
                            maxLength={80}
                            value={draft.name}
                            aria-invalid={nameInvalid || undefined}
                            onChange={(event) => {
                              setNameInvalid(false)
                              update("name", event.target.value)
                            }}
                          />
                        </div>
                        <div className="grid gap-2">
                          <FieldLabel htmlFor={visibilityId}>Who can find it</FieldLabel>
                          <Select
                            value={draft.visibility}
                            onValueChange={(value) =>
                              update("visibility", value === "unlisted" ? "unlisted" : "public")
                            }
                          >
                            <SelectTrigger id={visibilityId} className="w-fit">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="public">Listed on Browse rooms</SelectItem>
                              <SelectItem value="unlisted">Link only</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <SettingsSwitchRow
                        id={featuredId}
                        checked={draft.featured}
                        onCheckedChange={(value) => update("featured", value)}
                        label="Featured: first on Browse rooms, with a label"
                      />
                    </CardContent>
                  </Card>
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>Rhythm</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                      <RhythmMinutesFields
                        idPrefix="admin-room"
                        focusMinutes={draft.focusMinutes}
                        shortBreakMinutes={draft.shortBreakMinutes}
                        longBreakMinutes={draft.longBreakMinutes}
                        onFocusMinutes={(value) => update("focusMinutes", value)}
                        onShortBreakMinutes={(value) => update("shortBreakMinutes", value)}
                        onLongBreakMinutes={(value) => update("longBreakMinutes", value)}
                      />
                      <SettingsSwitchRow
                        id={autoId}
                        checked={draft.autoStart}
                        onCheckedChange={(value) => update("autoStart", value)}
                        label="Start the next focus by itself after a break"
                      />
                    </CardContent>
                  </Card>
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>Sound and theme</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                      <RoomPairFields
                        idPrefix="admin-room"
                        catalog={loaded.catalog}
                        sound={draft.sound}
                        background={draft.background}
                        onSound={(value) => update("sound", value)}
                        onBackground={(value) => update("background", value)}
                      />
                    </CardContent>
                  </Card>
                </>
              )}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={requestClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !draft}>
                {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}

type PresetDraft = {
  name: string
  focusMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number
  autoStart: boolean
  sound: string
  background: string
}

const EMPTY_PRESET: PresetDraft = {
  name: "",
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  autoStart: false,
  sound: "",
  background: "",
}

function presetDraft(preset: RoomPreset): PresetDraft {
  return {
    name: preset.name,
    focusMinutes: preset.focusMinutes,
    shortBreakMinutes: preset.shortBreakMinutes,
    longBreakMinutes: preset.longBreakMinutes,
    autoStart: preset.autoStart,
    sound: preset.sound ?? "",
    background: preset.background ?? "",
  }
}

/**
 * A house preset: a named room setup hosts pick from above their own. Changing
 * one later does not change rooms already made from it.
 */
export function RoomPresetDialog({
  openId,
  presets,
  catalog,
  onClose,
  onSaved,
  onDelete,
}: {
  /** A preset's id, "new", or undefined while shut. */
  openId: string | undefined
  presets: RoomPreset[]
  catalog: MediaCatalog
  onClose: () => void
  onSaved: () => Promise<void>
  onDelete: (id: string) => void
}) {
  // Kept while the window fades out, so it never redraws as "New preset".
  const heldId = useHeldWhileClosing(openId)
  const editing = presets.find((preset) => preset.id === heldId) ?? null
  const start = editing ? presetDraft(editing) : EMPTY_PRESET
  const [draft, setDraft] = React.useState<PresetDraft>(start)
  const [shownFor, setShownFor] = React.useState<string | undefined>(undefined)
  const [saving, setSaving] = React.useState(false)
  const [nameInvalid, setNameInvalid] = React.useState(false)
  const nameId = React.useId()
  const autoId = React.useId()
  if (shownFor !== openId && openId === undefined) setShownFor(undefined)
  else if (shownFor !== openId) {
    setShownFor(openId)
    setDraft(start)
    setNameInvalid(false)
  }
  const dirty = JSON.stringify(draft) !== JSON.stringify(start)
  const update = <K extends keyof PresetDraft>(key: K, value: PresetDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const save = async () => {
    if (!draft.name.trim()) {
      setNameInvalid(true)
      showErrorToast("Give the preset a name.")
      return
    }
    setSaving(true)
    try {
      await savePomodoroRoomPreset({
        id: editing?.id ?? null,
        ...draft,
        sound: draft.sound || null,
        background: draft.background || null,
      })
      toast.success(editing ? "Changes saved." : "Preset created.")
      await onSaved()
      onClose()
    } catch (error) {
      showErrorToast(roomErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormDialog open={openId !== undefined} dirty={dirty} busy={saving} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>{editing ? editing.name : "New preset"}</DialogTitle>
            <DialogDescription>
              Hosts see it first in the Rhythm picker when they open a room.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Preset</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <FieldLabel htmlFor={nameId}>Name</FieldLabel>
                    <Input
                      id={nameId}
                      maxLength={60}
                      value={draft.name}
                      placeholder="Morning deep work"
                      aria-invalid={nameInvalid || undefined}
                      onChange={(event) => {
                        setNameInvalid(false)
                        update("name", event.target.value)
                      }}
                    />
                  </div>
                  <RhythmMinutesFields
                    idPrefix="preset"
                    focusMinutes={draft.focusMinutes}
                    shortBreakMinutes={draft.shortBreakMinutes}
                    longBreakMinutes={draft.longBreakMinutes}
                    onFocusMinutes={(value) => update("focusMinutes", value)}
                    onShortBreakMinutes={(value) => update("shortBreakMinutes", value)}
                    onLongBreakMinutes={(value) => update("longBreakMinutes", value)}
                  />
                  <SettingsSwitchRow
                    id={autoId}
                    checked={draft.autoStart}
                    onCheckedChange={(value) => update("autoStart", value)}
                    label="Start the next focus by itself after a break"
                  />
                  <RoomPairFields
                    idPrefix="preset"
                    catalog={catalog}
                    sound={draft.sound}
                    background={draft.background}
                    onSound={(value) => update("sound", value)}
                    onBackground={(value) => update("background", value)}
                    optional
                  />
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              {editing ? (
                <Button
                  type="button"
                  variant="destructive"
                  className="mr-auto"
                  disabled={saving}
                  onClick={() => {
                    onDelete(editing.id)
                    onClose()
                  }}
                >
                  <Trash2Icon className="size-4" />
                  Delete
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={requestClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
                {editing ? "Save changes" : "Create preset"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
