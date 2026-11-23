/**
 * Which web addresses are Google Maps links. Shared by the server, which only
 * ever fetches these, and the Paste Maps links window, which picks them out
 * of pasted text (Travel features part 6).
 */

/** The most links one paste takes. */
export const MAPS_LINKS_MAX = 20

/** Hosts a Maps link may live on. */
export function isMapsHost(host: string) {
  return (
    host === "maps.app.goo.gl" ||
    host === "goo.gl" ||
    host === "maps.google.com" ||
    /^(www\.)?google\.[a-z.]{2,6}$/.test(host)
  )
}

export function isMapsLink(text: string) {
  let url: URL
  try {
    url = new URL(text.trim())
  } catch {
    return false
  }
  if (url.protocol !== "https:" || !isMapsHost(url.hostname)) return false
  if (url.hostname === "goo.gl") return url.pathname.startsWith("/maps")
  if (/^(www\.)?google\./.test(url.hostname)) return url.pathname.startsWith("/maps")
  return true
}

/**
 * Every Google Maps link in pasted text, in the order pasted, each once. The
 * links may be one per line or mixed in with other words, as a shared list
 * or a chat message has them. A full stop or bracket closing a sentence
 * isn't part of the link.
 */
export function findMapsLinks(text: string) {
  const found: string[] = []
  for (const match of text.matchAll(/https:\/\/[^\s<>"']+/g)) {
    const link = match[0].replace(/[.,;:!?)\]]+$/, "")
    if (isMapsLink(link) && !found.includes(link)) found.push(link)
  }
  return found
}
