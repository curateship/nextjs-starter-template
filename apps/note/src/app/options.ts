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
      /**
       * The one line every post's plan is written for (Tyler, 19 Oct 2026:
       * "One line for the whole app"). A pointer, never the component: this
       * file is read by the server during boot.
       */
      defineSettingsTab({
        id: "posts",
        label: "Posts",
        panel: () => import("@/components/note-posts/posts-settings"),
      }),
    ],
  },
  notifications: {
    /**
     * A video notice ("Ready to analyse", "Analysed", "Failed") opens
     * `/videos?open=<id>` with that video picked, a post's opens
     * `/posts?open=<id>`, and a note's reminder opens `/notes?open=<id>`.
     * What each is about is kept on the server beside the
     * notice, so it is asked for once per page of notices. A failed read only
     * loses the links; the rows are already drawn from their own words.
     */
    detailsFor: async (notices) => {
      const mine = notices.filter((notice) => notice.type === "app_activity")
      if (!mine.length) return {}
      const { loadNoticeLinks } = await import("@/lib/api/note/notices")
      const links = await loadNoticeLinks(mine.map((notice) => notice.id)).catch(() => [])
      return Object.fromEntries(links.map((link) => [link.id, { href: link.href }]))
    },
  },
}
