import { GlobeIcon, PauseCircleIcon, SmartphoneIcon } from "lucide-react"

import type { AppNoticeDetail, NoticeToLink } from "@/lib/app-options"
import { PROXY_NOTICE_PREFIX } from "@/lib/browser/wording"
import { PHONE_NOTICE_PREFIX, RACK_PAUSED_NOTICE } from "@/lib/phones/options"
import { promoNoticeLook } from "@/lib/social/notices"

/**
 * How the bell draws promo's own notices, worked out from the words and the
 * id it already holds, so a row is right on its first paint.
 *
 * Three kinds: a proxy that stopped working, a phone that needs a hand, and
 * the rack paused. The pause opens the Phones dashboard, where it is resumed.
 * Each notice's id is the record's own id (`src/server/browser/notices.ts`
 * explains why), so clicking it opens that proxy or phone on its dashboard
 * with no lookup.
 */

export function describePromoNotice(notice: NoticeToLink): AppNoticeDetail | null {
  if (notice.type !== "app_activity") return null
  if (notice.message === RACK_PAUSED_NOTICE) {
    return {
      href: "/admin/phones",
      icon: PauseCircleIcon,
      toneClassName: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    }
  }
  if (notice.message?.startsWith(PHONE_NOTICE_PREFIX)) {
    return {
      href: `/admin/phones?open=${encodeURIComponent(notice.id)}`,
      icon: SmartphoneIcon,
      toneClassName: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    }
  }
  // Replies, removals, suspensions, failures and proxy renewals. Where those
  // open comes from the server, through `detailsFor` in `src/app/options.ts`.
  if (!notice.message?.startsWith(PROXY_NOTICE_PREFIX)) return promoNoticeLook(notice)
  return {
    href: `/admin/proxies?open=${encodeURIComponent(notice.id)}`,
    icon: GlobeIcon,
    toneClassName: "bg-destructive/10 text-destructive",
  }
}
