import * as React from "react"
import { FlaskConicalIcon, Loader2Icon, SparklesIcon, UserRoundIcon } from "lucide-react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { DatingDashboard } from "@/lib/api/dating/dashboard"
import { changeKey, sameWords, type ProfileSuggestion } from "@/lib/dating/own-profile"

import { FlatSection } from "./flat-section"
import { DatingPicture } from "./picture"
import { dayWords, whenWords } from "./words"

type Own = NonNullable<DatingDashboard["own"]>
type PhotoTest = NonNullable<Own["photoTest"]>

/**
 * The member's own Tinder profile, in the Dating dashboard's right panel
 * (`?open=me`), opened from My profile in the left panel. The profile as the
 * phone last read it; the AI's suggested photo order, bio and prompt
 * answers, each with before and after and its own Apply (Tyler, 18 Oct 2026:
 * "nothing changes until you press Apply"), and Undo for the last one; and
 * the first-photo test.
 */
export function MyProfilePanel({
  own,
  busy,
  onReadAgain,
  onReviewAgain,
  onApply,
  onUndo,
  onStartTest,
  onStopTest,
}: {
  own: DatingDashboard["own"]
  busy: string | null
  onReadAgain: () => void
  onReviewAgain: () => void
  onApply: (what: ProfileSuggestion) => void
  onUndo: () => void
  onStartTest: () => void
  onStopTest: () => Promise<boolean>
}) {
  const [stopping, setStopping] = React.useState(false)
  const review = own?.review ?? null

  /** Apply, Applying, Applied with Undo, or nothing, on the right of one suggestion's heading. */
  const control = (what: ProfileSuggestion, already: boolean) => {
    if (!own) return null
    const key = changeKey(what)
    if (own.changing?.key === key) {
      return (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Loader2Icon className="size-3.5 animate-spin" />
          {own.changing.undo ? "Undoing on the phone" : "Applying on the phone"}
        </span>
      )
    }
    const applied = own.appliedAt[key]
    const undo =
      own.before && changeKey(own.before) === key ? (
        <Button type="button" variant="ghost" size="sm" disabled={busy === "undo"} onClick={onUndo}>
          {busy === "undo" ? <Loader2Icon className="animate-spin" /> : null}
          Undo
        </Button>
      ) : null
    if (already) {
      return (
        <span className="flex items-center gap-1 text-muted-foreground">
          {applied ? `Applied ${dayWords(applied)}` : "Already like this"}
          {undo}
        </span>
      )
    }
    return (
      <span className="flex items-center gap-1">
        {undo}
        <Button type="button" variant="outline" size="sm" disabled={busy === `apply:${key}`} onClick={() => onApply(what)}>
          {busy === `apply:${key}` ? <Loader2Icon className="animate-spin" /> : null}
          Apply
        </Button>
      </span>
    )
  }

  const failedLine = (what: ProfileSuggestion) =>
    own?.failed?.key === changeKey(what) ? <p className="text-destructive">The phone could not do this: {own.failed.error}</p> : null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DashboardCardTitleHeader icon={<UserRoundIcon className="size-4" />} title="My profile" />
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        <div className="grid grid-cols-[minmax(0,1fr)] text-sm">
          <FlatSection storageId="date-me-profile" title="Your Tinder profile" meta={own ? `read ${whenWords(own.readAt)}` : "not read yet"}>
            <p className="text-muted-foreground">
              {own
                ? "As the phone last read it. Nothing changes on Tinder until you press Apply on a suggestion."
                : "Not read yet. Reading it lets the AI suggest a photo order, a bio and new prompt answers. Nothing on the profile is changed."}
            </p>
            {own?.photoIds.length ? <PhotoRow ids={own.photoIds} size="large" /> : null}
            {own?.bio ? <p className="leading-relaxed whitespace-pre-line">{own.bio}</p> : null}
            {own?.before && !review ? (
              <p className="flex flex-wrap items-center gap-1 text-muted-foreground">
                Your last applied change can still be undone.
                <Button type="button" variant="ghost" size="sm" disabled={busy === "undo"} onClick={onUndo}>
                  {busy === "undo" ? <Loader2Icon className="animate-spin" /> : null}
                  Undo
                </Button>
              </p>
            ) : null}
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
            <FlatSection storageId="date-me-review" title="What the AI suggests" meta={review ? `reviewed ${whenWords(own.reviewMadeAt)}` : undefined}>
              {own.aiError ? <p className="text-destructive">{own.aiError}</p> : null}
              {review ? (
                <>
                  <Suggestion title="Photo order" control={own.photoAfter ? control({ kind: "photos" }, own.photoAfter.join() === own.photoIds.join()) : null}>
                    {own.photoAfter ? (
                      <>
                        <BeforeAfter before={<PhotoRow ids={own.photoIds} />} after={<PhotoRow ids={own.photoAfter} />} />
                        <ol className="grid gap-1 text-muted-foreground">
                          {review.photoOrder.map((item, place) => (
                            <li key={`${item.photo}-${place}`}>
                              {place + 1}. {item.why}
                            </li>
                          ))}
                        </ol>
                      </>
                    ) : (
                      <p className="text-muted-foreground">Your photos changed since the AI looked at them. Review again for a new order.</p>
                    )}
                    {failedLine({ kind: "photos" })}
                  </Suggestion>

                  <Suggestion title="Bio" control={control({ kind: "bio" }, sameWords(own.bio, review.bio))}>
                    <BeforeAfter before={<Words text={own.bio} />} after={<Words text={review.bio} />} />
                    {failedLine({ kind: "bio" })}
                  </Suggestion>

                  {review.prompts.map((prompt) => {
                    const now = own.prompts.find((item) => item.question === prompt.question)
                    const what: ProfileSuggestion = { kind: "prompt", question: prompt.question }
                    return (
                      <Suggestion
                        key={prompt.question}
                        title={prompt.question}
                        control={prompt.keep || !now ? null : control(what, sameWords(now.answer, prompt.answer))}
                      >
                        {!now ? (
                          <p className="text-muted-foreground">This prompt is no longer on your profile.</p>
                        ) : prompt.keep ? (
                          <>
                            <Words text={now.answer} />
                            <p className="text-muted-foreground">Keep this answer. Your About me does not say enough for a better one, or this one is better.</p>
                          </>
                        ) : (
                          <BeforeAfter before={<Words text={now.answer} />} after={<Words text={prompt.answer} />} />
                        )}
                        {failedLine(what)}
                      </Suggestion>
                    )
                  })}

                  {review.notes.length ? (
                    <ul className="grid list-disc gap-1 pl-4">
                      {review.notes.map((note) => (
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

          {own ? (
            <FlatSection storageId="date-me-photo-test" title="First-photo test" meta={testMeta(own.photoTest)}>
              <PhotoTestBody test={own.photoTest} />
              <div className="flex flex-wrap gap-2">
                {own.photoTest && running(own.photoTest) ? (
                  own.photoTest.phase === "restoring" ? null : (
                    <Button type="button" variant="outline" size="sm" onClick={() => setStopping(true)}>
                      Stop the test
                    </Button>
                  )
                ) : (
                  <Button type="button" variant="outline" size="sm" disabled={busy === "photo-test"} onClick={onStartTest}>
                    {busy === "photo-test" ? <Loader2Icon className="animate-spin" /> : <FlaskConicalIcon />}
                    Test my first photo
                  </Button>
                )}
              </div>
            </FlatSection>
          ) : null}
        </div>
      </ScrollArea>
      <ConfirmDialog
        open={stopping}
        onOpenChange={setStopping}
        title="Stop the first-photo test?"
        description="The weeks so far are kept, but the test cannot go on from here. The phone puts your photos back in the order they had before the test."
        confirmLabel="Stop the test"
        loading={busy === "photo-test"}
        onConfirm={() =>
          void onStopTest().then((done) => {
            if (done) setStopping(false)
          })
        }
      />
    </div>
  )
}

/** One suggestion: its heading with Apply on the right, then what it would change. */
function Suggestion({ title, control, children }: { title: string; control: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid gap-2 border-t pt-3 first:border-t-0 first:pt-0">
      <div className="flex min-h-7 items-center gap-2">
        <h3 className="min-w-0 flex-1 font-medium">{title}</h3>
        {control}
      </div>
      {children}
    </section>
  )
}

function BeforeAfter({ before, after }: { before: React.ReactNode; after: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <div className="grid gap-1">
        <p className="text-muted-foreground">Before</p>
        {before}
      </div>
      <div className="grid gap-1">
        <p className="text-muted-foreground">After</p>
        {after}
      </div>
    </div>
  )
}

function Words({ text }: { text: string }) {
  return text.trim() ? <p className="leading-relaxed whitespace-pre-line">{text}</p> : <p className="text-muted-foreground">Empty</p>
}

function PhotoRow({ ids, size = "small" }: { ids: string[]; size?: "small" | "large" }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ids.map((id, index) => (
        <DatingPicture key={id} pictureId={id} alt={`Photo ${index + 1}`} className={size === "large" ? "h-24 w-16 rounded-md" : "h-14 w-10 rounded"} />
      ))}
    </div>
  )
}

function running(test: PhotoTest): boolean {
  return test.phase !== "done" && test.phase !== "restored"
}

function testMeta(test: PhotoTest | null): string | undefined {
  if (!test) return undefined
  if (test.phase === "done") return "done"
  if (test.phase === "restored") return test.stopped ? "stopped" : "no winner"
  if (test.phase === "restoring") return "stopping"
  const week = test.weeks.find((item) => item.current) ?? test.weeks.find((item) => !item.endedAt)
  return week ? `week ${week.place} of ${test.weeks.length}` : undefined
}

/** "14 matches per 100 likes (3 matches from 21 likes)", or what a week with no likes says. */
function weekNumbers(week: PhotoTest["weeks"][number]): string {
  const counts = `${plural(week.matches, "match", "matches")} from ${plural(week.likes, "like", "likes")}`
  return week.per100 === null ? `No likes, so no number (${counts})` : `${week.per100} matches per 100 likes (${counts})`
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

function PhotoTestBody({ test }: { test: PhotoTest | null }) {
  if (!test) {
    return (
      <p className="text-muted-foreground">
        Puts each of your top 3 photos first for a week, three weeks in all. Then it shows matches per 100 likes for each and puts the winner first.
      </p>
    )
  }
  const winner = test.weeks.find((week) => week.winner)
  const moving = test.weeks.find((week) => !week.startedAt && !test.stopped)
  let summary = ""
  if (test.phase === "moving" && moving) summary = `The phone is putting photo ${moving.place} first. Its week starts once Tinder shows it first.`
  else if (test.phase === "week" && test.weekEndsAt) summary = `Counting until ${whenWords(test.weekEndsAt)}.`
  else if (test.phase === "putting-winner-first" && winner) summary = `Photo ${winner.place} won. The phone is putting it first.`
  else if (test.phase === "done" && winner) summary = `Photo ${winner.place} won with ${winner.per100} matches per 100 likes, and it is first now.`
  else if (test.phase === "restoring") summary = test.stopped ? "Stopped. The phone is putting your old order back." : "No week had any likes, so there is no winner. The phone is putting your old order back."
  else if (test.phase === "restored" && test.moveError) summary = "The test ended because the phone could not move your photos. They were left as they are."
  else if (test.phase === "restored") summary = test.stopped ? "Stopped. Your order from before the test is back." : "No week had any likes, so there was no winner. Your order from before the test is back."

  return (
    <>
      {summary ? <p>{summary}</p> : null}
      {test.moveError ? (
        <p className="text-destructive">
          {test.phase === "restored" ? test.moveError : `The phone could not move the photo: ${test.moveError} Date tries again within the hour.`}
        </p>
      ) : null}
      <ol className="grid gap-2">
        {test.weeks.map((week) => (
          <li key={week.place} className="flex items-start gap-3">
            <DatingPicture pictureId={week.photoId} alt={`Photo ${week.place}`} className="h-14 w-10 shrink-0 rounded" />
            <span className="grid gap-0.5">
              <span className="font-medium">
                Photo {week.place}
                {week.winner ? ", the winner" : ""}
              </span>
              <span className="text-muted-foreground">
                {week.endedAt
                  ? weekNumbers(week)
                  : week.current
                    ? `Week ${week.place}, so far: ${weekNumbers(week)}`
                    : week.startedAt
                      ? "Stopped before its week ended"
                      : test.stopped
                        ? "Not tested"
                        : `Week ${week.place}, not started yet`}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </>
  )
}
