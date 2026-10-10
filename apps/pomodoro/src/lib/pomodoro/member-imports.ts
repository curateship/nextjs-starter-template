import { readPixabayAddress } from "@/lib/pomodoro/pixabay-links"

/**
 * A member's "From a Pixabay link" tab in the upload window (task 06, part
 * 8), the browser-safe half: which links it takes and the wording. The server
 * reads every link again with the same rule. See "From a Pixabay link" in
 * `workspace/docs/own-media-uploads.md`.
 */

/** The most links one paste takes, the same as files in one upload. */
export const MEMBER_IMPORT_MAX_LINKS = 10

export type MemberImportFamily = "image" | "video"

export type MemberPixabayLink =
  | {
      ok: true
      id: string
      family: MemberImportFamily
      pageUrl: string
      name: string
    }
  | { ok: false; reason: string }

/**
 * A pasted link a member may import: a Pixabay photo, illustration or film.
 * Music and sound effects are refused, because Pixabay has no music API and
 * turns away a server that asks for its pages; a vector is refused because
 * it is not a background.
 */
export function readMemberPixabayLink(raw: string): MemberPixabayLink {
  const address = readPixabayAddress(raw)
  if (!address.ok) return address
  const { link, section } = address
  if (link.family === "audio")
    return {
      ok: false,
      reason:
        "is music or a sound effect, which Pixabay does not let us copy. Download it on Pixabay, then upload the file",
    }
  if (section.page === null)
    return { ok: false, reason: "is a vector, and vectors are not used as backgrounds" }
  return {
    ok: true,
    id: link.id,
    family: link.family,
    pageUrl: link.pageUrl,
    name: link.label,
  }
}
