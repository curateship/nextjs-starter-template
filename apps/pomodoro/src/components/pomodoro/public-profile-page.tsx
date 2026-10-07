import * as React from "react"
import { Link } from "@tanstack/react-router"

import {
  FocusHeatmap,
  FocusHeatmapKey,
  fillHeatmapDays,
} from "@/components/pomodoro/focus-heatmap"
import { ProfileActions } from "@/components/pomodoro/profile-actions"
import { PanelCard } from "@/components/pomodoro/panel-card"
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
import { contentColumn } from "@/lib/pomodoro/content-column"

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
  // Pinned badges lead the shelf, then the rest in the order they arrived.
  const badges = [
    ...(profile.badges ?? []).filter((badge) =>
      profile.pinnedBadgeIds.includes(badge.id)
    ),
    ...(profile.badges ?? []).filter(
      (badge) => !profile.pinnedBadgeIds.includes(badge.id)
    ),
  ]

  return (
    // The product's own content column, the same one History and the other
    // app screens use. This page draws inside `_pomodoro`, not the shell's
    // public frame, so the width is the page's own to set.
    <div className={`${contentColumn} flex flex-col gap-6 py-8`}>
      <ProfileHeader profile={profile} />

      {profile.focusingNow ? (
        <FocusingNowCard
          mode={profile.focusingNow.mode}
          endsAt={profile.focusingNow.endsAt}
        />
      ) : null}

      {profile.room ? (
        <PanelCard
          label="In a room"
          aside={
            <Button asChild size="sm" className="rounded-full">
              <Link to="/rooms/$slug" params={{ slug: profile.room.slug }}>
                Join room
              </Link>
            </Button>
          }
        >
          <p>
            <strong className="font-semibold">{profile.room.name}</strong>
            <span className="text-muted-foreground">
              {" · "}
              {PHASE_WORDS[profile.room.phase] ?? "Open"}
            </span>
          </p>
        </PanelCard>
      ) : null}

      {profile.heatmap ? <LastYearPanel profile={profile} /> : null}

      {/* An account with no badges shows no shelf at all, rather than an
          empty one saying nothing. */}
      {badges.length ? (
        <PanelCard label={`Badges · ${badges.length}`}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {badges.map((badge) => (
              <BadgeTile key={badge.id} badge={badge} />
            ))}
          </div>
        </PanelCard>
      ) : null}

      {profile.projects?.length ? (
        <PanelCard label="This week’s work">
          <div className="flex flex-col gap-2">
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
          </div>
        </PanelCard>
      ) : null}
    </div>
  )
}

/**
 * The year of focus as a grid, with the count under it. The years with a
 * recap sit where the design draws year tabs: each one opens that year's
 * review, since the grid itself only ever holds the last 365 days.
 */
function LastYearPanel({ profile }: { profile: PublicProfileView }) {
  const heatmap = profile.heatmap!
  const active = heatmap.days.filter((day) => day.focusSeconds > 0)
  const seconds = active.reduce((total, day) => total + day.focusSeconds, 0)
  return (
    <PanelCard
      label="The last year"
      aside={
        profile.recapYears.length ? (
          <nav
            aria-label="Year in review"
            className="flex items-center gap-1 rounded-full border p-1"
          >
            {profile.recapYears.map((year) => (
              <Link
                key={year}
                to="/u/$handle/$year"
                params={{ handle: profile.handle, year: String(year) }}
                className="rounded-full px-3 py-1 text-sm text-muted-foreground duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {year}
              </Link>
            ))}
          </nav>
        ) : null
      }
    >
      <FocusHeatmap
        days={fillHeatmapDays(heatmap.startDate, heatmap.endDate, heatmap.days)}
        today={heatmap.endDate}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {active.length} active {active.length === 1 ? "day" : "days"} ·{" "}
          {formatFocusDuration(seconds)} focused
        </p>
        <FocusHeatmapKey />
      </div>
    </PanelCard>
  )
}

function ProfileHeader({ profile }: { profile: PublicProfileView }) {
  const figures = profile.figures
  return (
    <section
      aria-label={profile.name}
      className="overflow-hidden rounded-[24px] border bg-[var(--p-surface)]"
    >
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
      <div className="flex flex-col gap-5 p-5 sm:p-6 md:flex-row md:items-start">
        <ProfilePhoto
          name={profile.name}
          avatarUrl={profile.avatarUrl}
          className={cn(
            "size-20 shrink-0 text-2xl ring-4 ring-[rgba(var(--p-fg-rgb),0.06)] md:size-24 md:text-3xl",
            profile.bannerUrl && "-mt-14 ring-[var(--p-surface)] md:-mt-16"
          )}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
              {profile.name}
            </h1>
            <span className="font-mono text-sm text-muted-foreground">
              /u/{profile.handle}
            </span>
          </div>
          {/* Free text somebody typed, drawn as text. React escapes it,
              which is the reason there is no "rich bio" here. */}
          {profile.bio ? (
            <p className="max-w-prose whitespace-pre-line text-muted-foreground">
              {profile.bio}
            </p>
          ) : null}
          <p className="flex gap-5 text-sm text-muted-foreground">
            <span>
              <strong className="font-semibold text-foreground">
                {profile.followers.toLocaleString()}
              </strong>{" "}
              {profile.followers === 1 ? "follower" : "followers"}
            </span>
            <span>
              <strong className="font-semibold text-foreground">
                {profile.following.toLocaleString()}
              </strong>{" "}
              following
            </span>
          </p>
          <ProfileActions
            handle={profile.handle}
            name={profile.name}
            isOwner={profile.isOwner}
          />
        </div>
        <div className="flex flex-wrap gap-2 md:justify-end">
          {profile.socialLinks.map((link) => (
            <SocialMarkLink
              key={link.platform}
              link={link}
              className="h-10 rounded-full bg-transparent px-4"
            />
          ))}
          {profile.isOwner ? (
            <Button asChild variant="outline" className="h-10 rounded-full px-4">
              <Link to="/settings" search={{ tab: "public" }}>
                Edit profile
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
      {figures ? (
        // The 1px gap shows the line colour behind the cells, so the lines
        // between them are right in two columns and in four.
        <dl className="grid grid-cols-2 gap-px border-t bg-[rgba(var(--p-fg-rgb),0.08)] md:grid-cols-4">
          <Figure
            label="Hours focused"
            value={figures.focusHours.toLocaleString()}
            unit="h"
          />
          <Figure
            label="Sessions"
            value={figures.focusSessions.toLocaleString()}
          />
          <Figure
            label="Current streak"
            value={String(figures.currentStreak)}
            unit={figures.currentStreak === 1 ? "day" : "days"}
          />
          <Figure
            label="Best streak"
            value={String(figures.bestStreak)}
            unit={figures.bestStreak === 1 ? "day" : "days"}
          />
        </dl>
      ) : null}
    </section>
  )
}

/** One number along the foot of the header, with its unit in smaller type. */
function Figure({
  label,
  value,
  unit,
}: {
  label: string
  value: string
  unit?: string
}) {
  return (
    <div className="flex flex-col gap-2 bg-[var(--p-surface)] p-5 sm:p-6">
      <dt className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </dt>
      <dd className="text-3xl font-bold tracking-tight">
        {value}
        {unit ? (
          <span className="ml-1 text-lg font-normal text-muted-foreground">
            {unit}
          </span>
        ) : null}
      </dd>
    </div>
  )
}

/**
 * The square on a badge tile: a short mark for what was earned, in one of
 * four colours by kind, so a shelf reads at a glance. Sessions are blue,
 * streaks amber, hosting green, and everything else the accent.
 */
const BADGE_MARKS: Record<string, { mark: string; tone: string }> = {
  "first-focus": { mark: "1", tone: "accent" },
  "ten-sessions": { mark: "10", tone: "blue" },
  "fifty-sessions": { mark: "50", tone: "blue" },
  "hundred-sessions": { mark: "100", tone: "blue" },
  "three-day-streak": { mark: "3d", tone: "amber" },
  "seven-day-streak": { mark: "7d", tone: "amber" },
  "thirty-day-streak": { mark: "30d", tone: "amber" },
  "ten-hours": { mark: "10h", tone: "accent" },
  "fifty-tasks": { mark: "50", tone: "green" },
  "first-room": { mark: "H", tone: "green" },
}

const BADGE_TONES: Record<string, string> = {
  accent: "bg-[color:var(--p-accent)]/15 text-[var(--p-accent)]",
  blue: "bg-sky-400/15 text-sky-300",
  amber: "bg-amber-400/15 text-amber-300",
  green: "bg-emerald-400/15 text-emerald-300",
}

function BadgeTile({ badge }: { badge: PublicProfileBadge }) {
  const look = BADGE_MARKS[badge.id] ?? {
    mark: badge.name.slice(0, 1).toUpperCase(),
    tone: "accent",
  }
  return (
    <div
      className="flex items-center gap-4 rounded-[18px] border bg-[rgba(var(--p-canvas-rgb),0.35)] p-4"
      title={badge.description}
    >
      <span
        aria-hidden="true"
        className={cn(
          "grid size-12 shrink-0 place-items-center rounded-xl font-mono text-lg font-bold",
          BADGE_TONES[look.tone]
        )}
      >
        {look.mark}
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-semibold">{badge.name}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {new Date(badge.earnedOn).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </span>
      </div>
    </div>
  )
}

/** The recap at `/u/<handle>/<year>`. */
export function YearInReviewPage({ review }: { review: YearInReviewView }) {
  return (
    <div className={`${contentColumn} flex flex-col gap-4 py-8`}>
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
