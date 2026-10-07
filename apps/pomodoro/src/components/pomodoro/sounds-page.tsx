import * as React from "react"
import {
  CheckIcon,
  LockIcon,
  PauseIcon,
  PlayIcon,
} from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { PRO_PERKS } from "@/lib/pomodoro/pro"
import { useOpenPlans } from "@/lib/pomodoro/use-open-plans"
import { curatedSounds, sameSoundReference } from "@/lib/pomodoro/sound-catalog"
import { useSoundPlayer } from "@/lib/pomodoro/use-sound-player"
import { MediaUploadsSection } from "@/components/pomodoro/media-uploads-section"
import { MediaGeneratorSection } from "@/components/pomodoro/media-generator-section"
import { contentColumn } from "@/lib/pomodoro/content-column"
import { CatalogPager } from "@/components/pomodoro/catalog-pager"
import { useCatalogPage } from "@/lib/pomodoro/use-catalog-page"

/**
 * The sounds page, drawn to Tyler's design of 7 Oct 2026 ("revamp the sound
 * page"): a large title, the loops as cards of four across with a wide
 * waveform picture, a count line with a pager, then a "Your own" card and a
 * "Generate your own" card. Four loops are free and four are Pro; a locked
 * card says why instead of going dead.
 *
 * Picking a card chooses that loop and saves the choice. It does not start
 * it: the sound begins when the timer starts, or when you press play, on
 * the header's player or on the chosen card itself. Only the chosen card
 * carries a play button, so a picture never plays a sound by being
 * clicked.
 */
export function SoundsPage() {
  const player = useSoundPlayer()
  const { state } = player
  const { signedIn, openPlans } = useOpenPlans()
  // An AI soundscape arrives as an ordinary upload, so finishing one means the
  // grid above has a new card and has to read its list again.
  const [reloadToken, setReloadToken] = React.useState(0)
  // Stable, so the generator's own fetch is not re-armed by an unrelated
  // re-render of this page.
  const reloadUploads = React.useCallback(
    () => setReloadToken((token) => token + 1),
    []
  )

  const { page, pages, first, shown, setPage } = useCatalogPage(curatedSounds)

  return (
    <>
      <div className={`${contentColumn} flex flex-col gap-6 py-8`}>
        <header className="flex flex-col gap-2">
          <h2 className="text-4xl font-bold tracking-tight">Sounds</h2>
          <p className="max-w-xl text-base text-foreground/75">
            A loop for the background. Pick one here; it starts when the
            timer does, or when you press play.
          </p>
        </header>
        {state.notice ? (
          <p role="status" className="text-sm text-muted-foreground">
            {state.notice}
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {shown.map((sound) => {
            const reference = { type: "curated", key: sound.key } as const
            const selected = sameSoundReference(state.selected, reference)
            const playing = selected && state.status === "playing"
            const locked = sound.locked && !state.canUsePremiumMedia
            const card = (
              <Card
                key={sound.key}
                className={cn(
                  "overflow-hidden rounded-[18px] p-0",
                  selected && "ring-2 ring-[var(--p-accent)]"
                )}
              >
                <button
                  className="group w-full text-left outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
                  aria-pressed={locked ? undefined : selected}
                  aria-label={
                    locked
                      ? `${sound.label}, a Pro sound. ${signedIn ? "See the plans" : "Sign in to see the plans"}`
                      : !selected
                        ? `Choose ${sound.label}`
                        : playing
                          ? `Pause ${sound.label}`
                          : `Play ${sound.label}`
                  }
                  // A locked card is never dead: it leads to the plans page.
                  onClick={() => {
                    if (locked) openPlans()
                    else player.selectSound(reference, sound.label)
                  }}
                >
                  {/* The square waveform picture, cropped to a wide frame
                      so the bars fill it top to bottom. */}
                  <span className="relative block aspect-[8/5]">
                    <img
                      src={`/sounds/sounds-${sound.key}.png`}
                      alt=""
                      className={cn(
                        "size-full object-cover",
                        locked && "opacity-40 grayscale"
                      )}
                    />
                    <span className="absolute inset-0 grid place-items-center">
                      <span
                        className={cn(
                          "grid size-11 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm",
                          // Unchosen cards show the tick only on hover or
                          // keyboard focus, since clicking one chooses it.
                          !locked &&
                            !selected &&
                            "opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                        )}
                      >
                        {locked ? (
                          <LockIcon className="size-4" aria-hidden="true" />
                        ) : playing ? (
                          <PauseIcon className="size-5" aria-hidden="true" />
                        ) : selected ? (
                          <PlayIcon className="size-5" aria-hidden="true" />
                        ) : (
                          <CheckIcon className="size-5" aria-hidden="true" />
                        )}
                      </span>
                    </span>
                  </span>
                  <CardContent className="flex flex-col gap-1 px-[18px] py-4">
                    <span className="flex items-center justify-between gap-2">
                      <strong className="truncate text-base font-semibold">
                        {sound.label}
                      </strong>
                      {sound.locked ? (
                        <small className="shrink-0 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--p-accent-2)]">
                          Pro
                        </small>
                      ) : null}
                    </span>
                    <small className="truncate text-sm text-muted-foreground">
                      {sound.hint}
                    </small>
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

        <CatalogPager
          noun="sound"
          total={curatedSounds.length}
          first={first}
          shownCount={shown.length}
          page={page}
          pages={pages}
          onPage={setPage}
        />

        <MediaUploadsSection
          reloadToken={reloadToken}
          purpose="sound"
          title="Your own"
          uploadLabel="Upload a loop"
          description="It plays and pauses with the timer like the rest."
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
