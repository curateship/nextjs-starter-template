import type { AppOptions } from "@/lib/app-options"
import { describePromoNotice } from "@/lib/browser/notices"

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
     * Promo is one site and always will be. It is a tool one person runs
     * against their own social accounts, not something with tenants.
     */
    whoMayHave: "off",
  },
  notifications: {
    /**
     * A proxy that stopped working rings the bell once, and clicking the
     * notice opens that proxy on the Proxies dashboard.
     */
    describe: describePromoNotice,
    /**
     * Where a reply, a removed comment, a suspended account, a failed comment
     * or a proxy renewal opens. Their ids are worked out from what they are
     * about, so the address is remembered on the server and asked for here,
     * once per page of notices. A failed read only loses the addresses; the
     * rows are already drawn from their words.
     */
    detailsFor: async (notices) => {
      const { promoNoticeKind, promoNoticeLook } = await import("@/lib/social/notices")
      const mine = notices.filter((notice) => promoNoticeKind(notice) !== null)
      if (!mine.length) return {}
      const { loadPromoNoticeLinks } = await import("@/lib/api/social/notices")
      const links = await loadPromoNoticeLinks(mine.map((notice) => notice.id)).catch(() => [])
      const looks = new Map(mine.map((notice) => [notice.id, promoNoticeLook(notice)]))
      return Object.fromEntries(
        links.map((link) => [link.id, { ...looks.get(link.id), href: link.href }])
      )
    },
  },
  settings: {
    tabs: [
      {
        id: "reddit-account",
        label: "Reddit account",
        /**
         * A pointer, never the component. This file is pulled into the
         * server's node registry during boot, and reaching a component module
         * from it builds server functions while the guards are half-made — the
         * app then falls over before it serves anything.
         */
        panel: () => import("@/components/social/account-settings"),
      },
      {
        id: "browsers",
        label: "Browsers",
        /** How many browsers may be open at once, and when an unused one closes. */
        panel: () => import("@/components/browser/browser-settings"),
      },
      {
        id: "phones",
        label: "Phones",
        /** How many phones work at once, and how many days their pictures are kept. */
        panel: () => import("@/components/phones/phone-settings"),
      },
      {
        id: "behaviour",
        label: "Behaviour",
        /**
         * How every account acts: the reader browser that searches for it,
         * its waking hours, its warm-up and its pace.
         */
        panel: () => import("@/components/social/behaviour-settings"),
      },
    ],
  },
}
