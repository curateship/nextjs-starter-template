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
import { curatedSounds, sameSoundReference } from "@/lib/pomodoro/sound-catalog"
import { useRoomMedia } from "@/lib/pomodoro/room-media-store"
import { usePreviewAudio } from "@/lib/pomodoro/use-preview-audio"
import {
  CurrentlySelectedLabel,
  MediaAddActions,
  MediaRoomNote,
} from "@/components/pomodoro/media-add-actions"
import { MediaUploadsSection } from "@/components/pomodoro/media-uploads-section"
import { MediaGeneratorSection } from "@/components/pomodoro/media-generator-section"
import { useGeneratorJump } from "@/lib/pomodoro/use-generator-jump"
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
 * Clicking a card previews it on this page only, through `usePreviewAudio`,
 * never through the header's player, so it cannot fight the timer's Start.
 * Tyler, 7 Oct 2026: "Make it preview the sound on the sound page only and
 * add a button to be able to add it to your personal room." The previewed
 * card then shows the Add buttons. The card outlined in orange is the sound
 * of the room you are in.
 */
export function SoundsPage() {
  const media = useRoomMedia()
  const preview = usePreviewAudio()
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
  const { generatorRef, goToGenerator } = useGeneratorJump()

  const { page, pages, first, shown, setPage } = useCatalogPage(curatedSounds)

  return (
    <>
      <div className={`${contentColumn} flex flex-col gap-6 py-8`}>
        <header className="flex flex-col gap-2">
          <h2 className="text-4xl font-bold tracking-tight">Sounds</h2>
          <MediaRoomNote thing="sound" />
        </header>
        {preview.failed ? (
          <p role="status" className="text-sm text-muted-foreground">
            That preview could not be played. Click the card to try again.
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {shown.map((sound) => {
            const reference = { type: "curated", key: sound.key } as const
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
                {/* Over the picture's bottom-left corner, while the card is
                    previewed. A layer of its own the same size as the
                    picture, because a button cannot sit inside the card's
                    preview button; only the add buttons take clicks. */}
                {previewed ? (
                  <div className="pointer-events-none absolute inset-x-0 top-0 aspect-[8/5]">
                    <div className="pointer-events-auto absolute bottom-3 left-3">
                      <MediaAddActions
                        item={{ kind: "sound", reference, label: sound.label }}
                        onPicture
                      />
                    </div>
                  </div>
                ) : null}
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
          uploadLabel="Upload sound"
          onGenerate={goToGenerator}
          description="Click one to hear it, then add it to your personal room."
          isSelected={(upload) =>
            sameSoundReference(media.sound, {
              type: "media",
              mediaId: upload.mediaId,
            })
          }
          isPreviewed={(upload) =>
            sameSoundReference(preview.previewing, {
              type: "media",
              mediaId: upload.mediaId,
            })
          }
          onPick={(upload) =>
            preview.toggle({
              type: "media",
              mediaId: upload.mediaId,
              mediaUrl: upload.url,
            })
          }
          renderActions={(upload) => (
            <MediaAddActions
              item={{
                kind: "sound",
                reference: {
                  type: "media",
                  mediaId: upload.mediaId,
                  mediaUrl: upload.url,
                },
                label: upload.name,
              }}
            />
          )}
          // A sound has no picture of its own, so the card keeps the muted
          // square the icon sits in rather than inventing artwork.
          renderThumbnail={() => null}
        />

        <div ref={generatorRef} className="scroll-mt-6">
          <MediaGeneratorSection kind="soundscape" onFinished={reloadUploads} />
        </div>
      </div>
    </>
  )
}
