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
import { useOpenPlans } from "@/lib/pomodoro/use-open-plans"
import { isNewItem } from "@/lib/pomodoro/catalog"
import {
  sameSoundReference,
  type SoundReference,
} from "@/lib/pomodoro/sound-catalog"
import { useRoomMedia } from "@/lib/pomodoro/room-media-store"
import { usePreviewAudio } from "@/lib/pomodoro/use-preview-audio"
import {
  CurrentlySelectedLabel,
  MediaAddMenu,
  MediaRoomNote,
} from "@/components/pomodoro/media-add-actions"
import { AddUploadsLink } from "@/components/pomodoro/uploads-page"
import { SoundWave } from "@/components/pomodoro/sound-wave"
import { contentColumn } from "@/lib/pomodoro/content-column"
import { CatalogPager } from "@/components/pomodoro/catalog-pager"
import {
  MediaShuffleSwitch,
  MediaTagFilter,
} from "@/components/pomodoro/media-pool-panel"
import { useCatalogPage } from "@/lib/pomodoro/use-catalog-page"
import { filterByTags, tickedFromPool } from "@/lib/pomodoro/media-pool"

/**
 * The sounds page, drawn to Tyler's design of 7 Oct 2026 ("revamp the sound
 * page"): a large title, the loops as cards of four across with a wide
 * waveform picture, a count line with a pager, then a "Your own" card and a
 * "Generate your own" card. The sounds are the Live ones from the catalogue,
 * free and Pro, in the order an admin set; a locked card says why instead of
 * going dead.
 *
 * A click or tap on a card plays it on this page only, through
 * `usePreviewAudio`, never through the header's player, so it cannot fight the
 * timer's Start, and a second click stops it. Tyler, 7 Oct 2026: "Make it
 * preview the sound on the sound page only", then 9 Oct a "+" in the card's
 * corner that opens the Add choices (`MediaAddMenu`). Playing on hover came in
 * on 9 Oct and went on 10 Oct, because it fought the click. The card outlined in orange is the sound
 * of the room you are in.
 */
export function SoundsPage() {
  const media = useRoomMedia()
  const preview = usePreviewAudio()
  const { signedIn, openPlans } = useOpenPlans()
  const sounds = media.catalog.sounds
  const [ticked, setTicked] = React.useState(() =>
    tickedFromPool(media.personalSoundPool)
  )
  const filtered = filterByTags(sounds, ticked)
  const { page, pages, first, shown, setPage } = useCatalogPage(filtered)
  // Read once per render rather than per card, so every card agrees.
  const now = new Date()

  return (
    <>
      <div className={`${contentColumn} flex flex-col gap-6 py-8`}>
        {/* Tyler's design, 9 Oct 2026: the tag filter and Shuffle sit beside
            the title, and there are no tabs. */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="title-halo flex flex-col gap-2">
            <h2 className="text-4xl font-bold tracking-tight">Sounds</h2>
            <MediaRoomNote thing="sound" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <MediaTagFilter
              kind="sound"
              ticked={ticked}
              onChange={(next) => {
                setTicked(next)
                setPage(0)
              }}
            />
            <MediaShuffleSwitch kind="sound" ticked={ticked} />
            <AddUploadsLink kind="sound" />
          </div>
        </header>
        <div className="flex flex-col gap-6">
          {preview.failed ? (
            <p role="status" className="text-sm text-muted-foreground">
              That preview could not be played. Click the card to try again.
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
            {shown.map((sound) => {
              const reference: SoundReference = {
                type: "curated",
                key: sound.key,
                url: sound.fileUrl,
                label: sound.label,
                volume: sound.volume,
              }
              const inUse = sameSoundReference(media.sound, reference)
              const previewed = sameSoundReference(preview.previewing, reference)
              const playing = previewed && preview.playing
              const locked = sound.locked && !media.canUsePremiumMedia
              const card = (
                <Card
                  key={sound.key}
                  className={cn(
                    "relative gap-0 overflow-hidden rounded-[18px] p-0",
                    inUse && "ring-2 ring-[var(--p-accent)]"
                  )}
                >
                  <button
                    className="group w-full text-left outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
                    aria-pressed={locked ? undefined : playing}
                    aria-label={
                      locked
                        ? `${sound.label}, a Pro sound. ${signedIn ? "See the plans" : "Sign in to see the plans"}`
                        : playing
                          ? `Stop the ${sound.label} preview`
                          : `Preview ${sound.label}`
                    }
                    // A locked card is never dead: it leads to the plans page.
                    onClick={() => {
                      if (locked) openPlans()
                      else preview.toggle(reference)
                    }}
                  >
                    {/* A waveform drawn from the sound's key, moving while
                        it plays (Tyler, 10 Oct 2026). */}
                    <span className="relative block aspect-[8/5]">
                      <SoundWave
                        seed={sound.key}
                        playing={playing}
                        className={cn(locked && "opacity-40 grayscale")}
                      />
                      {inUse ? <CurrentlySelectedLabel /> : null}
                      <span className="absolute inset-0 grid place-items-center">
                        <span
                          className={cn(
                            "grid size-11 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm",
                            // A card not being previewed shows its play button
                            // only on hover or keyboard focus.
                            !locked &&
                              !previewed &&
                              "opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                          )}
                        >
                          {locked ? (
                            <LockIcon className="size-4" aria-hidden="true" />
                          ) : playing ? (
                            <PauseIcon className="size-5" aria-hidden="true" />
                          ) : (
                            <PlayIcon className="size-5" aria-hidden="true" />
                          )}
                        </span>
                      </span>
                    </span>
                    <CardContent className="flex flex-col gap-1 py-4 pr-14 pl-[18px]">
                      <span className="flex items-center justify-between gap-2">
                        <strong className="truncate text-base font-semibold">
                          {sound.label}
                        </strong>
                        {sound.locked || isNewItem(sound.publishedAt, now) ? (
                          <span className="flex shrink-0 gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--p-accent-2)]">
                            {sound.locked ? <small>Pro</small> : null}
                            {isNewItem(sound.publishedAt, now) ? (
                              <small>New</small>
                            ) : null}
                          </span>
                        ) : null}
                      </span>
                      <small className="truncate text-sm text-muted-foreground">
                        {sound.hint}
                      </small>
                    </CardContent>
                  </button>
                  {/* Beside the card's button, because a button cannot sit
                      inside another one. */}
                  {locked ? null : (
                    <MediaAddMenu
                      item={{ kind: "sound", reference, label: sound.label }}
                      className="absolute right-3 bottom-4"
                    />
                  )}
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
            total={filtered.length}
            first={first}
            shownCount={shown.length}
            page={page}
            pages={pages}
            onPage={setPage}
          />
        </div>
      </div>
    </>
  )
}
