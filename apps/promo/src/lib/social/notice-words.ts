/**
 * The kinds of Promo's own bell notices, and the words each one's heading
 * starts with. The server writes them (`src/server/social/notices.ts`) and
 * the bell reads them back to pick the icon (`notices.ts` beside this), so
 * they live apart from any icon and the server never loads one.
 */

export type PromoNoticeKind =
  | "reply"
  | "removed"
  | "suspended"
  | "failed"
  | "proxy_renewal"
  | "phone_offline"
  | "phone_hot"
  | "phone_signal"
  | "phone_storage"
  | "rack_silent"
  | "ban_screen"
  | "action_broken"
  | "app_update"

/** Each heading starts with words no other kind's does, because the bell tells them apart by these. */
export const NOTICE_HEADINGS: Record<PromoNoticeKind, string> = {
  reply: "New reply to your comment",
  removed: "Your comment was removed",
  suspended: "Reddit suspended",
  failed: "Did not go out:",
  proxy_renewal: "Renews soon:",
  phone_offline: "Phone offline:",
  phone_hot: "Phone running hot:",
  phone_signal: "Phone has no signal:",
  phone_storage: "Phone storage nearly full:",
  rack_silent: "Rack not checking in:",
  ban_screen: "Ban screen:",
  action_broken: "Self-test failed:",
  app_update: "App update out:",
}
