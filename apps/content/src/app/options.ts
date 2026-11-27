import type { AppOptions } from "@/lib/app-options"
import { describePromoNotice } from "@/lib/browser/notices"
import { defineSettingsTab } from "@/lib/settings-tab"
import { FLOW_NODE_DESCRIPTORS } from "@/lib/video/flow/node-kinds"

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
 * Content is Video, Promo and Viral in one app, so this file is the three
 * apps' answers put together (`workspace/docs/content-app.md`). The tabs that
 * set up a key between two of those apps are gone: inside one app there is
 * nothing to connect.
 */
export const appOptions: AppOptions = {
  media: {
    /**
     * Tyler, 31 Oct 2026: "Don't have upload limit. File can be as big as
     * 100gig or more", for Video. The bucket's own 5TB is the one wall.
     * `workspace/docs/big-files.md` says what that took.
     */
    videoMaxBytes: "bucket",
  },
  automations: {
    /**
     * Flow's nodes (workspace/docs/flow.md). Declared here only so the
     * shell's canvas, which Flow draws on, knows their names, icons and
     * ports. None has a palette entry, so none is offered on an automation,
     * and none has an executor: Flow runs them itself.
     */
    nodes: FLOW_NODE_DESCRIPTORS,
  },
  workspaces: {
    /**
     * Content is one site and always will be. It is a tool one person runs
     * against their own projects and social accounts, not something with
     * tenants.
     */
    whoMayHave: "off",
  },
  // A video shared from a phone opens the Save to Research page
  // (`workspace/docs/phone-save.md`).
  homeScreen: { shareTarget: { path: "/admin/share" } },
  notifications: {
    /**
     * A proxy that stopped working rings the bell once, and clicking the
     * notice opens that proxy in the Anti Detect dashboard's Proxies.
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
      /**
       * Research's YouTube key and today's units, then the channel the
       * retention curves are read from. One tab, because Video and Viral each
       * had a YouTube tab and one app holds only one of that id.
       */
      defineSettingsTab({
        id: "youtube",
        label: "YouTube",
        panel: () => import("@/components/content-app/youtube-settings"),
      }),
      /** The Pexels API key the carousel's photo search uses. */
      defineSettingsTab({
        id: "pexels",
        label: "Pexels",
        panel: () => import("@/components/video-editor/pexels-settings"),
      }),
      /** The Sync Labs key that makes a clip's lips match a new voice. */
      defineSettingsTab({
        id: "lip-sync",
        label: "Lip sync",
        panel: () => import("@/components/video-editor/sync-settings"),
      }),
      /**
       * The Wan and Seedance keys for AI shots, which company new shots start
       * on, and what a Wan or Seedance shot starts with. Kept off the shell's
       * AI key list on purpose: those two companies are the editor's alone.
       */
      defineSettingsTab({
        id: "ai-video",
        label: "AI video",
        panel: () => import("@/components/video-editor/ai-video-settings"),
      }),
      /**
       * The look every caption window starts from (presets, font, outline,
       * words at a time, platform) and the platforms' safe boxes.
       */
      defineSettingsTab({
        id: "captions",
        label: "Captions",
        panel: () => import("@/components/video-editor/caption-settings"),
      }),
      /** The words the Voice window's script check flags. */
      defineSettingsTab({
        id: "scripts",
        label: "Scripts",
        panel: () => import("@/components/video-editor/script-settings"),
      }),
      /** How many ads a video gets for its length, and the too-many limit (`workspace/docs/ads.md`). */
      defineSettingsTab({
        id: "ads",
        label: "Ads",
        panel: () => import("@/components/video-editor/ad-settings"),
      }),
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
      // The Meta ad library token, for Winning ads.
      defineSettingsTab({
        id: "meta",
        label: "Meta",
        panel: () => import("@/components/viral/settings/meta-settings"),
      }),
      // Which AI writes Research's words, picked once.
      defineSettingsTab({
        id: "writer",
        label: "AI writer",
        panel: () => import("@/components/viral/settings/writer-settings"),
      }),
      // Your own hook types beside the fixed ones, and labelling old hooks.
      defineSettingsTab({
        id: "hook-types",
        label: "Hook types",
        panel: () => import("@/components/viral/settings/hook-types-settings"),
      }),
      // The space downloaded videos use, and deleting unopened ones.
      defineSettingsTab({
        id: "storage",
        label: "Storage",
        panel: () => import("@/components/viral/settings/storage-settings"),
      }),
      // How to share videos to Research from a phone.
      defineSettingsTab({
        id: "phone",
        label: "Save from phone",
        panel: () => import("@/components/viral/settings/phone-settings"),
      }),
    ],
  },
}
