/**
 * The kinds of Promo's own bell notices, and the words each one's heading
 * starts with. The server writes them (`src/server/social/notices.ts`) and
 * the bell reads them back to pick the icon (`notices.ts` beside this), so
 * they live apart from any icon and the server never loads one.
 */

export type PromoNoticeKind = "reply" | "removed" | "suspended" | "failed" | "proxy_renewal"

export const NOTICE_HEADINGS: Record<PromoNoticeKind, string> = {
  reply: "New reply to your comment",
  removed: "Your comment was removed",
  suspended: "Reddit suspended",
  failed: "Did not go out:",
  proxy_renewal: "Renews soon:",
}
