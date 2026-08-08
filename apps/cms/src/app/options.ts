import type { AppOptions } from "@/lib/app-options"

/**
 * What this app changes about the shell.
 *
 * Open `src/lib/app-options.ts` for the full list of what can go in here and
 * what each one does. Anything not offered there is a compile error, on
 * purpose: the shell always knows every way an app can deviate from it.
 *
 * The type is written as an annotation rather than `satisfies` so that an empty
 * object still reads as the full shape. Both catch a misspelled option.
 *
 * **Nothing here may import `@/lib/api/*`, or anything that does.** This file is
 * pulled into the automation node registry, which the server's own modules
 * import while they are still starting up — so an endpoint module reached from
 * here builds its server functions in the middle of that, finds the guards
 * half-made, and the app falls over before it serves anything. Reach for an
 * endpoint **inside a loader**, where it is fetched at request time.
 */
export const appOptions: AppOptions = {}
