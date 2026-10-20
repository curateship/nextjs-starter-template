import { postUrl } from "@/lib/note/library/x-links"

/**
 * Reading one post out of X's own post page.
 *
 * **Why the page.** X's paid API costs money per post, and Tyler turned it
 * down for Trade on 29 Sep 2026. X's public embed feed, the one websites use
 * to show a post, is free but cuts a long post off at about 280 characters and
 * has no thread (checked 19 Oct 2026 on five real posts). The post page a
 * signed-out browser gets has both: X renders it on the server and leaves the
 * data it rendered from in the HTML, as answers to its own data requests. One
 * of those holds the post, and another holds the replies, starting with the
 * author's own follow-on posts when the post opens a thread.
 *
 * **It is markup, so it will break.** X changes its page and this stops
 * finding things. Every field is read defensively: a post found without a
 * picture keeps its words, and a page with no post in it at all says so
 * rather than saving an empty post.
 */

export type ReadPicture = { url: string; width: number | null; height: number | null }

export type ReadPostBody = {
  postId: string
  authorName: string | null
  authorHandle: string | null
  authorPictureUrl: string | null
  postedAt: Date | null
  text: string
  pictures: ReadPicture[]
}

export type ReadVideo = {
  /** The mp4 to download: the best one at 720p or under. */
  url: string
  seconds: number | null
  coverUrl: string | null
}

export type ReadPost = ReadPostBody & {
  url: string
  likes: number | null
  reposts: number | null
  quoted: (ReadPostBody & { url: string }) | null
  thread: { postId: string; text: string; pictures: ReadPicture[] }[]
  threadStatus: "none" | "whole" | "cut"
  /** The first link in the post to a page off X. */
  articleUrl: string | null
  video: ReadVideo | null
}

export type PageRead =
  | { found: true; post: ReadPost }
  | { found: false; why: "deleted" | "private" | "changed" }

/** The most pictures X puts on one post. */
const MAX_PICTURES = 4
/** A thread longer than this is cut, and says so. */
const MAX_THREAD = 60
const X_LINK_HOSTS = /^(?:www\.|mobile\.)?(?:x\.com|twitter\.com|t\.co)$/i

/**
 * The answers X left in the page. Each sits in a script as
 * `kind:"GraphQLRequestStream.Completed",…,value:"<the answer as a JSON string>"`,
 * the value written as a JavaScript string, so it is unescaped once to get
 * the JSON and parsed once to get the answer.
 */
export function readPageAnswers(html: string): unknown[] {
  const answers: unknown[] = []
  const pattern =
    /kind:"GraphQLRequestStream\.Completed",requestId:\d+,key:"(?:[^"\\]|\\.)*",result:\$R\[\d+\]=\{kind:"Result\.Ok",value:"((?:[^"\\]|\\.)*)"/g
  for (const match of html.matchAll(pattern)) {
    try {
      answers.push(JSON.parse(unescapeScriptString(match[1])))
    } catch {
      // One answer that will not read is skipped; the rest may still hold the post.
    }
  }
  return answers
}

/**
 * A JavaScript string literal's insides, unescaped. JSON's own rules are
 * nearly the same, but a page escapes "<" as `\x3C` so a post containing
 * "</script>" cannot end the script early, and JSON has no `\x`.
 */
export function unescapeScriptString(value: string): string {
  return value.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|u\{[0-9a-fA-F]+\}|[\s\S])/g, (_, code: string) => {
    if (code[0] === "x") return String.fromCharCode(parseInt(code.slice(1), 16))
    if (code[0] === "u" && code[1] === "{") return String.fromCodePoint(parseInt(code.slice(2, -1), 16))
    if (code[0] === "u" && code.length === 5) return String.fromCharCode(parseInt(code.slice(1), 16))
    switch (code) {
      case "n":
        return "\n"
      case "r":
        return "\r"
      case "t":
        return "\t"
      case "b":
        return "\b"
      case "f":
        return "\f"
      case "v":
        return "\v"
      case "0":
        return "\0"
      default:
        return code
    }
  })
}

type Json = Record<string, unknown>

function asObject(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null
}

function asNumber(value: unknown): number | null {
  const number = typeof value === "string" ? Number(value) : value
  return typeof number === "number" && Number.isFinite(number) ? number : null
}

function dig(value: unknown, ...path: string[]): unknown {
  let at: unknown = value
  for (const key of path) at = asObject(at)?.[key]
  return at
}

/** A post result, unwrapped from the box X puts a post with a notice on in. */
function unwrapTweet(result: unknown): Json | null {
  const object = asObject(result)
  if (!object) return null
  if (object.__typename === "TweetWithVisibilityResults") return asObject(object.tweet)
  return object
}

/**
 * Finds the post in the page's answers. X answers "no such post" with an
 * empty result, a private post with a tombstone, and a post it holds back
 * from signed-out readers with an "unavailable" result.
 */
export function readXPostPage(html: string, postId: string): PageRead {
  const answers = readPageAnswers(html)
  let focal: Json | null = null
  let missing = false
  let unavailable = false
  let conversation: Json | null = null

  for (const answer of answers) {
    const data = asObject(dig(answer, "data"))
    if (!data) continue
    const byId = asObject(data.tweet_result_by_rest_id)
    if (byId && asString(byId.rest_id) === postId) {
      const result = unwrapTweet(byId.result)
      if (!result) missing = true
      else if (result.__typename === "Tweet") focal ??= result
      else unavailable = true
    }
    const thread = asObject(data.threaded_conversation_with_injections_v2)
    if (thread) conversation ??= thread
  }

  if (!focal) {
    if (unavailable) return { found: false, why: "private" }
    return { found: false, why: missing ? "deleted" : "changed" }
  }
  const body = readBody(focal)
  if (!body || body.postId !== postId) return { found: false, why: "changed" }

  const quotedTweet = unwrapTweet(dig(focal, "quoted_tweet_results", "result"))
  const quotedBody = quotedTweet?.__typename === "Tweet" ? readBody(quotedTweet) : null
  const quoted = quotedBody
    ? { ...quotedBody, url: postUrl(quotedBody.authorHandle, quotedBody.postId) }
    : null

  const links = readLinks(focal).filter((link) => !quoted || !isStatusLink(link, quoted.postId))
  const thread = readThread(conversation, body)

  return {
    found: true,
    post: {
      ...body,
      text: tidyText(focal, quoted?.postId ?? null),
      url: postUrl(body.authorHandle, postId),
      likes: asNumber(dig(focal, "counts", "favorite_count")),
      reposts: asNumber(dig(focal, "counts", "retweet_count")),
      quoted,
      thread: thread.posts,
      threadStatus:
        thread.posts.length || thread.cut
          ? thread.cut
            ? "cut"
            : "whole"
          : !conversation && looksLikeAThreadStart(body.text)
            ? "cut"
            : "none",
      articleUrl: links.find((link) => !isXLink(link)) ?? null,
      video: readVideo(focal),
    },
  }
}

function readBody(tweet: Json): ReadPostBody | null {
  const postId = asString(tweet.rest_id)
  if (!postId) return null
  const user = asObject(dig(tweet, "core", "user_results", "result"))
  const picture = asString(dig(user, "avatar", "image_url"))
  const createdMs = asNumber(dig(tweet, "details", "created_at_ms"))
  return {
    postId,
    authorName: asString(dig(user, "core", "name")),
    authorHandle: asString(dig(user, "core", "screen_name")),
    // "_normal" is 48 pixels; "_400x400" is the same picture large enough to keep.
    authorPictureUrl: picture ? picture.replace(/_normal(\.\w+)$/, "_400x400$1") : null,
    postedAt: createdMs ? new Date(createdMs) : null,
    text: tidyText(tweet, null),
    pictures: readPictures(tweet),
  }
}

/** The words: the long version when there is one, with X's short links opened. */
function tidyText(tweet: Json, quotedPostId: string | null): string {
  const note = asObject(dig(tweet, "note_tweet", "note_tweet_results", "result"))
  const raw = asString(note?.text) ?? asString(dig(tweet, "details", "full_text")) ?? ""
  const entities = note ? asArray(dig(note, "entity_set", "urls")) : asArray(tweet.url_entities)

  let text = raw
  for (const entity of entities) {
    const short = asString(asObject(entity)?.url)
    const long = asString(asObject(entity)?.expanded_url)
    if (!short) continue
    const replacement = long && !(quotedPostId && isStatusLink(long, quotedPostId)) ? long : ""
    text = text.split(short).join(replacement)
  }
  // What is left of X's short links points at the post's own pictures or video.
  text = text.replace(/https:\/\/t\.co\/\w+/g, "")
  return unescapeXText(text).replace(/[ \t]+\n/g, "\n").trim()
}

/** X writes &, < and > as entities in a post's words. */
function unescapeXText(text: string) {
  return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
}

function readLinks(tweet: Json): string[] {
  const note = asObject(dig(tweet, "note_tweet", "note_tweet_results", "result"))
  const entities = [...asArray(tweet.url_entities), ...asArray(dig(note, "entity_set", "urls"))]
  const links = entities.flatMap((entity) => {
    const link = asString(asObject(entity)?.expanded_url)
    return link && /^https?:\/\//i.test(link) ? [link] : []
  })
  return [...new Set(links)]
}

function isXLink(link: string) {
  try {
    return X_LINK_HOSTS.test(new URL(link).hostname)
  } catch {
    return true
  }
}

function isStatusLink(link: string, postId: string) {
  return isXLink(link) && new RegExp(`/status(?:es)?/${postId}(?:\\D|$)`).test(link)
}

function media(tweet: Json): Json[] {
  return asArray(tweet.media_entities2).flatMap((entry) => {
    const object = asObject(entry)
    return object ? [object] : []
  })
}

function readPictures(tweet: Json): ReadPicture[] {
  return media(tweet)
    .filter((entry) => entry.type === "photo")
    .flatMap((entry) => {
      const url = asString(entry.media_url_https)
      if (!url || !/^https:\/\/pbs\.twimg\.com\//.test(url)) return []
      return [
        {
          // "medium" is up to 1200 pixels across: plenty to read a screenshot by.
          url: `${url.split("?")[0]}?name=medium`,
          width: asNumber(dig(entry, "original_info", "width")),
          height: asNumber(dig(entry, "original_info", "height")),
        },
      ]
    })
    .slice(0, MAX_PICTURES)
}

/**
 * The post's video, as the mp4 to download: the sharpest one at 720p or
 * under, because every phone's player plays that and it keeps the file small.
 * A moving picture (X's "GIF") is a short silent video, and is left out.
 */
function readVideo(tweet: Json): ReadVideo | null {
  const entry = media(tweet).find((item) => item.type === "video")
  if (!entry) return null
  const variants = asArray(dig(entry, "video_info", "variants")).flatMap((variant) => {
    const object = asObject(variant)
    const url = asString(object?.url)
    if (!object || object.content_type !== "video/mp4" || !url) return []
    if (!/^https:\/\/video\.twimg\.com\//.test(url)) return []
    const size = url.match(/\/(\d+)x(\d+)\//)
    const height = size ? Math.min(Number(size[1]), Number(size[2])) : null
    return [{ url, bitrate: asNumber(object.bitrate) ?? 0, height }]
  })
  if (!variants.length) return null
  const small = variants.filter((variant) => variant.height === null || variant.height <= 720)
  const pick = (small.length ? small : variants).sort((left, right) => right.bitrate - left.bitrate)[0]
  const millis = asNumber(dig(entry, "video_info", "duration_millis"))
  return {
    url: pick.url,
    seconds: millis === null ? null : Math.round(millis / 1000),
    coverUrl: asString(entry.media_url_https),
  }
}

/**
 * The author's own follow-on posts. A signed-out page lists the replies as
 * groups, and a thread is the group whose first post is the author answering
 * this very post; the group runs on with the author answering themselves.
 * A group that ends in a "show more" marker was cut short by X.
 */
function readThread(
  conversation: Json | null,
  focal: ReadPostBody
): { posts: ReadPost["thread"]; cut: boolean } {
  if (!conversation || !focal.authorHandle) return { posts: [], cut: false }
  const entries = asArray(conversation.instructions).flatMap((instruction) =>
    asArray(asObject(instruction)?.entries)
  )

  for (const entry of entries) {
    const items = asArray(dig(entry, "content", "items"))
    const posts: ReadPost["thread"] = []
    let replyingTo = focal.postId
    let cut = false
    for (const item of items) {
      const content = asObject(dig(item, "item", "content"))
      if (content?.__typename === "TimelineTimelineCursor") {
        cut = posts.length > 0
        break
      }
      const tweet = unwrapTweet(dig(content, "tweet_results", "result"))
      if (!tweet || tweet.__typename !== "Tweet") break
      const body = readBody(tweet)
      const replyTo = asString(dig(tweet, "details", "reply_to_results", "rest_id")) ??
        asString(dig(tweet, "reply_to_results", "rest_id"))
      if (!body || body.authorHandle?.toLowerCase() !== focal.authorHandle.toLowerCase()) break
      if (replyTo && replyTo !== replyingTo) break
      posts.push({ postId: body.postId, text: body.text, pictures: body.pictures })
      replyingTo = body.postId
    }
    if (posts.length) {
      return { posts: posts.slice(0, MAX_THREAD), cut: cut || posts.length > MAX_THREAD }
    }
  }
  return { posts: [], cut: false }
}

/**
 * A page that had no replies in it at all cannot say whether the post opens
 * a thread. A post that says it does ("🧵", "1/", "a thread") is marked as
 * cut, so the card says the rest could not be read.
 */
function looksLikeAThreadStart(text: string) {
  return /🧵|(?:^|\s)1\s?\/\s?\d*(?:\s|$)|\ba thread\b|👇\s*$/i.test(text)
}
