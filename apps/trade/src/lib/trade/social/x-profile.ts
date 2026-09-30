/**
 * Reading a public X profile page.
 *
 * **Why the page and not the API.** X's API is pay-per-use: $0.005 a post and
 * $0.010 a profile read, which is $60 to backfill thirty creators and about
 * $32 a month to keep them current. Tyler said no on 29 Sep 2026. The profile
 * page is one ordinary web request to a public address and costs nothing.
 *
 * **What is actually in that page.** X server-renders the profile and leaves
 * the data it rendered from in the HTML: the exact follower count, the display
 * name, the picture, the bio and its links, and the handful of posts the
 * profile shows. Nothing here is hidden, signed in or paid for.
 *
 * **What it does not give is history.** A profile page holds the recent posts,
 * not three months of them, so pasting stays the way a creator's back
 * catalogue gets in.
 *
 * **It is markup, so it will break.** X changes its front end and this stops
 * finding things. Every field is therefore optional: a read that finds the
 * follower count and no posts writes the follower count, and a read that finds
 * nothing at all leaves what is already stored alone rather than wiping it.
 */

/** One post, read and ready to store. */
export type ParsedSocialPost = {
  /** The post's own id at X. */
  sourceId: string
  postedAt: number
  text: string
  url: string | null
  /** How many people saw it. Null when the page did not say. */
  seen: number | null
  likes: number | null
  replies: number | null
  reposts: number | null
  replyToId: string | null
}

/**
 * What a read said about the account itself, rather than about one post.
 *
 * Every field can be null, meaning the read did not find it. A null is left
 * alone when it is stored, so a read that loses track of the follower count
 * never wipes the last one that worked.
 */
export type ParsedSocialCreator = {
  followers: number | null
  displayName: string | null
  picture: string | null
  links: SocialLink[] | null
}

/** One link a creator lists: the words they show, and where it goes. */
export type SocialLink = {
  /** What X displays, such as "binance.com". */
  label: string
  url: string
}

export type XProfileRead = {
  /** False when X answered "no such account". */
  found: boolean
  followers: number | null
  displayName: string | null
  picture: string | null
  links: SocialLink[]
  posts: ParsedSocialPost[]
}

const MAX_LINKS = 10
const MAX_POSTS = 50

const EMPTY_X_PROFILE: XProfileRead = {
  found: true,
  followers: null,
  displayName: null,
  picture: null,
  links: [],
  posts: [],
}

export function readXProfilePage(html: string, handle: string): XProfileRead {
  if (/User Profile Not Found/i.test(html)) {
    return { ...EMPTY_X_PROFILE, found: false }
  }

  return {
    found: true,
    followers: readFollowers(html, handle),
    displayName: readDisplayName(html, handle),
    picture: readPicture(html),
    links: readLinks(html),
    posts: readPosts(html, handle),
  }
}

/**
 * The exact count, not the "241.7M" the page prints. The number is read out of
 * the block belonging to this handle, because a profile page also carries the
 * accounts whose posts it is showing.
 */
function readFollowers(html: string, handle: string): number | null {
  const owner = new RegExp(
    `screen_name:"${escapeForRegex(handle)}"[\\s\\S]{0,2000}?relationship_counts:\\$R\\[\\d+\\]=\\{followers:(\\d+)`,
    "i"
  )
  const found = owner.exec(html)
  return found ? Number(found[1]) : null
}

function readDisplayName(html: string, handle: string): string | null {
  const owner = new RegExp(
    `name:"((?:[^"\\\\]|\\\\.){0,80})",screen_name:"${escapeForRegex(handle)}"`,
    "i"
  )
  const found = owner.exec(html)
  return found ? unescapeJs(found[1]).slice(0, 80) || null : null
}

function readPicture(html: string): string | null {
  const found = /<meta property="og:image" content="([^"]+)"/.exec(html)
  const url = found?.[1] ?? null
  // The 404 page has an og:image too, and it is X's own placeholder.
  return url && url.includes("/profile_images/") ? url : null
}

/**
 * The creator's own links: the website field first, then the links in the bio.
 *
 * Only the ones under `profile_bio`. The same page carries a link per photo
 * and per video in the posts it shows, and those belong to the posts, not to
 * the person.
 */
function readLinks(html: string): SocialLink[] {
  const block = /profile_bio:\$R\[\d+\]=\{[\s\S]{0,4000}?\}\}\},/.exec(html)
  if (!block) return []

  const website = /url:\$R\[\d+\]=\{urls:[\s\S]{0,600}?\}\]\}/.exec(block[0])
  const inBio = /description:\$R\[\d+\]=\{urls:[\s\S]{0,1500}?\}\]/.exec(
    block[0]
  )

  const links: SocialLink[] = []
  for (const part of [website?.[0], inBio?.[0]]) {
    if (!part) continue
    for (const one of part.matchAll(
      /display_url:"([^"]{0,120})",expanded_url:"([^"]{0,300})"/g
    )) {
      const url = safeLink(one[2])
      if (url && !links.some((link) => link.url === url)) {
        links.push({ label: one[1] || url, url })
      }
    }
  }
  return links.slice(0, MAX_LINKS)
}

/** Only http and https reach a browser's address bar from this list. */
function safeLink(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return url.toString()
  } catch {
    return null
  }
}

/**
 * The posts the profile page is showing, and only this creator's.
 *
 * The page carries whatever the profile displays, which includes other
 * people's posts when this creator has reposted them. Each record says whose
 * it is, and a record that does not say this handle is left out rather than
 * filed under the wrong person.
 */
function readPosts(html: string, handle: string): ParsedSocialPost[] {
  const posts: ParsedSocialPost[] = []
  const wanted = handle.toLowerCase()

  // Each record opens with its own id and the marker saying it is a post.
  // Anchoring on that pairs the id with the right words; matching the fields
  // separately across the whole page pairs whatever happens to come next.
  const starts = [
    ...html.matchAll(
      /rest_id:"(\d{5,30})",result:\$R\[\d+\]=\{__isTweetResult:"Tweet"/g
    ),
  ]

  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index]
    // Bounded by where the next record begins. A quoted post sits inside its
    // parent, and an unbounded window would file the quote's words under the
    // person who quoted them.
    const end = starts[index + 1]?.index ?? html.length
    const body = html.slice(start.index, end)

    const owner = /screen_name:"([A-Za-z0-9_]{1,15})"/.exec(body)
    if (!owner || owner[1].toLowerCase() !== wanted) continue

    const text = /full_text:"((?:[^"\\]|\\.){0,4000})"/.exec(body)
    const at = /created_at_ms:(\d{10,16})/.exec(body)
    if (!text || !at) continue

    const id = start[1]
    posts.push({
      sourceId: id,
      postedAt: Number(at[1]),
      text: unescapeJs(text[1]).trim(),
      url: `https://x.com/${handle}/status/${id}`,
      seen: readNumber(/views:\$R\[\d+\]=\{count:"(\d+)"/.exec(body)),
      likes: readNumber(/favorite_count:(\d+)/.exec(body)),
      replies: readNumber(/reply_count:(\d+)/.exec(body)),
      reposts: readNumber(/retweet_count:(\d+)/.exec(body)),
      replyToId: null,
    })
    if (posts.length >= MAX_POSTS) break
  }

  // A pinned post appears twice, once pinned and once in the timeline.
  const byId = new Map(posts.map((post) => [post.sourceId, post]))
  return [...byId.values()].filter((post) => post.text.length > 0)
}

function readNumber(found: RegExpExecArray | null): number | null {
  return found ? Number(found[1]) : null
}

/** `\n` and `\"` inside the page's own string literals. */
function unescapeJs(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, code: string) =>
      String.fromCharCode(parseInt(code, 16))
    )
    .replace(/\\\\/g, "\\")
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
