import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { MediaAddActions } from "@/components/pomodoro/media-add-actions"
import { useProductAuth } from "@/lib/pomodoro/auth-state"
import {
  catalogTags,
  describeTags,
  poolSounds,
  poolThemes,
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
import { plural } from "@/lib/format/plural"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The By tag tab and the Shuffle switch on the Sounds and Theme pages. See
 * `workspace/docs/shuffle-and-tags.md`.
 *
 * Tyler, 8 Oct 2026: "let user select tags as default first tab with another
 * tab to select individual sound and theme. User can also select shuffle for
 * both." Ticked tags play a random item from those tags, a new one each time
 * the sound ends. Shuffle draws from everything the plan allows.
 */

type Kind = "sound" | "background"

const NOUN: Record<Kind, { one: string; many: string }> = {
  sound: { one: "sound", many: "sounds" },
  background: { one: "theme", many: "themes" },
}

export function MediaTagsPanel({ kind }: { kind: Kind }) {
  const media = useRoomMedia()
  const items = kind === "sound" ? media.catalog.sounds : media.catalog.themes
  const tags = catalogTags(items)
  const personalPool =
    kind === "sound" ? media.personalSoundPool : media.personalBackgroundPool
  const [ticked, setTicked] = React.useState<string[]>(
    personalPool?.mode === "tags" ? personalPool.tags : []
  )
  const pool: MediaPool | null = ticked.length ? { mode: "tags", tags: ticked } : null
  const matching = pool
    ? (kind === "sound"
        ? poolSounds(media.catalog, pool, media.canUsePremiumMedia)
        : poolThemes(media.catalog, pool, media.canUsePremiumMedia)
      ).length
    : 0

  if (!tags.length)
    return (
      <p className="text-sm text-muted-foreground">
        Nothing is tagged yet. Pick one {NOUN[kind].one} on the next tab, or
        switch on Shuffle.
      </p>
    )

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Tick what you are in the mood for. A random {NOUN[kind].one} from those
        plays, and a new one comes each time the sound ends.
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Tags">
        {tags.map(({ tag, count, free }) => {
          const proOnly = !media.canUsePremiumMedia && free === 0
          const on = ticked.includes(tag)
          return (
            <DisabledReason
              key={tag}
              disabled={proOnly}
              reason={PRO_PERKS.premiumMedia.lockedReason}
            >
              <Button
                type="button"
                size="sm"
                variant={on ? "default" : "outline"}
                aria-pressed={on}
                disabled={proOnly}
                onClick={() =>
                  setTicked((current) =>
                    on ? current.filter((value) => value !== tag) : [...current, tag]
                  )
                }
              >
                {tag}
                <span className="text-xs opacity-70">
                  {proOnly ? "Pro" : media.canUsePremiumMedia ? count : free}
                </span>
              </Button>
            </DisabledReason>
          )
        })}
      </div>
      {pool ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm">
            Plays a random {describeTags(ticked)} {NOUN[kind].one}:{" "}
            {matching} {plural(matching, NOUN[kind].one, NOUN[kind].many)} to
            pick from.
          </p>
          <MediaAddActions
            item={{
              kind,
              pool,
              // Reads as a sentence in the toast: "A random rain or nature
              // sound is in your personal room."
              label: `A random ${describeTags(ticked)} ${NOUN[kind].one}`,
            }}
          />
        </div>
      ) : null}
    </div>
  )
}

/**
 * Shuffle for your own room: on, a random sound (or theme) from everything
 * your plan allows, a new one when the sound ends. Off, the one playing now
 * stays as your pick.
 */
export function MediaShuffleSwitch({ kind }: { kind: Kind }) {
  const media = useRoomMedia()
  const { authenticated } = useProductAuth()
  const [busy, setBusy] = React.useState(false)
  const id = React.useId()
  const pool = kind === "sound" ? media.personalSoundPool : media.personalBackgroundPool
  const on = pool?.mode === "shuffle"

  const change = async (next: boolean) => {
    setBusy(true)
    try {
      if (next) {
        if (kind === "sound") await addSoundPoolToPersonalRoom({ mode: "shuffle" })
        else await addBackgroundPoolToPersonalRoom({ mode: "shuffle" })
        toast.success(
          authenticated
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
    <div className="flex items-center gap-2">
      <Switch
        id={id}
        checked={on}
        disabled={busy}
        onCheckedChange={(next) => void change(next)}
      />
      <Label htmlFor={id} className="font-normal">
        Shuffle every {NOUN[kind].one}
      </Label>
    </div>
  )
}
