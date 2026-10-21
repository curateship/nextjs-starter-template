import { Loader2Icon, SparklesIcon, UserRoundIcon } from "lucide-react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { DatingDashboard } from "@/lib/api/dating/dashboard"

import { FlatSection } from "./flat-section"
import { DatingPicture } from "./picture"
import { whenWords } from "./words"

/**
 * The member's own Tinder profile, in the Dating dashboard's right panel
 * (`?open=me`), opened from My profile in the left panel. It was the My
 * profile screen until Tyler's "We dont need 4 seperate pages. Condense them
 * all into the 3 col dashboard" (20 Oct 2026). The profile as the phone last
 * read it, and the AI's suggested photo order, bio and notes. Nothing on the
 * profile is changed.
 */
export function MyProfilePanel({
  own,
  busy,
  onReadAgain,
  onReviewAgain,
}: {
  own: DatingDashboard["own"]
  busy: string | null
  onReadAgain: () => void
  onReviewAgain: () => void
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DashboardCardTitleHeader
        icon={<UserRoundIcon className="size-4" />}
        title="My profile"
      />
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        <div className="grid grid-cols-[minmax(0,1fr)] text-sm">
          <FlatSection storageId="date-me-profile" title="Your Tinder profile" meta={own ? `read ${whenWords(own.readAt)}` : "not read yet"}>
            <p className="text-muted-foreground">
              {own
                ? "As the phone last read it. The AI suggests a photo order and a bio; nothing on the profile is changed."
                : "Not read yet. Reading it lets the AI suggest a photo order and a bio. Nothing on the profile is changed."}
            </p>
            {own?.photoIds.length ? (
              <div className="flex flex-wrap gap-2">
                {own.photoIds.map((id, index) => (
                  <DatingPicture key={id} pictureId={id} alt={`Your photo ${index + 1}`} className="h-24 w-16 rounded-md" />
                ))}
              </div>
            ) : null}
            {own?.bio ? <p className="leading-relaxed whitespace-pre-line">{own.bio}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" disabled={busy === "read-own"} onClick={onReadAgain}>
                {busy === "read-own" ? <Loader2Icon className="animate-spin" /> : null}
                {own ? "Read it again" : "Read my profile"}
              </Button>
              {own ? (
                <Button type="button" variant="outline" size="sm" disabled={busy === "review"} onClick={onReviewAgain}>
                  {busy === "review" ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
                  Review again
                </Button>
              ) : null}
            </div>
          </FlatSection>

          {own ? (
            <FlatSection storageId="date-me-review" title="What the AI suggests" meta={own.review ? `reviewed ${whenWords(own.reviewMadeAt)}` : undefined}>
              {own.aiError ? <p className="text-destructive">{own.aiError}</p> : null}
              {own.review ? (
                <>
                  <div className="grid gap-2">
                    <p className="font-medium">Suggested photo order</p>
                    <ol className="grid gap-2">
                      {own.review.photoOrder.map((item, place) => (
                        <li key={`${item.photo}-${place}`} className="flex items-start gap-3">
                          <DatingPicture pictureId={own.photoIds[item.photo - 1] ?? null} alt={`Your photo ${item.photo}`} className="h-14 w-10 shrink-0 rounded" />
                          <span>
                            <span className="font-medium">
                              {place + 1}. Now photo {item.photo}.
                            </span>{" "}
                            {item.why}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div className="grid gap-1">
                    <p className="font-medium">Suggested bio</p>
                    <p className="leading-relaxed whitespace-pre-line">{own.review.bio}</p>
                  </div>
                  {own.review.notes.length ? (
                    <ul className="grid list-disc gap-1 pl-4">
                      {own.review.notes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : own.aiError ? null : (
                <p className="text-muted-foreground">The AI reviews it on its next pass.</p>
              )}
            </FlatSection>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}
