import type { AppOptions } from "@/lib/app-options"

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
 * The type is written as an annotation rather than `satisfies` so that an empty
 * object still reads as the full shape. Both catch a misspelled option.
 *
 * Date has no settings tab of its own: the Dating settings are tabs of the ⋮
 * in the Dating dashboard's left header, because they differ per profile
 * (Tyler, 20 Oct 2026; the ⋮ took the cog's place on 18 Nov 2026).
 */
export const appOptions: AppOptions = {}
