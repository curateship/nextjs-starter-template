import { parseVideoLink, type VideoLink } from "@/server/note/links"
import { parsePostLink } from "@/lib/note/library/x-links"
import { LIBRARY_SAYS, type ImportSource } from "@/lib/note/library/notes"

/**
 * Which of the five Import sources a pasted link is. Only YouTube, Instagram,
 * TikTok and X links are taken; anything else is refused with one sentence
 * (`LIBRARY_SAYS.notALink`), because the Import menu offers those five and
 * nothing else (Tyler, 20 Oct 2026: "Drop it", about uploads).
 *
 * A YouTube link is "YouTube short" when it is a /shorts/ address and "YouTube
 * long" otherwise. The site's own id comes off the link where it can, so the
 * same link imported twice into one library is caught before anything is
 * fetched. A shortened TikTok link only says which video it is once followed,
 * so its id waits for the download.
 */

type ImportLink = {
  source: ImportSource
  /** The tidied address the worker reads. */
  url: string
  platformId: string | null
}

const X_HOSTS = /^(www\.|mobile\.)?(x|twitter)\.com$/i

function withScheme(raw: string) {
  const trimmed = raw.trim()
  return /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

export function readImportLink(raw: string): ImportLink {
  let host: string
  try {
    host = new URL(withScheme(raw)).hostname
  } catch {
    throw new Error(LIBRARY_SAYS.notALink)
  }
  if (X_HOSTS.test(host)) {
    const post = parsePostLink(raw)
    return { source: "x", url: post.url, platformId: post.postId }
  }

  let link: VideoLink
  try {
    link = parseVideoLink(withScheme(raw))
  } catch {
    throw new Error(LIBRARY_SAYS.notALink)
  }
  if (link.source === null) throw new Error(LIBRARY_SAYS.notALink)
  if (link.source === "youtube") {
    const shorts = new URL(link.url).pathname.split("/").filter(Boolean)[0]?.toLowerCase() === "shorts"
    return { source: shorts ? "youtube_short" : "youtube_long", url: link.url, platformId: link.platformVideoId }
  }
  return { source: link.source, url: link.url, platformId: link.platformVideoId }
}
