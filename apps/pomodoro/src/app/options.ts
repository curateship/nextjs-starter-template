import {
  AtSignIcon,
  AwardIcon,
  CalendarClockIcon,
  CircleCheckIcon,
  ClockIcon,
  DoorClosedIcon,
  DoorOpenIcon,
  FlameIcon,
  GaugeIcon,
  MessageSquareIcon,
  PartyPopperIcon,
  SmilePlusIcon,
  TriangleAlertIcon,
  UserMinusIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react"

import type { AppNoticeDetail, AppOptions } from "@/lib/app-options"
import { pomodoroLandingPage } from "@/components/pomodoro/landing-page"
import {
  POMODORO_ROW_HINTS,
  POMODORO_ROW_KEYS,
  POMODORO_ROW_LABELS,
} from "@/lib/pomodoro/front-page-rows"
import {
  NOTICE_KIND_CATEGORY,
  noticeKindFromWords,
  POMODORO_NOTICE_CATEGORIES,
  type PomodoroNoticeKind,
} from "@/lib/pomodoro/notices"

/** Which panel edits each of this app's row kinds, and which component draws it. */
const ROW_PANELS = {
  "focus-hours": "FocusHoursRowPanel",
  "open-rooms": "OpenRoomsRowPanel",
} as const

const ROW_CONTENT = {
  "focus-hours": "FocusHoursRowContent",
  "open-rooms": "OpenRoomsRowContent",
} as const

/**
 * How each of this app's notices is drawn in the bell: its tab and its tile.
 *
 * The tiles use the theme's own colours, so they are the Pomoder orange on a
 * product screen and the workspace's colours in the admin's bell: primary for
 * good news, destructive for a file that will not arrive, muted for news that
 * is neither.
 */
const GOOD = "bg-primary/10 text-primary"
const BAD = "bg-destructive/10 text-destructive"
const PLAIN = "bg-muted text-muted-foreground"

const NOTICE_LOOK: Record<PomodoroNoticeKind, AppNoticeDetail> = {
  // The detail holds the first joiner's name for folding, and the heading
  // already says it, so the line under the heading is left empty.
  room_join: { icon: UserPlusIcon, toneClassName: GOOD, body: "" },
  room_chat: { icon: MessageSquareIcon, toneClassName: GOOD },
  room_mention: { icon: AtSignIcon, toneClassName: GOOD },
  room_reaction: { icon: SmilePlusIcon, toneClassName: GOOD },
  room_invite: { icon: CalendarClockIcon, toneClassName: GOOD },
  room_open: { icon: DoorOpenIcon, toneClassName: GOOD },
  room_removed: { icon: DoorClosedIcon, toneClassName: PLAIN },
  followed_room: { icon: UsersIcon, toneClassName: GOOD },
  cheer: { icon: PartyPopperIcon, toneClassName: GOOD },
  // The detail holds the first joiner's name for folding, and the heading
  // already says it, so the line under the heading is left empty.
  group_join: { icon: UserPlusIcon, toneClassName: GOOD, body: "" },
  group_removed: { icon: UserMinusIcon, toneClassName: PLAIN },
  followed_streak: { icon: FlameIcon, toneClassName: GOOD },
  badge: { icon: AwardIcon, toneClassName: GOOD },
  media_ready: { icon: CircleCheckIcon, toneClassName: GOOD },
  media_failed: { icon: TriangleAlertIcon, toneClassName: BAD },
  credits_low: { icon: GaugeIcon, toneClassName: PLAIN },
}

/** A kind's whole look: its tile and the tab it is filed under. */
function noticeLook(kind: PomodoroNoticeKind): AppNoticeDetail {
  return { ...NOTICE_LOOK[kind], categoryId: NOTICE_KIND_CATEGORY[kind] }
}

/** The picture on each kind's card in the shell's Add row window. */
const ROW_ICONS = {
  "focus-hours": ClockIcon,
  "open-rooms": UsersIcon,
} as const

/**
 * What this app changes about the shell.
 *
 * Open `src/lib/app-options.ts` for the full list of what can go in here and
 * what each one does. Anything not offered there is a compile error, on
 * purpose: the shell always knows every way an app can deviate from it.
 *
 * This file belongs to the app, not the shell. **In custom-shell itself it
 * stays empty forever.** The moment the shell puts a value here, every app ever
 * copied from it conflicts on this file on every future merge — which is the
 * exact problem the file exists to avoid.
 *
 * The product (the member-facing frontend) lives under its own `_pomodoro`
 * layout route with its own sidebar, header and settings page, like the old
 * app — it borrows nothing from the shell's signed-in chrome. The one thing
 * it does claim is the front door: `/` serves the timer itself, guests
 * included, which is how the old app demoed itself.
 *
 * The type is written as an annotation rather than `satisfies` so that an empty
 * object still reads as the full shape. Both catch a misspelled option.
 */
export const appOptions: AppOptions = {
  /**
   * The look the shell's own signed-out pages start from.
   *
   * Five addresses stay on the shell's public frame rather than the product
   * shell, because their route files belong to the shell and an app that edits
   * one has forked it: `/login`, `/register`, `/pricing`, `/search` and the
   * missing-page screen. They cannot have the product's sidebar, hero or
   * fonts, but they can at least share its colour, so the orange Register
   * button and the focus rings are the same orange on both sides of the seam.
   *
   * `#ff5a3c` is the old app's accent, the dark palette's `--p-accent` in
   * `src/components/pomodoro/theme.css`. Only these two fields are set: a
   * saved value in Settings → Styling replaces whatever is named here, and
   * everything left out keeps the shell's own look, so an admin is not fighting
   * this file. The light or dark choice is deliberately not pinned, so a
   * visitor keeps both.
   */
  publicTheme: {
    brandColor: "#ff5a3c",
    // The Pomoder tokens round at 0.8rem. The public scale stops at 24.
    radius: 13,
  },
  landing: {
    page: pomodoroLandingPage,
  },
  pages: {
    /**
     * The two live figures the front page builder can place: hours focused in
     * the last seven days, and rooms open right now.
     *
     * They are the only thing in this app aimed at somebody who is not a member
     * yet. A visitor who has never heard of it lands on a timer with no sign
     * that anybody else uses it, and one true number fixes that.
     *
     * Each one is a label, a line saying what it shows, the panel that edits its
     * floor and the component that draws it. What fills one is the other half
     * and it is server-side, under the same key in `server-options.ts`, because
     * both figures are a database read — and one that also decides whether the
     * row is drawn at all, since a quiet week is left off the page.
     *
     * Both pointers are dynamic on purpose. These screens are not in the bundle
     * of a page with no such row, and this file may not reach an endpoint module
     * while it is still being read.
     */
    frontPageRowKinds: POMODORO_ROW_KEYS.map((key) => ({
      key,
      label: POMODORO_ROW_LABELS[key],
      hint: POMODORO_ROW_HINTS[key],
      icon: ROW_ICONS[key],
      panel: () =>
        import("@/components/pomodoro/front-page-row-panels").then((module) => ({
          default: module[ROW_PANELS[key]],
        })),
      component: () =>
        import("@/components/pomodoro/public/front-page-rows").then((module) => ({
          default: module[ROW_CONTENT[key]],
        })),
    })),
  },
  notifications: {
    categories: POMODORO_NOTICE_CATEGORIES,
    /**
     * A row's look, from the notice's own words, so it is right on the first
     * paint. The sentences are this app's (`src/lib/pomodoro/notices.ts`), so
     * this is the app reading its own handwriting.
     */
    describe: (notice) => {
      const kind = noticeKindFromWords(notice)
      return kind ? noticeLook(kind) : null
    },
    /**
     * Where each notice leads, which only the server can say: a cheer or a
     * streak opens that person's public page while it opens for this reader,
     * and the rest open the page saved with them.
     *
     * The saved kind decides the look here, so a notice whose words were not
     * recognised above still lands under the right tab. A failed request costs
     * the links and nothing else; the shell keeps what `describe` drew.
     */
    detailsFor: async (notices) => {
      const mine = notices.filter((notice) => notice.type === "app_activity")
      if (mine.length === 0) return {}
      const { loadPomodoroNoticeDetails } = await import(
        "@/lib/api/pomodoro/notices"
      )
      const found = await loadPomodoroNoticeDetails(
        mine.map((notice) => notice.id)
      )
      return Object.fromEntries(
        Object.entries(found).map(([id, detail]) => [
          id,
          { ...noticeLook(detail.kind), href: detail.href ?? undefined },
        ])
      )
    },
  },
}
