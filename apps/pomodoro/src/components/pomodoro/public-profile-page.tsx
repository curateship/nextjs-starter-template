import * as React from "react"
import { Link } from "@tanstack/react-router"

import {
  FocusHeatmap,
  FocusHeatmapKey,
  fillHeatmapDays,
} from "@/components/pomodoro/focus-heatmap"
import { ProfileActions } from "@/components/pomodoro/profile-actions"
import { ProfilePhoto } from "@/components/pomodoro/profile-photo"
import { SocialMarkLink } from "@/components/pomodoro/social-marks"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { mediaImageSrcSet } from "@/lib/media/image-sizes"
import { formatFocusDuration } from "@/lib/pomodoro/focus-history"
import type {
  PublicProfileBadge,
  PublicProfileView,
  YearInReviewView,
} from "@/lib/pomodoro/public-profile"
import { cn } from "@/lib/utils"

/**
 * The page at `/u/<handle>`.
 *
 * It draws what arrived and asks for nothing. Every section is already
 * decided by the server: a switch that is off means the field is null here,
 * so there is no "should I show this" in this file and nothing in the page's
 * data for a reader to find in a network tab.
 *
 * Nothing on the page is a link back into the account. A handle is the public
 * name of an account and no id reaches this component at all.
 */

const PHASE_WORDS: Record<string, string> = {
  focus: "Focusing",
  short: "On a short break",
  long: "On a long break",
  waiting: "Waiting to start",
}

export function PublicProfilePage({ profile }: { profile: PublicProfileView }) {
  const pinned = (profile.badges ?? []).filter((badge) =>
    profile.pinnedBadgeIds.includes(badge.id)
  )
  const rest = (profile.badges ?? []).filter(
    (badge) => !profile.pinnedBadgeIds.includes(badge.id)
  )

  return (
    // The product's own content column, the same one History and the other
    // app screens use. This page draws inside `_pomodoro`, not the shell's
    // public frame, so the width is the page's own to set.
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 py-8">
      <ProfileHeader profile={profile} />

      {profile.focusingNow ? (
        <FocusingNowCard
          mode={profile.focusingNow.mode}
          endsAt={profile.focusingNow.endsAt}
        />
      ) : null}

      {profile.room ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{profile.room.name}</CardTitle>
            <Button asChild size="sm">
              <Link to="/rooms/$slug" params={{ slug: profile.room.slug }}>
                Join room
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {PHASE_WORDS[profile.room.phase] ?? "Open"}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {profile.figures ? (
        <Card>
          <CardHeader>
            <CardTitle>Focus record</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Figure
              label="Hours focused"
              value={profile.figures.focusHours.toLocaleString()}
            />
            <Figure
              label="Sessions finished"
              value={profile.figures.focusSessions.toLocaleString()}
            />
            <Figure
              label="Current streak"
              value={`${profile.figures.currentStreak} ${profile.figures.currentStreak === 1 ? "day" : "days"}`}
            />
            <Figure
              label="Best streak"
              value={`${profile.figures.bestStreak} ${profile.figures.bestStreak === 1 ? "day" : "days"}`}
            />
          </CardContent>
        </Card>
      ) : null}

      {/* An account with no badges shows no shelf at all, rather than an
          empty one saying nothing. */}
      {profile.badges?.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Badges</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {pinned.length ? (
              <div className="flex flex-wrap gap-2">
                {pinned.map((badge) => (
                  <BadgeTile key={badge.id} badge={badge} pinned />
                ))}
              </div>
            ) : null}
            {rest.length ? (
              <div className="flex flex-wrap gap-2">
                {rest.map((badge) => (
                  <BadgeTile key={badge.id} badge={badge} />
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {profile.heatmap ? (
        <Card>
          <CardHeader>
            <CardTitle>The last year</CardTitle>
          </CardHeader>
          <CardContent className="flex min-w-0 flex-col gap-3">
            <FocusHeatmap
              days={fillHeatmapDays(
                profile.heatmap.startDate,
                profile.heatmap.endDate,
                profile.heatmap.days
              )}
              today={profile.heatmap.endDate}
            />
            <FocusHeatmapKey />
          </CardContent>
        </Card>
      ) : null}

      {profile.projects?.length ? (
        <Card>
          <CardHeader>
            <CardTitle>This week&rsquo;s work</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {profile.projects.map((project) => (
              <div
                key={project.name}
                className="flex items-baseline justify-between gap-4 border-b pb-2 last:border-b-0 last:pb-0"
              >
                <span className="truncate text-sm">{project.name}</span>
                <span className="font-mono text-sm text-muted-foreground">
                  {formatFocusDuration(project.focusSeconds)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {profile.recapYears.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Year in review</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {profile.recapYears.map((year) => (
              <Button key={year} asChild variant="outline" size="sm">
                <Link
                  to="/u/$handle/$year"
                  params={{ handle: profile.handle, year: String(year) }}
                >
                  {year}
                </Link>
              </Button>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function ProfileHeader({ profile }: { profile: PublicProfileView }) {
  return (
    <Card className="overflow-hidden">
      {profile.bannerUrl ? (
        // A banner that points at a deleted upload never gets here: the
        // server answers null for it, and the page below looks finished
        // without one.
        <div className="h-28 w-full md:h-40">
          <img
            src={profile.bannerUrl}
            // A banner is the biggest thing on the page and an own upload can
            // be several megabytes, so it asks for a copy the right size
            // rather than the file as uploaded.
            srcSet={mediaImageSrcSet(profile.bannerUrl)}
            sizes="(min-width: 768px) 768px, 100vw"
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        </div>
      ) : null}
      <CardContent
        className={cn(
          "flex flex-col gap-3",
          profile.bannerUrl && "-mt-8 md:-mt-10"
        )}
      >
        <ProfilePhoto
          name={profile.name}
          avatarUrl={profile.avatarUrl}
          className={cn(
            "size-16 text-xl md:size-20 md:text-2xl",
            profile.bannerUrl && "ring-4 ring-card"
          )}
        />
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">{profile.name}</h1>
          <p className="font-mono text-xs text-muted-foreground">
            /u/{profile.handle}
          </p>
        </div>
        {/* Free text somebody typed, drawn as text. React escapes it, which
            is the reason there is no "rich bio" here. */}
        {profile.bio ? (
          <p className="max-w-prose whitespace-pre-line text-sm text-muted-foreground">
            {profile.bio}
          </p>
        ) : null}
        {profile.socialLinks.length ? (
          <div className="flex flex-wrap gap-2">
            {profile.socialLinks.map((link) => (
              <SocialMarkLink key={link.platform} link={link} />
            ))}
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">
          <strong className="font-semibold text-foreground">
            {profile.followers.toLocaleString()}
          </strong>{" "}
          {profile.followers === 1 ? "follower" : "followers"}
          {" · "}
          <strong className="font-semibold text-foreground">
            {profile.following.toLocaleString()}
          </strong>{" "}
          following
        </p>
        <ProfileActions
          handle={profile.handle}
          name={profile.name}
          isOwner={profile.isOwner}
        />
      </CardContent>
    </Card>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-2xl font-bold">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

function BadgeTile({
  badge,
  pinned,
}: {
  badge: PublicProfileBadge
  pinned?: boolean
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 rounded-lg border px-3 py-2",
        pinned ? "min-w-40 bg-muted/60" : "bg-card"
      )}
      title={badge.description}
    >
      <span className={cn("font-semibold", pinned ? "text-base" : "text-sm")}>
        {badge.name}
      </span>
      <span className="text-xs text-muted-foreground">
        {new Date(badge.earnedOn).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })}
      </span>
    </div>
  )
}

/** The recap at `/u/<handle>/<year>`. */
export function YearInReviewPage({ review }: { review: YearInReviewView }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>
            {review.name} in {review.year}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {review.tooEarly ? (
            // A recap of a near-empty year argues against the product. The
            // honest short line beats a page of near-zeros. Tyler's call,
            // 2 Oct 2026, the same thinking as the hidden front-page row.
            <p className="text-sm text-muted-foreground">
              There is not enough of {review.year} on record yet for a review.
              Check back when the year has more in it.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <Figure
                label="Hours focused"
                value={review.focusHours.toLocaleString()}
              />
              <Figure
                label="Sessions finished"
                value={review.focusSessions.toLocaleString()}
              />
              <Figure
                label="Tasks ticked"
                value={review.tasksCompleted.toLocaleString()}
              />
              <Figure
                label="Best streak"
                value={`${review.bestStreak} ${review.bestStreak === 1 ? "day" : "days"}`}
              />
              {review.busiestMonth ? (
                <Figure
                  label="Busiest month"
                  value={new Date(
                    `${review.busiestMonth.month}-15T12:00:00`
                  ).toLocaleDateString(undefined, { month: "long" })}
                />
              ) : null}
              <Figure
                label="Badges earned"
                value={String(review.badges.length)}
              />
            </div>
          )}
          <Button asChild variant="outline" size="sm" className="self-start">
            <Link to="/u/$handle" params={{ handle: review.handle }}>
              Back to the profile
            </Link>
          </Button>
        </CardContent>
      </Card>

      {review.badges.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Badges earned in {review.year}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {review.badges.map((badge) => (
              <BadgeTile key={badge.id} badge={badge} />
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

/** How often the line re-reads the clock. Minutes are all it shows. */
const FOCUSING_NOW_TICK_MS = 5000

/**
 * "Focusing now · In a focus session, 12 minutes left", counting down while
 * the page is open and gone once the time is up. It counts against the end
 * time the page loaded with and never asks the server again. It used to print
 * the minutes from the load and then never move.
 *
 * Drawn only in the browser: the minutes depend on the reader's clock, and a
 * server-drawn number would disagree with the browser's on hydration.
 */
function FocusingNowCard({
  mode,
  endsAt,
}: {
  mode: "focus" | "short" | "long"
  endsAt: string
}) {
  const [left, setLeft] = React.useState<number | null>(null)
  React.useEffect(() => {
    const end = new Date(endsAt).getTime()
    const tick = () =>
      setLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000)))
    tick()
    const timer = setInterval(tick, FOCUSING_NOW_TICK_MS)
    return () => clearInterval(timer)
  }, [endsAt])

  if (left === null || left <= 0) return null
  const minutes = Math.ceil(left / 60)
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-3">
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full bg-[var(--p-accent)]"
        />
        <p className="text-sm">
          <strong className="font-semibold">Focusing now</strong>
          {" · "}
          {mode === "focus" ? "In a focus session" : "On a break"}
          {", "}
          {minutes} {minutes === 1 ? "minute" : "minutes"} left
        </p>
      </CardContent>
    </Card>
  )
}
