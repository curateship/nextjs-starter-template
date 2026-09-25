import * as React from "react"
import { LockIcon, PauseIcon, PlayIcon } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { PRO_PERKS } from "@/lib/pomodoro/pro"
import { curatedSounds, sameSoundReference } from "@/lib/pomodoro/sound-catalog"
import { useSoundPlayer } from "@/lib/pomodoro/use-sound-player"
import { MediaUploadsSection } from "@/components/pomodoro/media-uploads-section"
import { MediaGeneratorSection } from "@/components/pomodoro/media-generator-section"

/**
 * The sounds page: the eight curated loops as cards. Four are free, four
 * are Pro; a locked card says why instead of going dead. Picking one plays
 * it and saves the choice; picking the one already playing pauses it. The
 * player itself sits in the header and follows the timer.
 */
export function SoundsPage() {
  const player = useSoundPlayer()
  const { state } = player
  // An AI soundscape arrives as an ordinary upload, so finishing one means the
  // grid above has a new card and has to read its list again.
  const [reloadToken, setReloadToken] = React.useState(0)
  // Stable, so the generator's own fetch is not re-armed by an unrelated
  // re-render of this page.
  const reloadUploads = React.useCallback(
    () => setReloadToken((token) => token + 1),
    []
  )

  return (
    <>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 py-8">
        <header>
          <h2 className="text-2xl font-bold tracking-tight">Sounds</h2>
          <p className="text-sm text-muted-foreground">
            A loop for the background. It starts with the timer and pauses with
            it.
          </p>
        </header>
        {state.notice ? (
          <p role="status" className="text-sm text-muted-foreground">
            {state.notice}
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {curatedSounds.map((sound) => {
            const reference = { type: "curated", key: sound.key } as const
            const selected = sameSoundReference(state.selected, reference)
            const playing = selected && state.status === "playing"
            const locked = sound.locked && !state.canUsePremiumMedia
            const card = (
              <Card
                key={sound.key}
                className={cn(
                  "overflow-hidden p-0",
                  selected && "ring-2 ring-[var(--p-accent)]"
                )}
              >
                <button
                  className="group w-full text-left disabled:cursor-not-allowed"
                  aria-pressed={selected}
                  aria-label={
                    locked
                      ? `${sound.label} — ${PRO_PERKS.premiumMedia.lockedReason}`
                      : playing
                        ? `Pause ${sound.label}`
                        : `Play ${sound.label}`
                  }
                  onClick={() => {
                    if (!locked) player.selectSound(reference, sound.label)
                  }}
                  disabled={locked}
                >
                  <span className="relative block aspect-square">
                    <img
                      src={`/sounds/sounds-${sound.key}.png`}
                      alt=""
                      className={cn(
                        "size-full object-cover",
                        locked && "opacity-40 grayscale"
                      )}
                    />
                    <span className="absolute inset-0 grid place-items-center">
                      {locked ? (
                        <LockIcon
                          className="size-6 text-white drop-shadow"
                          aria-hidden="true"
                        />
                      ) : playing ? (
                        <PauseIcon
                          className="size-6 text-white drop-shadow"
                          aria-hidden="true"
                        />
                      ) : (
                        <PlayIcon
                          className="size-6 text-white opacity-0 drop-shadow transition-opacity group-hover:opacity-100"
                          aria-hidden="true"
                        />
                      )}
                    </span>
                  </span>
                  <CardContent className="flex flex-col gap-0.5 p-3">
                    <strong className="text-sm">{sound.label}</strong>
                    <small className="text-xs text-muted-foreground">
                      {sound.hint}
                    </small>
                    {sound.locked ? (
                      <small className="font-mono text-[10px] uppercase tracking-widest text-[var(--p-accent-2)]">
                        Pro
                      </small>
                    ) : null}
                  </CardContent>
                </button>
              </Card>
            )
            if (!locked) return card
            return (
              <Tooltip key={sound.key}>
                <TooltipTrigger asChild>{card}</TooltipTrigger>
                <TooltipContent>
                  {PRO_PERKS.premiumMedia.lockedReason}
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>

        <MediaUploadsSection
          reloadToken={reloadToken}
          purpose="sound"
          title="Your own"
          description="A loop of your own. It plays and pauses with the timer like the rest."
          isSelected={(upload) =>
            sameSoundReference(state.selected, {
              type: "media",
              mediaId: upload.mediaId,
            })
          }
          onPick={(upload) =>
            player.selectSound(
              {
                type: "media",
                mediaId: upload.mediaId,
                mediaUrl: upload.url,
              },
              upload.name
            )
          }
          // A sound has no picture of its own, so the card keeps the muted
          // square the icon sits in rather than inventing artwork.
          renderThumbnail={() => null}
        />

        <MediaGeneratorSection kind="soundscape" onFinished={reloadUploads} />
      </div>
    </>
  )
}
