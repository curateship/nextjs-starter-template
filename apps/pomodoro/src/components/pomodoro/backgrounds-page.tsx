import * as React from "react"
import { EyeIcon, LockIcon } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { PRO_PERKS } from "@/lib/pomodoro/pro"
import { useOpenPlans } from "@/lib/pomodoro/use-open-plans"
import {
  curatedBackgrounds,
  sameBackgroundReference,
  type BackgroundReference,
} from "@/lib/pomodoro/background-catalog"
import { useRoomMedia } from "@/lib/pomodoro/room-media-store"
import {
  CurrentlySelectedLabel,
  MediaAddActions,
  MediaRoomNote,
} from "@/components/pomodoro/media-add-actions"
import { SceneBackdrop } from "@/components/pomodoro/scene-backdrop"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { MediaUploadsSection } from "@/components/pomodoro/media-uploads-section"
import { MediaGeneratorSection } from "@/components/pomodoro/media-generator-section"
import { useGeneratorJump } from "@/lib/pomodoro/use-generator-jump"
import { contentColumn } from "@/lib/pomodoro/content-column"
import { CatalogPager } from "@/components/pomodoro/catalog-pager"
import { useCatalogPage } from "@/lib/pomodoro/use-catalog-page"

const descriptorLabels = {
  video: "Video",
  animated: "Animated",
  static: "Still",
} as const

/**
 * The backgrounds page: eight scenes, four free and four Pro. A locked card
 * says why instead of going dead.
 *
 * Clicking a scene opens a popover with the scene playing in it and the Add
 * buttons under it. Nothing behind the page changes, and nothing is saved
 * until "Add to my personal room", or "Add to this room" for a host. Tyler,
 * 7 Oct 2026: "Clicking on the theme should open up a popover to preview the
 * theme (not open it in the background like we do now)." The theme of the
 * room you are in is outlined in orange and labelled "Currently selected".
 */
export function BackgroundsPage() {
  const media = useRoomMedia()
  const { signedIn, openPlans } = useOpenPlans()
  const { page, pages, first, shown, setPage } =
    useCatalogPage(curatedBackgrounds)
  // An AI background arrives as an ordinary upload, so finishing one means the
  // grid above has a new card and has to read its list again.
  const [reloadToken, setReloadToken] = React.useState(0)
  // Stable, so the generator's own fetch is not re-armed by an unrelated
  // re-render of this page.
  const reloadUploads = React.useCallback(
    () => setReloadToken((token) => token + 1),
    []
  )
  const { generatorRef, goToGenerator } = useGeneratorJump()
  const inUse = media.room?.background ?? media.personalBackground

  return (
    <>
      <div className={`${contentColumn} flex flex-col gap-6 py-8`}>
        <header className="flex flex-col gap-2">
          <h2 className="text-4xl font-bold tracking-tight">Backgrounds</h2>
          <MediaRoomNote thing="theme" />
        </header>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {shown.map((scene) => {
            const reference = { type: "scene", key: scene.key } as const
            const selected = sameBackgroundReference(inUse, reference)
            const locked = scene.locked && !media.canUsePremiumMedia
            const card = (
              <Card
                key={scene.key}
                className={cn(
                  "gap-0 overflow-hidden p-0",
                  selected && "ring-2 ring-[var(--p-accent)]"
                )}
              >
                <ThemePreview
                  reference={reference}
                  label={scene.label}
                  detail={descriptorLabels[scene.descriptor]}
                  disabled={locked}
                >
                <button
                  className="group w-full text-left outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
                  aria-label={
                    locked
                      ? `${scene.label}, a Pro scene. ${signedIn ? "See the plans" : "Sign in to see the plans"}`
                      : `Preview the ${scene.label} background`
                  }
                  // A locked card is never dead: it leads to the plans page.
                  onClick={() => {
                    if (locked) openPlans()
                  }}
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
                    {selected ? <CurrentlySelectedLabel /> : null}
                    <span className="absolute inset-0 grid place-items-center">
                      {locked ? (
                        <LockIcon
                          className="size-6 text-white drop-shadow"
                          aria-hidden="true"
                        />
                      ) : (
                        <EyeIcon
                          className="size-6 text-white opacity-0 drop-shadow transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                          aria-hidden="true"
                        />
                      )}
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
                </ThemePreview>
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

        <CatalogPager
          noun="background"
          total={curatedBackgrounds.length}
          first={first}
          shownCount={shown.length}
          page={page}
          pages={pages}
          onPage={setPage}
        />

        <MediaUploadsSection
          reloadToken={reloadToken}
          purpose="background"
          title="Your own"
          uploadLabel="Upload clip"
          onGenerate={goToGenerator}
          description="Click one to preview it, then add it to your personal room."
          isSelected={(upload) =>
            sameBackgroundReference(inUse, {
              type: "media",
              mediaId: upload.mediaId,
            })
          }
          renderPreview={(upload, card) => (
            <ThemePreview
              reference={uploadReference(upload)}
              label={upload.name}
              detail={upload.kind === "video" ? "Your video" : "Your picture"}
            >
              {card}
            </ThemePreview>
          )}
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

        <div ref={generatorRef} className="scroll-mt-6">
          <MediaGeneratorSection kind="background" onFinished={reloadUploads} />
        </div>
      </div>
    </>
  )
}

/**
 * The preview popover a theme card opens: the scene itself, playing if it is
 * a film, then its name and the Add buttons. The page behind stays as it is.
 * A locked card opens the plans page instead, so it never opens this.
 */
function ThemePreview({
  reference,
  label,
  detail,
  disabled = false,
  children,
}: {
  reference: BackgroundReference
  label: string
  detail: string
  disabled?: boolean
  children: React.ReactElement
}) {
  if (disabled) return children
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-80 gap-3 p-3">
        <div className="relative aspect-video overflow-hidden rounded-lg bg-muted">
          <SceneBackdrop
            background={reference}
            onMediaError={() => undefined}
            shading="none"
          />
        </div>
        <span className="flex flex-col gap-0.5">
          <strong className="text-sm">{label}</strong>
          <small className="text-xs text-muted-foreground">{detail}</small>
        </span>
        <MediaAddActions item={{ kind: "background", reference, label }} />
      </PopoverContent>
    </Popover>
  )
}

/**
 * An upload as a theme. Both extras are carried so the backdrop can draw it
 * straight away: the kind decides between a looping <video> and an <img>,
 * and the address is the one the server resolved for this file.
 */
function uploadReference(upload: {
  mediaId: string
  kind: string
  url: string
}): BackgroundReference {
  return {
    type: "media",
    mediaId: upload.mediaId,
    mediaKind: upload.kind === "video" ? "video" : "image",
    mediaUrl: upload.url,
  }
}
