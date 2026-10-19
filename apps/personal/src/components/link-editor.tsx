import * as React from "react"
import { Trash2Icon } from "lucide-react"

import { IconPicker } from "@/components/icon-picker"
import { Button } from "@/components/ui/button"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  LINK_OPENS,
  parseAppUrl,
  placeKey,
  type LinkIcon,
  type LinkOpens,
  type Place,
} from "@/lib/menu"

export type LinkDraft = {
  label: string
  url: string
  /** A Lucide icon's name, or undefined for no icon. */
  icon: LinkIcon | undefined
  opens: LinkOpens
  /** Whether Personal opens on this link's screen. */
  start: boolean
  /** Whether this link's screen stays loaded once opened. */
  stayLoaded: boolean
}

const OPENS_LABELS: Record<LinkOpens, string> = {
  panel: "The middle panel",
  tab: "Its own tab",
}

export type PlaceChoice = { place: Place; label: string }

/**
 * The form inside a link's pop-up: its name, the address of the screen it
 * opens, its icon, where it sits, where it opens, whether Personal opens on
 * it, and whether its screen stays loaded. The same form adds a link and edits
 * one.
 */
export function LinkEditor({
  initial,
  stayLoadedElsewhere,
  place,
  places,
  openUrl,
  submitLabel,
  onSubmit,
  onDelete,
  onCancel,
}: {
  initial: LinkDraft
  /** The name of another link whose screen stays loaded now, which this one would take over from. */
  stayLoadedElsewhere: string | null
  place: Place
  places: PlaceChoice[]
  /** The screen open in the middle panel, offered as the address. */
  openUrl: string | null
  submitLabel: string
  onSubmit: (draft: LinkDraft, place: Place) => void
  onDelete?: () => void
  onCancel: () => void
}) {
  const id = React.useId()
  const [draft, setDraft] = React.useState(initial)
  const [where, setWhere] = React.useState(placeKey(place))
  const [errors, setErrors] = React.useState<{ label?: string; url?: string }>({})

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const next = {
      label: draft.label.trim() ? undefined : "Give the link a name.",
      url: parseAppUrl(draft.url)
        ? undefined
        : "Use a full address, such as http://localhost:3015/admin/posts.",
    }
    setErrors(next)
    if (next.label || next.url) return
    const chosen = places.find((choice) => placeKey(choice.place) === where)
    onSubmit(
      { ...draft, label: draft.label.trim(), url: parseAppUrl(draft.url)!.href },
      chosen?.place ?? place
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-label`}>Name</Label>
        <Input
          id={`${id}-label`}
          autoFocus
          value={draft.label}
          maxLength={60}
          placeholder="Posts"
          aria-invalid={Boolean(errors.label)}
          onChange={(event) => setDraft({ ...draft, label: event.target.value })}
        />
        {errors.label ? <p className="text-xs text-destructive">{errors.label}</p> : null}
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`${id}-url`}>Address</Label>
          {openUrl && openUrl !== draft.url ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => setDraft({ ...draft, url: openUrl })}
            >
              Use the open page
            </Button>
          ) : null}
        </div>
        <Input
          id={`${id}-url`}
          value={draft.url}
          placeholder="http://localhost:3015/admin/posts"
          aria-invalid={Boolean(errors.url)}
          onChange={(event) => setDraft({ ...draft, url: event.target.value })}
        />
        {errors.url ? <p className="text-xs text-destructive">{errors.url}</p> : null}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor={`${id}-icon`}>Icon</Label>
          <IconPicker
            id={`${id}-icon`}
            value={draft.icon}
            onValueChange={(icon) => setDraft({ ...draft, icon })}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor={`${id}-place`}>Shows in</Label>
          <Select value={where} onValueChange={setWhere}>
            <SelectTrigger id={`${id}-place`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {places.map((choice) => (
                <SelectItem key={placeKey(choice.place)} value={placeKey(choice.place)}>
                  {choice.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor={`${id}-opens`}>Opens in</Label>
          <Select
            value={draft.opens}
            onValueChange={(opens) => setDraft({ ...draft, opens: opens as LinkOpens })}
          >
            <SelectTrigger id={`${id}-opens`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LINK_OPENS.map((opens) => (
                <SelectItem key={opens} value={opens}>
                  {OPENS_LABELS[opens]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {/* A link that opens in its own tab never fills the panel, so it can't
          be the screen Personal opens on or the one that stays loaded. */}
      {draft.opens === "panel" ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={`${id}-start`}>Personal opens here</Label>
            <Switch
              id={`${id}-start`}
              checked={draft.start}
              onCheckedChange={(start) => setDraft({ ...draft, start })}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <FieldLabel
              htmlFor={`${id}-stay`}
              hint={`Keeps this screen loaded once opened, however many others you open after it. One link at a time${stayLoadedElsewhere ? `, so this takes over from ${stayLoadedElsewhere}` : ""}.`}
            >
              Stay loaded
            </FieldLabel>
            <Switch
              id={`${id}-stay`}
              checked={draft.stayLoaded}
              onCheckedChange={(stayLoaded) => setDraft({ ...draft, stayLoaded })}
            />
          </div>
        </>
      ) : null}
      <div className="flex items-center gap-2">
        {onDelete ? (
          <Button type="button" variant="ghost" size="sm" onClick={onDelete}>
            <Trash2Icon />
            Delete
          </Button>
        ) : null}
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="sm">
            {submitLabel}
          </Button>
        </div>
      </div>
    </form>
  )
}
