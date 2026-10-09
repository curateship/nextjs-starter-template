import * as React from "react"
import { LockIcon } from "lucide-react"

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
  sameBackgroundReference,
  type BackgroundReference,
} from "@/lib/pomodoro/background-catalog"
import { isNewItem } from "@/lib/pomodoro/catalog"
import { useRoomMedia } from "@/lib/pomodoro/room-media-store"
import {
  CurrentlySelectedLabel,
  MediaAddMenu,
  MediaRoomNote,
} from "@/components/pomodoro/media-add-actions"
import { SceneBackdrop } from "@/components/pomodoro/scene-backdrop"
import { MediaUploadsSection } from "@/components/pomodoro/media-uploads-section"
import { MediaGeneratorSection } from "@/components/pomodoro/media-generator-section"
import { useGeneratorJump } from "@/lib/pomodoro/use-generator-jump"
import { contentColumn } from "@/lib/pomodoro/content-column"
import { CatalogPager } from "@/components/pomodoro/catalog-pager"
import {
  MediaShuffleSwitch,
  MediaTagsPanel,
} from "@/components/pomodoro/media-pool-panel"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useCatalogPage } from "@/lib/pomodoro/use-catalog-page"

const descriptorLabels: Record<string, string> = {
  video: "Video",
  animated: "Animated",
  static: "Still",
}

/**
 * The backgrounds page: the Live scenes from the catalogue, free and Pro, in
 * the order an admin set. A locked card says why instead of going dead.
 *
 * Hovering over a scene plays it inside its card (`ThemeCard`), and the "+"
 * in the card's corner holds the Add choices. Nothing behind the page
 * changes, and nothing is saved until "Add to my personal room", or "Add to
 * this room" for a host. Tyler, 7 Oct 2026, asked for a preview that does not
 * swap the page's own theme; on 9 Oct the popover that did it gave way to
 * playing on hover. The theme of the room you are in is outlined in orange
 * and labelled "Currently selected".
 */
export function BackgroundsPage() {
  const media = useRoomMedia()
  const { signedIn, openPlans } = useOpenPlans()
  const themes = media.catalog.themes
  const hasTags = themes.some((theme) => theme.tags.length > 0)
  const { page, pages, first, shown, setPage } = useCatalogPage(themes)
  // Read once per render rather than per card, so every card agrees.
  const now = new Date()
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
        {/* Tyler, 8 Oct 2026: tags are the first tab, one theme the second,
            and Shuffle sits beside them for both. With nothing tagged yet the
            page opens on the second, so it never opens on an empty tab. */}
        <Tabs defaultValue={hasTags ? "tags" : "one"} className="gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="tags">By tag</TabsTrigger>
              <TabsTrigger value="one">Pick one</TabsTrigger>
            </TabsList>
            <MediaShuffleSwitch kind="background" />
          </div>
          <TabsContent value="tags">
            <MediaTagsPanel kind="background" />
          </TabsContent>
          <TabsContent value="one" className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {shown.map((scene) => {
                const reference = {
                  type: "scene" as const,
                  key: scene.key,
                  stillUrl: scene.stillUrl,
                  videoUrl: scene.videoUrl,
                }
                const locked = scene.locked && !media.canUsePremiumMedia
                const card = (
                  <ThemeCard
                    key={scene.key}
                    reference={reference}
                    label={scene.label}
                    detail={descriptorLabels[scene.descriptor] ?? ""}
                    selected={sameBackgroundReference(inUse, reference)}
                    locked={locked}
                    lockedLabel={`${scene.label}, a Pro scene. ${signedIn ? "See the plans" : "Sign in to see the plans"}`}
                    onLockedClick={openPlans}
                    badges={
                      scene.locked || isNewItem(scene.publishedAt, now) ? (
                        <span className="flex gap-2 font-mono text-[10px] uppercase tracking-widest text-[var(--p-accent-2)]">
                          {scene.locked ? <small>Pro</small> : null}
                          {isNewItem(scene.publishedAt, now) ? (
                            <small>New</small>
                          ) : null}
                        </span>
                      ) : null
                    }
                  />
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
              total={themes.length}
              first={first}
              shownCount={shown.length}
              page={page}
              pages={pages}
              onPage={setPage}
            />
          </TabsContent>
        </Tabs>

        <MediaUploadsSection
          reloadToken={reloadToken}
          purpose="background"
          title="Your own"
          uploadLabel="Upload clip"
          onGenerate={goToGenerator}
          description="Hover over one to see it play, then press + to add it to your personal room."
          isSelected={(upload) =>
            sameBackgroundReference(inUse, {
              type: "media",
              mediaId: upload.mediaId,
            })
          }
          renderAddMenu={(upload) => (
            <MediaAddMenu
              item={{
                kind: "background",
                reference: uploadReference(upload),
                label: upload.name,
              }}
            />
          )}
          renderThumbnail={(upload, playing) =>
            upload.kind === "video" ? (
              <video
                // Rebuilt when it starts or stops, because a playing video
                // does not stop just because `autoPlay` turned false.
                key={playing ? "playing" : "still"}
                // `#t=0.1` asks the browser for a tenth of a second in, which
                // is what makes it paint a real frame. Without it the card is
                // a grey box until somebody presses play.
                src={playing ? upload.url : `${upload.url}#t=0.1`}
                className="size-full object-cover"
                muted
                loop
                autoPlay={playing}
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
 * One theme card. Tyler, 9 Oct 2026: the preview popover went, and instead
 * "the video will play when hover over", with a "+" in the card's bottom-right
 * corner that opens the Add choices (`MediaAddMenu`). The scene plays over its
 * still only while the pointer is on the card, so a page of cards loads no
 * films until one is hovered. A tap plays or stops it, for a phone. A locked
 * card leads to the plans page instead and has no "+".
 */
function ThemeCard({
  reference,
  label,
  detail,
  selected,
  locked,
  lockedLabel,
  onLockedClick,
  badges,
  ...rest
}: {
  reference: Extract<BackgroundReference, { type: "scene" }>
  label: string
  detail: string
  selected: boolean
  locked: boolean
  lockedLabel: string
  onLockedClick: () => void
  badges: React.ReactNode
} & Omit<React.ComponentProps<typeof Card>, "children">) {
  const [hovered, setHovered] = React.useState(false)
  const [tapped, setTapped] = React.useState(false)
  const playing = !locked && (hovered || tapped)

  return (
    // `rest` carries the Pro tooltip's trigger props on a locked card.
    <Card
      {...rest}
      className={cn(
        "relative gap-0 overflow-hidden p-0",
        selected && "ring-2 ring-[var(--p-accent)]"
      )}
      // On the whole card, so moving onto the "+" keeps it playing. Only a
      // mouse hovers; a finger's tap is the button's click.
      onPointerEnter={(event) => {
        rest.onPointerEnter?.(event)
        if (event.pointerType === "mouse") setHovered(true)
      }}
      onPointerLeave={(event) => {
        rest.onPointerLeave?.(event)
        if (event.pointerType !== "mouse") return
        setHovered(false)
        setTapped(false)
      }}
    >
      <button
        type="button"
        className="group w-full text-left outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        aria-label={locked ? lockedLabel : `Play the ${label} background`}
        aria-pressed={locked ? undefined : playing}
        // A locked card is never dead: it leads to the plans page.
        onClick={() => {
          if (locked) onLockedClick()
          else setTapped((current) => !current)
        }}
      >
        <span className="relative block aspect-video">
          <img
            src={reference.stillUrl}
            alt=""
            className={cn(
              "size-full object-cover",
              locked && "opacity-40 grayscale"
            )}
          />
          {playing ? (
            <SceneBackdrop
              background={reference}
              onMediaError={() => undefined}
              shading="none"
            />
          ) : null}
          {selected ? <CurrentlySelectedLabel /> : null}
          {locked ? (
            <span className="absolute inset-0 grid place-items-center">
              <LockIcon
                className="size-6 text-white drop-shadow"
                aria-hidden="true"
              />
            </span>
          ) : null}
        </span>
        <CardContent className="flex flex-col gap-0.5 py-3 pr-14 pl-3">
          <strong className="text-sm">{label}</strong>
          <small className="text-xs text-muted-foreground">{detail}</small>
          {badges}
        </CardContent>
      </button>
      {/* Beside the card's button, because a button cannot sit inside
          another one. */}
      {locked ? null : (
        <MediaAddMenu
          item={{ kind: "background", reference, label }}
          className="absolute right-3 bottom-3"
        />
      )}
    </Card>
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
