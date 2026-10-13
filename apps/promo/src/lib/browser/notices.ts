import { GlobeIcon } from "lucide-react"

import type { AppNoticeDetail, NoticeToLink } from "@/lib/app-options"
import { PROXY_NOTICE_PREFIX } from "@/lib/browser/wording"
import { promoNoticeLook } from "@/lib/social/notices"

/**
 * How the bell draws promo's own notices, worked out from the words and the
 * id it already holds, so a row is right on its first paint.
 *
 * The one kind so far is a proxy that stopped working. Its notice's id is the
 * proxy's id (`src/server/browser/notices.ts` explains why), so clicking it
 * opens that proxy on the Proxies dashboard with no lookup.
 */

export function describePromoNotice(notice: NoticeToLink): AppNoticeDetail | null {
  if (notice.type !== "app_activity") return null
  // Replies, removals, suspensions, failures and proxy renewals. Where those
  // open comes from the server, through `detailsFor` in `src/app/options.ts`.
  if (!notice.message?.startsWith(PROXY_NOTICE_PREFIX)) return promoNoticeLook(notice)
  return {
    href: `/admin/proxies?open=${encodeURIComponent(notice.id)}`,
    icon: GlobeIcon,
    toneClassName: "bg-destructive/10 text-destructive",
  }
}
