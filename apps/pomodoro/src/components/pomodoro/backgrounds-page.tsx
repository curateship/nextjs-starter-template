import * as React from "react"
import { CheckIcon, LockIcon } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { PRO_PERKS } from "@/lib/pomodoro/pro"
import {
  curatedBackgrounds,
  sameBackgroundReference,
} from "@/lib/pomodoro/background-catalog"
import { useBackgroundSelection } from "@/lib/pomodoro/background-store"
import { MediaUploadsSection } from "@/components/pomodoro/media-uploads-section"
import { MediaGeneratorSection } from "@/components/pomodoro/media-generator-section"

const descriptorLabels = {
  video: "Video",
  animated: "Animated",
  static: "Still",
} as const

/**
 * The backgrounds page: eight scenes, four free and four Pro, the picked
 * one drawn behind every member screen. A locked card says why instead of
 * going dead.
 */
export function BackgroundsPage() {
  const { background, canUsePremiumMedia, chooseBackground } =
    useBackgroundSelection()
  // An AI background arrives as an ordinary upload, so finishing one means the
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
          <h2 className="text-2xl font-bold tracking-tight">Backgrounds</h2>
          <p className="text-sm text-muted-foreground">
            Pick the scene the whole app sits on.
          </p>
        </header>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {curatedBackgrounds.map((scene) => {
            const reference = { type: "scene", key: scene.key } as const
            const selected = sameBackgroundReference(background, reference)
            const locked = scene.locked && !canUsePremiumMedia
            const card = (
              <Card
                key={scene.key}
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
                      ? `${scene.label} — ${PRO_PERKS.premiumMedia.lockedReason}`
                      : `Use the ${scene.label} background`
                  }
                  onClick={() => {
                    if (!locked) chooseBackground(reference)
                  }}
                  disabled={locked}
                >
                  <span className="relative block aspect-video">
                    <img
                      src={`/backgrounds/thumbs-${scene.thumb}.png`}
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
                      ) : selected ? (
                        <CheckIcon
                          className="size-6 text-white drop-shadow"
                          aria-hidden="true"
                        />
                      ) : null}
                    </span>
                  </span>
                  <CardContent className="flex flex-col gap-0.5 p-3">
                    <strong className="text-sm">{scene.label}</strong>
                    <small className="text-xs text-muted-foreground">
                      {descriptorLabels[scene.descriptor]}
                    </small>
                    {scene.locked ? (
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
              <Tooltip key={scene.key}>
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
          purpose="background"
          title="Your own"
          description="A picture or a clip of your own, behind everything."
          isSelected={(upload) =>
            sameBackgroundReference(background, {
              type: "media",
              mediaId: upload.mediaId,
            })
          }
          onPick={(upload) =>
            chooseBackground({
              type: "media",
              mediaId: upload.mediaId,
              // Both carried so the backdrop can draw straight away: the kind
              // decides between a looping <video> and an <img>, and the
              // address is the one the server resolved for this file.
              mediaKind: upload.kind === "video" ? "video" : "image",
              mediaUrl: upload.url,
            })
          }
          renderThumbnail={(upload) =>
            upload.kind === "video" ? (
              <video
                // `#t=0.1` asks the browser for a tenth of a second in, which
                // is what makes it paint a real frame. Without it the card is
                // a grey box until somebody presses play.
                src={`${upload.url}#t=0.1`}
                className="size-full object-cover"
                muted
                playsInline
                preload="metadata"
              />
            ) : (
              <img src={upload.url} alt="" className="size-full object-cover" />
            )
          }
        />

        <MediaGeneratorSection kind="background" onFinished={reloadUploads} />
      </div>
    </>
  )
}
