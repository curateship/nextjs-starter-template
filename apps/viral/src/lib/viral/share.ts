/**
 * Save from your phone (`workspace/docs/phone-save.md`, task part 22). The
 * page a shared link opens: Android's share menu sends `?url=`, `?text=` and
 * `?title=`, and the iPhone shortcut sends `?url=`.
 */
export const SHARE_PATH = "/admin/share"

const LINK_MAX = 2048

/**
 * The first web address in what the phone shared. Apps often put the link in
 * the text, after words such as "Watch this on TikTok", so every field is
 * read and the first https or http address wins. Nothing else is kept.
 */
export function findSharedLink(shared: { url?: unknown; text?: unknown; title?: unknown }): string | null {
  for (const value of [shared.url, shared.text, shared.title]) {
    if (typeof value !== "string") continue
    const match = value.slice(0, LINK_MAX * 2).match(/https?:\/\/[^\s<>"']+/i)
    if (match && match[0].length <= LINK_MAX) return match[0]
  }
  return null
}
