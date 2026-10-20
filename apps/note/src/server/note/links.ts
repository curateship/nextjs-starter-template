import { lookup } from "node:dns/promises"
import { BlockList, isIP } from "node:net"

import { LIBRARY_SAYS } from "@/lib/note/library/notes"

/**
 * Which pasted links are videos, and which addresses yt-dlp may be pointed at.
 *
 * yt-dlp fetches whatever it is given, from inside the server. YouTube, TikTok
 * and Instagram links are read here and give their site and video id straight
 * away. Any other `https` link is allowed through only when its host is a
 * public name: not this machine, not an address on the private network, and
 * not a bare IP number. That host check is what stops a pasted link reaching
 * the inside of the server, so the worker runs it again right before the
 * download in case the name has started pointing somewhere else since.
 */

export type KnownSource = "youtube" | "tiktok" | "instagram"

export type VideoLink = {
  /** The tidied address handed to yt-dlp. */
  url: string
  /** Null when only yt-dlp can say which site it is. */
  source: KnownSource | null
  /** Null when only yt-dlp can say which video it is. */
  platformVideoId: string | null
}

/** A host name may be answered by any of these, and every one is refused. */
const PRIVATE_ADDRESSES = new BlockList()
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  PRIVATE_ADDRESSES.addSubnet(network, prefix, "ipv4")
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  // An IPv4 address written as IPv6 (::ffff:127.0.0.1) needs no rule here:
  // the block list checks it against the IPv4 rules above by itself. A rule
  // for the whole ::ffff:0:0/96 range would refuse every IPv4 address.
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  PRIVATE_ADDRESSES.addSubnet(network, prefix, "ipv6")
}

export function isPrivateAddress(address: string) {
  const family = isIP(address)
  if (family === 4) return PRIVATE_ADDRESSES.check(address, "ipv4")
  if (family === 6) return PRIVATE_ADDRESSES.check(address, "ipv6")
  // Not an address at all, so not one anybody may be sent to.
  return true
}

/**
 * Reads a pasted link. Throws "That is not a link to a video" for anything
 * that is not an `https` address, and for the three known sites when the
 * address is not one video. The host of any other link is only checked for
 * its shape here; `checkLinkHost` asks where it really points.
 */
export function parseVideoLink(raw: string): VideoLink {
  let parsed: URL
  try {
    parsed = new URL(raw.trim())
  } catch {
    throw new Error(LIBRARY_SAYS.notALink)
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error(LIBRARY_SAYS.notALink)
  }

  const host = parsed.hostname.toLowerCase()
  const segments = parsed.pathname.split("/").filter(Boolean)
  const url = parsed.toString()

  if (host === "youtu.be") {
    return known(url, "youtube", readId(segments[0], YOUTUBE_ID))
  }
  if (host === "youtube.com" || host.endsWith(".youtube.com")) {
    const kind = segments[0]?.toLowerCase()
    if (kind === "shorts") return known(url, "youtube", readId(segments[1], YOUTUBE_ID))
    if (kind === "watch") {
      return known(
        url,
        "youtube",
        readId(parsed.searchParams.get("v") ?? undefined, YOUTUBE_ID)
      )
    }
    throw new Error(LIBRARY_SAYS.notALink)
  }
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
    // tiktok.com/@creator/video/<id>. The shortened vm.tiktok.com/<code> and
    // tiktok.com/t/<code> only say which video once followed, so yt-dlp
    // names it after the download.
    const videoAt = segments.indexOf("video")
    if (videoAt >= 0) {
      return known(url, "tiktok", readId(segments[videoAt + 1], TIKTOK_ID))
    }
    const shortCode =
      host === "vm.tiktok.com" || host === "vt.tiktok.com"
        ? segments[0]
        : segments[0] === "t"
          ? segments[1]
          : undefined
    readId(shortCode, SHORT_CODE)
    return { url, source: "tiktok", platformVideoId: null }
  }
  if (host === "instagram.com" || host.endsWith(".instagram.com")) {
    // instagram.com/reel/<id>, /reels/<id>, /p/<id>, /tv/<id>.
    const kind = segments[0]?.toLowerCase()
    if (kind !== "reel" && kind !== "reels" && kind !== "p" && kind !== "tv") {
      throw new Error(LIBRARY_SAYS.notALink)
    }
    return known(url, "instagram", readId(segments[1], INSTAGRAM_ID))
  }

  if (!isPublicHostName(host)) throw new Error(LIBRARY_SAYS.notALink)
  return { url, source: null, platformVideoId: null }
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]+$/
const TIKTOK_ID = /^\d+$/
const SHORT_CODE = /^[A-Za-z0-9_-]+$/
const INSTAGRAM_ID = /^[A-Za-z0-9_-]+$/

function known(url: string, source: KnownSource, platformVideoId: string): VideoLink {
  return { url, source, platformVideoId }
}

/** An id longer than the column, or with anything odd in it, is not an id. */
function readId(value: string | undefined, allowed: RegExp): string {
  const id = (value ?? "").trim()
  if (!id || id.length > 100 || !allowed.test(id)) {
    throw new Error(LIBRARY_SAYS.notALink)
  }
  return id
}

/**
 * The shape half of the host check: a name with a dot in it, and not this
 * machine. A bare IP number is refused whatever it is, because a link to a
 * video names a site.
 */
function isPublicHostName(host: string) {
  const bare = host.replace(/^\[|\]$/g, "")
  if (isIP(bare)) return false
  if (bare === "localhost" || bare.endsWith(".localhost")) return false
  return bare.includes(".") && !bare.endsWith(".")
}

export type ResolveHost = (host: string) => Promise<string[]>

const resolveHost: ResolveHost = async (host) =>
  (await lookup(host, { all: true, verbatim: true })).map((entry) => entry.address)

/**
 * The address half of the host check, for a link from anywhere other than
 * the three known sites: every address the name answers with must be a public
 * one. A name that answers with nothing is not a site anybody can watch.
 */
export async function checkLinkHost(
  link: VideoLink,
  resolve: ResolveHost = resolveHost
): Promise<void> {
  if (link.source !== null) return
  const host = new URL(link.url).hostname
  let addresses: string[]
  try {
    addresses = await resolve(host)
  } catch {
    throw new Error(LIBRARY_SAYS.notALink)
  }
  if (!addresses.length || addresses.some(isPrivateAddress)) {
    throw new Error(LIBRARY_SAYS.notALink)
  }
}

/** Both halves at once: the link as saved, after its host has been checked. */
export async function readVideoLink(
  raw: string,
  resolve: ResolveHost = resolveHost
): Promise<VideoLink> {
  const link = parseVideoLink(raw)
  await checkLinkHost(link, resolve)
  return link
}
