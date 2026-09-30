import { ClockIcon, UsersIcon } from "lucide-react"

import type { AppOptions } from "@/lib/app-options"
import { pomodoroLandingPage } from "@/components/pomodoro/landing-page"
import {
  POMODORO_ROW_HINTS,
  POMODORO_ROW_KEYS,
  POMODORO_ROW_LABELS,
} from "@/lib/pomodoro/front-page-rows"

/** Which panel edits each of this app's row kinds, and which component draws it. */
const ROW_PANELS = {
  "focus-hours": "FocusHoursRowPanel",
  "open-rooms": "OpenRoomsRowPanel",
} as const

const ROW_CONTENT = {
  "focus-hours": "FocusHoursRowContent",
  "open-rooms": "OpenRoomsRowContent",
} as const

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
}
