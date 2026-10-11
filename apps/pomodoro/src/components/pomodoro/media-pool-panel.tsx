import * as React from "react"
import { CheckIcon, ChevronDownIcon, ListFilterIcon } from "lucide-react"
import { toast } from "sonner"

import { Checkbox } from "@/components/ui/checkbox"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { useProductAuth } from "@/lib/pomodoro/auth-state"
import { focusRing } from "@/lib/layout/focus-ring"
import { pillTabsList, pillTabsTrigger } from "@/lib/pomodoro/pill-tabs"
import {
  catalogTags,
  describeTags,
  ownOnlyTags,
  ownTagCount,
  tagsFit,
  type MediaPool,
} from "@/lib/pomodoro/media-pool"
import { PRO_PERKS } from "@/lib/pomodoro/pro"
import {
  addBackgroundPoolToPersonalRoom,
  addBackgroundToPersonalRoom,
  addSoundPoolToPersonalRoom,
  addSoundToPersonalRoom,
  useRoomMedia,
} from "@/lib/pomodoro/room-media-store"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * The tag filter and the Shuffle switch beside the Sounds and Theme pages'
 * title. See `workspace/docs/shuffle-and-tags.md`.
 *
 * Tyler, 9 Oct 2026: "remove tag tab and just list by grid and add a filter
 * dropdown to filter the tags and a checkbox beside each tag filter to add to
 * shuffle", then the design: one box per tag under "Show & shuffle". A ticked
 * tag is shown in the grid, and while Shuffle is on, shuffle plays only the
 * ticked tags. Every tag ticked is "All tags": every card, and shuffle from
 * everything.
 *
 * `ticked` is null for every tag, else the tags ticked. The page holds it,
 * because the grid and both controls read it.
 *
 * The member's own tagged files join too (uploads-and-sharing task 08,
 * Part 1). A tag only their files carry sits in a "Your files" group under the
 * catalogue's tags, and starts unticked, so "All tags" still means the
 * catalogue alone and nothing changes for anybody who never ticks one. A tag
 * the catalogue also has is one tag, and ticking it brings in both.
 */

type Kind = "sound" | "background"

const NOUN: Record<Kind, { one: string; many: string }> = {
  sound: { one: "sound", many: "sounds" },
  background: { one: "theme", many: "themes" },
}

/**
 * The Leaderboard's round tab row, so both controls match the pills beside
 * that page's title (Tyler, 9 Oct 2026: "should match the button like the
 * leaderboard"): a 48px tray with a 36px pill inside.
 */
const trayClass = cn(pillTabsList, "inline-flex items-center bg-muted/60")
const innerClass = cn(pillTabsTrigger, "inline-flex items-center gap-2 font-medium")

function usePersonalPool(kind: Kind) {
  const media = useRoomMedia()
  return kind === "sound" ? media.personalSoundPool : media.personalBackgroundPool
}

function savePool(kind: Kind, pool: MediaPool) {
  return kind === "sound"
    ? addSoundPoolToPersonalRoom(pool)
    : addBackgroundPoolToPersonalRoom(pool)
}

/** Shuffle over the ticked tags, or over everything when every tag is ticked. */
function poolFor(ticked: string[] | null): MediaPool {
  return ticked ? { mode: "tags", tags: ticked } : { mode: "shuffle" }
}

export function MediaTagFilter({
  kind,
  ticked,
  onChange,
}: {
  kind: Kind
  ticked: string[] | null
  onChange: (ticked: string[] | null) => void
}) {
  const media = useRoomMedia()
  const pool = usePersonalPool(kind)
  const [busy, setBusy] = React.useState(false)
  const items = kind === "sound" ? media.catalog.sounds : media.catalog.themes
  const own = kind === "sound" ? media.own.sounds : media.own.backgrounds
  const tags = catalogTags(items)
  const all = tags.map(({ tag }) => tag)
  const ownTags = ownOnlyTags(own, all)

  if (!tags.length && !ownTags.length) return null

  // "All tags" (null) is every catalogue tag; a tag of your own files is
  // ticked only when you ticked it.
  const isTicked = (tag: string) =>
    all.includes(tag) ? ticked === null || ticked.includes(tag) : (ticked ?? []).includes(tag)

  const toggle = async (tag: string) => {
    const current = ticked ?? all
    const next = current.includes(tag)
      ? current.filter((value) => value !== tag)
      : [...current, tag]
    const nextTicked =
      all.every((value) => next.includes(value)) && next.every((value) => all.includes(value))
        ? null
        : next
    onChange(nextTicked)
    // Shuffle off: the boxes only choose what the grid shows.
    if (pool === null) return
    if (nextTicked && !tagsFit(nextTicked)) {
      showErrorToast("That is too many tags to shuffle. Untick a few more.")
      return
    }
    setBusy(true)
    try {
      await savePool(kind, poolFor(nextTicked))
      toast.success(
        nextTicked
          ? `Shuffle plays only ${describeTags(nextTicked)} ${NOUN[kind].many}.`
          : `Shuffle plays every ${NOUN[kind].one}.`
      )
    } catch {
      showErrorToast("That did not save. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const label =
    ticked === null ? "All tags" : ticked.length === 1 ? ticked[0] : `${ticked.length} tags`
  // The grid shows catalogue cards only, so the last catalogue tag stays
  // ticked whatever else is.
  const tickedCatalogue = ticked === null ? all.length : ticked.filter((tag) => all.includes(tag)).length

  const row = ({
    tag,
    count,
    proOnly,
    last,
  }: {
    tag: string
    count: number
    proOnly: boolean
    last: boolean
  }) => {
    const on = isTicked(tag)
    const blocked = proOnly || last
    return (
      <DisabledReason
        key={tag}
        disabled={blocked}
        reason={proOnly ? PRO_PERKS.premiumMedia.lockedReason : "Keep at least one tag ticked."}
      >
        <label
          className={cn(
            "flex cursor-pointer items-center gap-3 rounded-lg px-1.5 py-2 text-[15px] hover:bg-[rgba(var(--p-fg-rgb),0.07)]",
            blocked && "cursor-not-allowed opacity-60"
          )}
        >
          <Checkbox
            checked={on && !proOnly}
            disabled={blocked || busy}
            onCheckedChange={() => void toggle(tag)}
            className="size-[18px] rounded-[5px] border-[rgba(var(--p-fg-rgb),0.3)] data-checked:border-[var(--p-accent)] data-checked:bg-[var(--p-accent)] data-checked:text-white dark:data-checked:bg-[var(--p-accent)]"
          />
          <span className="min-w-0 flex-1 truncate">{tag}</span>
          <span className="font-mono text-xs text-muted-foreground">
            {proOnly ? "Pro" : count}
          </span>
        </label>
      </DisabledReason>
    )
  }

  return (
    <Popover>
      <div className={trayClass}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Show and shuffle ${NOUN[kind].many} by tag: ${label}`}
            className={cn(
              innerClass,
              "cursor-pointer text-foreground hover:bg-background/60",
              focusRing
            )}
          >
            <ListFilterIcon className="size-[18px] shrink-0" aria-hidden="true" />
            <span className="max-w-40 truncate">{label}</span>
            <ChevronDownIcon className="size-4 shrink-0" aria-hidden="true" />
          </button>
        </PopoverTrigger>
      </div>
      <PopoverContent align="end" sideOffset={8} className="w-60 gap-1 rounded-2xl p-3">
        <p className="px-1.5 pt-1 pb-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-foreground/75">
          Show &amp; shuffle
        </p>
        {/* The height goes on the scrolling box itself: on the outside it
            only trims the frame and the last tags hang out of the popover. */}
        <ScrollArea viewportClassName="max-h-72">
          <div className="flex flex-col pr-2">
            {tags.map(({ tag, count, free }) => {
              const mine = ownTagCount(own, tag)
              return row({
                tag,
                count: (media.canUsePremiumMedia ? count : free) + mine,
                proOnly: !media.canUsePremiumMedia && free === 0 && mine === 0,
                // The grid can never be emptied by a box.
                last: isTicked(tag) && ticked !== null && tickedCatalogue === 1,
              })
            })}
            {ownTags.length ? (
              <>
                <p className="px-1.5 pt-3 pb-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-foreground/75">
                  Your files
                </p>
                {ownTags.map(({ tag, count }) =>
                  row({ tag, count, proOnly: false, last: false })
                )}
              </>
            ) : null}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Shuffle for your own room: on, a random sound (or theme) from the ticked
 * tags, or from everything your plan allows when every tag is ticked, a new
 * one when the sound ends. Off, the one playing now stays as your pick. A
 * guest, and a member who has not picked, starts with it on
 * (`media.shuffleUnset`).
 */
export function MediaShuffleSwitch({
  kind,
  ticked,
}: {
  kind: Kind
  ticked: string[] | null
}) {
  const media = useRoomMedia()
  const { authenticated } = useProductAuth()
  const [busy, setBusy] = React.useState(false)
  const id = React.useId()
  const pool = usePersonalPool(kind)
  const on = pool !== null

  const change = async (next: boolean) => {
    if (next && ticked && !tagsFit(ticked)) {
      showErrorToast("That is too many tags to shuffle. Untick a few first.")
      return
    }
    setBusy(true)
    try {
      if (next) {
        await savePool(kind, poolFor(ticked))
        toast.success(
          ticked
            ? `Shuffle plays only ${describeTags(ticked)} ${NOUN[kind].many}.`
            : authenticated
              ? `Your personal room shuffles every ${NOUN[kind].one}.`
              : `Shuffling ${NOUN[kind].many} for this visit.`
        )
      } else if (kind === "sound") {
        await addSoundToPersonalRoom(media.personalSound)
      } else {
        await addBackgroundToPersonalRoom(media.personalBackground)
      }
    } catch {
      showErrorToast("That did not save. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={cn(trayClass, "pr-3")}>
      <Label htmlFor={id} className={cn(innerClass, "cursor-pointer text-foreground")}>
        Shuffle
      </Label>
      <Switch
        id={id}
        checked={on}
        disabled={busy}
        aria-label={`Shuffle ${NOUN[kind].many}`}
        onCheckedChange={(next) => void change(next)}
      />
    </div>
  )
}

/**
 * The tag filter for "Shared by members" and Saved, in the same place and
 * the same round tray as the catalogue's, so switching tabs moves nothing
 * beside it (Tyler, 10 Oct 2026). One tag at a time, or all of them; it only
 * narrows the grid and never changes what shuffle plays.
 */
export function SharedTagFilter({
  kind,
  tags,
  value,
  onChange,
}: {
  kind: Kind
  /** The tags on the shared files of this kind. */
  tags: string[]
  value: string | null
  onChange: (tag: string | null) => void
}) {
  const [open, setOpen] = React.useState(false)
  const choices = value && !tags.includes(value) ? [value, ...tags] : tags
  const pick = (tag: string | null) => {
    onChange(tag)
    setOpen(false)
  }
  const option = (tag: string | null) => {
    const on = value === tag
    return (
      <button
        key={tag ?? "__all"}
        type="button"
        role="menuitemradio"
        aria-checked={on}
        onClick={() => pick(tag)}
        className={cn(
          "flex items-center gap-3 rounded-lg px-1.5 py-2 text-left text-[15px] hover:bg-[rgba(var(--p-fg-rgb),0.07)]",
          focusRing
        )}
      >
        <CheckIcon
          className={cn("size-4 shrink-0 text-[var(--p-accent)]", !on && "invisible")}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate">{tag ?? "All tags"}</span>
      </button>
    )
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={trayClass}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Show shared ${NOUN[kind].many} by tag: ${value ?? "All tags"}`}
            className={cn(innerClass, "cursor-pointer text-foreground hover:bg-background/60", focusRing)}
          >
            <ListFilterIcon className="size-[18px] shrink-0" aria-hidden="true" />
            <span className="max-w-40 truncate">{value ?? "All tags"}</span>
            <ChevronDownIcon className="size-4 shrink-0" aria-hidden="true" />
          </button>
        </PopoverTrigger>
      </div>
      <PopoverContent align="end" sideOffset={8} className="w-60 gap-1 rounded-2xl p-3">
        <p className="px-1.5 pt-1 pb-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-foreground/75">
          Shared tags
        </p>
        <ScrollArea viewportClassName="max-h-72">
          <div role="menu" className="flex flex-col pr-2">
            {option(null)}
            {choices.map((tag) => option(tag))}
            {choices.length ? null : (
              <p className="px-1.5 py-2 text-sm text-muted-foreground">
                No shared {NOUN[kind].one} has a tag yet.
              </p>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
