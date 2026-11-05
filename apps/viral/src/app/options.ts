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
  // A video shared from a phone opens the Save to Viral page (features task part 22).
  homeScreen: { shareTarget: { path: "/admin/share" } },
  settings: {
    tabs: [
      // The key Viral searches YouTube with, and today's units (task part 1).
      defineSettingsTab({
        id: "youtube",
        label: "YouTube",
        panel: () => import("@/components/viral/settings/youtube-settings"),
      }),
      // Video's address and key, for Send to Video (task parts 21 and 22).
      defineSettingsTab({
        id: "video-connection",
        label: "Video connection",
        panel: () => import("@/components/viral/settings/video-connection-settings"),
      }),
      // The Meta ad library token, for Winning ads (features task part 23).
      defineSettingsTab({
        id: "meta",
        label: "Meta",
        panel: () => import("@/components/viral/settings/meta-settings"),
      }),
      // The space downloaded videos use, and deleting unopened ones (part 19).
      defineSettingsTab({
        id: "storage",
        label: "Storage",
        panel: () => import("@/components/viral/settings/storage-settings"),
      }),
      // How to share videos to Viral from a phone (part 22).
      defineSettingsTab({
        id: "phone",
        label: "Save from phone",
        panel: () => import("@/components/viral/settings/phone-settings"),
      }),
      // Promo's address and key, for reads through Promo and Write a post for Promo (features task parts 11 and 20).
      defineSettingsTab({
        id: "promo-connection",
        label: "Promo connection",
        panel: () => import("@/components/viral/settings/promo-connection-settings"),
      }),
    ],
  },
}
