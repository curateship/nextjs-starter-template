/**
 * Makes a piece of text safe to drop into HTML.
 *
 * One home for it, because two places send HTML email — the short auth mails in
 * `server/email.ts` and the block renderer in `lib/broadcasts/render.ts` — and
 * two copies of an escaping function is exactly the kind of thing that drifts
 * until one of them stops escaping something.
 */
export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}
