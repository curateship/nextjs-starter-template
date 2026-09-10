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
 */
export const appOptions: AppOptions = {
  workspaces: {
    /**
     * Video is one site and always will be. The shell defaults to this, and
     * saying it here anyway is worth the line: this file is where somebody
     * reads what this app is, and a default can change under you.
     */
    whoMayHave: "off",
  },
}
