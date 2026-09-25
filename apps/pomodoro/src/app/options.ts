import type { AppOptions } from "@/lib/app-options"
import { pomodoroLandingPage } from "@/components/pomodoro/landing-page"

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
}
