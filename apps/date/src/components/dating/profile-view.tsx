import * as React from "react"
import { BadgeCheckIcon, ChevronLeftIcon, ChevronRightIcon, HeartIcon, Loader2Icon, UserRoundIcon, XIcon } from "lucide-react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { ProfileDetail } from "@/lib/api/dating/dashboard"
import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

import { DatingPicture } from "./picture"
import { nameAndAge, swipeWords, whenWords } from "./words"

/**
 * One card in the middle column: its photos with arrows to page through them,
 * every line Tinder showed, and Like and Pass. A card already swiped says who
 * swiped it and when instead. Like and Pass send a walk to the phone, which
 * swipes only once it has checked the same card is still in front.
 */
export function ProfileView({
  profile,
  back,
  busy,
  onSwipe,
  onOpenPhoto,
}: {
  profile: ProfileDetail
  /** The way back to the list, below 1280px. */
  back: (() => void) | null
  busy: boolean
  onSwipe: (decision: "like" | "pass") => void
  onOpenPhoto: (photo: { id: string; title: string }) => void
}) {
  const [index, setIndex] = React.useState(0)
  const count = profile.photoIds.length
  const shown = Math.min(index, Math.max(count - 1, 0))
  const title = nameAndAge(profile.name, profile.age)
  const facts = [
    profile.distance,
    profile.job,
    profile.school,
    profile.livesIn ? `Lives in ${profile.livesIn}` : "",
    profile.handles.instagram ? `Instagram ${profile.handles.instagram}` : "",
    profile.handles.anthem ? `Anthem: ${profile.handles.anthem}` : "",
    profile.handles.spotifyArtists?.length ? `Top Spotify artists: ${profile.handles.spotifyArtists.join(", ")}` : "",
  ].filter(Boolean)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DashboardCardTitleHeader
        icon={<UserRoundIcon className="size-4" />}
        back={back ? { label: "Back to the list", onClick: back } : undefined}
        title={title}
        meta={`Read ${whenWords(profile.readAt)}`}
        action={profile.sample ? <Badge variant="secondary">Sample</Badge> : null}
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-4 p-3">
          {count ? (
            <div className="grid gap-2">
              <div className="relative mx-auto w-full max-w-sm">
                <button
                  type="button"
                  className={cn("block w-full overflow-hidden rounded-lg", focusRing)}
                  onClick={() => onOpenPhoto({ id: profile.photoIds[shown], title: `${profile.name}'s photo ${shown + 1} of ${count}` })}
                  aria-label={`Open ${profile.name}'s photo ${shown + 1} of ${count} full size`}
                >
                  <DatingPicture pictureId={profile.photoIds[shown]} alt={`${profile.name}, photo ${shown + 1}`} className="aspect-[3/4] w-full" />
                </button>
                {count > 1 ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="absolute top-1/2 left-2 -translate-y-1/2 bg-background/80"
                      aria-label="Previous photo"
                      onClick={() => setIndex((shown - 1 + count) % count)}
                    >
                      <ChevronLeftIcon />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="absolute top-1/2 right-2 -translate-y-1/2 bg-background/80"
                      aria-label="Next photo"
                      onClick={() => setIndex((shown + 1) % count)}
                    >
                      <ChevronRightIcon />
                    </Button>
                  </>
                ) : null}
              </div>
              <div className="flex flex-wrap justify-center gap-1.5" role="group" aria-label="Photos">
                {profile.photoIds.map((id, photo) => (
                  <button
                    key={id}
                    type="button"
                    aria-label={`Photo ${photo + 1} of ${count}`}
                    aria-current={photo === shown ? "true" : undefined}
                    onClick={() => setIndex(photo)}
                    className={cn("overflow-hidden rounded-md border-2", photo === shown ? "border-primary" : "border-transparent", focusRing)}
                  >
                    <DatingPicture pictureId={id} alt="" className="size-12" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{profile.photosForgotten ? "Photos deleted after 30 days." : "No photos were kept for this card."}</p>
          )}

          <div className="grid gap-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{title}</span>
              {profile.verified ? (
                <Badge variant="secondary">
                  <BadgeCheckIcon /> Photo verified
                </Badge>
              ) : null}
            </div>
            {facts.length ? (
              <ul className="grid gap-1 text-muted-foreground">
                {facts.map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </ul>
            ) : null}
            {profile.bio ? <p className="leading-relaxed whitespace-pre-line">{profile.bio}</p> : <p className="text-muted-foreground">No bio.</p>}
          </div>

          {profile.sections.filter((section) => section.heading !== "About me" && section.items.length).length ? (
            <dl className="grid gap-3 text-sm">
              {profile.sections
                .filter((section) => section.heading !== "About me" && section.items.length)
                .map((section) => (
                  <div key={section.heading} className="grid gap-0.5">
                    <dt className="text-xs font-medium text-muted-foreground">{section.heading}</dt>
                    <dd>{section.items.join(" · ")}</dd>
                  </div>
                ))}
            </dl>
          ) : null}
        </div>
      </ScrollArea>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t p-3">
        {profile.swipe !== "none" ? (
          <p className="mr-auto text-sm text-muted-foreground">
            {swipeWords(profile.swipe, profile.swipedBy)}
            {profile.swipedAt ? ` at ${whenWords(profile.swipedAt)}` : ""}.
          </p>
        ) : profile.pendingSwipe ? (
          <p className="mr-auto flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
            {profile.pendingSwipe === "super" ? "Super Like" : profile.pendingSwipe === "like" ? "Like" : "Pass"} sent to the phone. It swipes once it has checked {profile.name} is still in front.
          </p>
        ) : (
          <>
            {profile.sample ? <p className="mr-auto text-sm text-muted-foreground">A sample card: Like and Pass send nothing.</p> : null}
            <Button type="button" variant="outline" disabled={busy} onClick={() => onSwipe("pass")}>
              <XIcon /> Pass
            </Button>
            <Button type="button" disabled={busy} onClick={() => onSwipe("like")}>
              {busy ? <Loader2Icon className="animate-spin" /> : <HeartIcon />} Like
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
