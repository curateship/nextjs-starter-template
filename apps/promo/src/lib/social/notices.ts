import {
  AlertTriangleIcon,
  BanIcon,
  CalendarClockIcon,
  EyeOffIcon,
  MessageCircleReplyIcon,
} from "lucide-react"

import type { AppNoticeDetail, NoticeToLink } from "@/lib/app-options"
import { NOTICE_HEADINGS, type PromoNoticeKind } from "@/lib/social/notice-words"

/**
 * Promo's own bell notices, as the browser draws them. The server side is
 * `src/server/social/notices.ts`.
 *
 * A row is drawn from the notice's own words, on the spot, so it is right on
 * its first paint: each kind's heading starts with words only that kind uses,
 * and those words pick the icon and the colour. Where clicking it goes comes
 * from the server afterwards (`detailsFor` in `src/app/options.ts`), because
 * a notice's id is worked out from what it is about and cannot carry it.
 */


const LOOKS: Record<PromoNoticeKind, Pick<AppNoticeDetail, "icon" | "toneClassName">> = {
  reply: { icon: MessageCircleReplyIcon, toneClassName: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  removed: { icon: EyeOffIcon, toneClassName: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  suspended: { icon: BanIcon, toneClassName: "bg-destructive/10 text-destructive" },
  failed: { icon: AlertTriangleIcon, toneClassName: "bg-destructive/10 text-destructive" },
  proxy_renewal: { icon: CalendarClockIcon, toneClassName: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
}

/** Which of Promo's kinds a notice is, read off its heading, or null. */
export function promoNoticeKind(notice: NoticeToLink): PromoNoticeKind | null {
  if (notice.type !== "app_activity" || !notice.message) return null
  for (const kind of Object.keys(NOTICE_HEADINGS) as PromoNoticeKind[]) {
    if (notice.message.startsWith(NOTICE_HEADINGS[kind])) return kind
  }
  return null
}

/** The icon and colour of one of Promo's notices, from its words alone. */
export function promoNoticeLook(notice: NoticeToLink): AppNoticeDetail | null {
  const kind = promoNoticeKind(notice)
  return kind ? { ...LOOKS[kind] } : null
}
