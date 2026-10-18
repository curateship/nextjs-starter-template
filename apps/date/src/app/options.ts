import type { AppOptions } from "@/lib/app-options"
import { defineSettingsTab } from "@/lib/settings-tab"

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
  settings: {
    tabs: [
      defineSettingsTab({
        id: "dating",
        label: "Dating",
        /**
         * What the AI is told about the member, how it decides, the limits on
         * the phone and the spend cap. A pointer, never the component: this
         * file is read by the server during boot.
         */
        panel: () => import("@/components/dating/dating-settings"),
      }),
    ],
  },
}
