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
import { AddUploadsLink } from "@/components/pomodoro/uploads-page"
import { contentColumn } from "@/lib/pomodoro/content-column"
import { CatalogPager } from "@/components/pomodoro/catalog-pager"
import {
  MediaShuffleSwitch,
  MediaTagFilter,
} from "@/components/pomodoro/media-pool-panel"
import { useCatalogPage } from "@/lib/pomodoro/use-catalog-page"
import { filterByTags, tickedFromPool } from "@/lib/pomodoro/media-pool"

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
  const [ticked, setTicked] = React.useState(() =>
    tickedFromPool(media.personalBackgroundPool)
  )
  const filtered = filterByTags(themes, ticked)
  const { page, pages, first, shown, setPage } = useCatalogPage(filtered)
  // Read once per render rather than per card, so every card agrees.
  const now = new Date()
  const inUse = media.room?.background ?? media.personalBackground

  return (
    <>
      <div className={`${contentColumn} flex flex-col gap-6 py-8`}>
        {/* Tyler's design, 9 Oct 2026: the tag filter and Shuffle sit beside
            the title, and there are no tabs. */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="title-halo flex flex-col gap-2">
            <h2 className="text-4xl font-bold tracking-tight">Backgrounds</h2>
            <MediaRoomNote thing="theme" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <MediaTagFilter
              kind="background"
              ticked={ticked}
              onChange={(next) => {
                setTicked(next)
                setPage(0)
              }}
            />
            <MediaShuffleSwitch kind="background" ticked={ticked} />
            <AddUploadsLink kind="background" />
          </div>
        </header>
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6">
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

/**
 * One theme card. Tyler, 9 Oct 2026: the preview popover went, and instead
 * "the video will play when hover over", with a "+" that opens the Add
 * choices (`MediaAddMenu`); since 10 Oct it sits on the picture's top-right
 * corner and shows on hover. The scene plays over its
 * still only while the pointer is on the card, so a page of cards loads no
 * films until one is hovered. A tap plays or stops it, for a phone. A locked
 * card leads to the plans page instead and has no "+".
 */
function ThemeCard({
  reference,
  label,
  selected,
  locked,
  lockedLabel,
  onLockedClick,
  badges,
  ...rest
}: {
  reference: Extract<BackgroundReference, { type: "scene" }>
  label: string
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
        <CardContent className="flex flex-col gap-0.5 px-3 py-3">
          <strong className="text-sm">{label}</strong>
          {badges}
        </CardContent>
      </button>
      {/* Beside the card's button, because a button cannot sit inside
          another one. */}
      {locked ? null : (
        <MediaAddMenu
          item={{ kind: "background", reference, label }}
          // On the picture's top corner, shown while the pointer is over the
          // card. Tyler, 10 Oct 2026, pointing at it: "move the + icon on
          // hover here". A phone has no hover, so there it always shows, and
          // it stays while its menu is open or it has the keyboard's focus.
          className="absolute top-2 right-2 bg-black/45 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover/card:opacity-100 hover:bg-black/60 hover:text-white focus-visible:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
        />
      )}
    </Card>
  )
}
