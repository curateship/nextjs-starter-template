import { describe, expect, it } from "vitest"

import { readPageAnswers, readXPostPage, unescapeScriptString } from "@/server/note/library/x-page"

/**
 * Reading a post out of X's post page. The pages here are made up in the
 * shape X served on 19 Oct 2026: each data answer sits in a script as a
 * JavaScript string holding JSON. No real post is copied in.
 */

/** Writes one answer the way the page does: JSON, inside a JS string. */
function answerScript(requestId: number, value: unknown) {
  const json = JSON.stringify(JSON.stringify(value)).slice(1, -1).replace(/</g, "\\x3C")
  return `($R=>$R[51].next($R[57]={kind:"GraphQLRequestStream.Completed",requestId:${requestId},key:"abc{\\"restId\\":\\"1\\"}",result:$R[58]={kind:"Result.Ok",value:"${json}"}}))($R["tsr"])`
}

function page(...answers: unknown[]) {
  return `<!DOCTYPE html><html><body><script>${answers.map((answer, index) => answerScript(index, answer)).join(";")}</script></body></html>`
}

function user(handle: string, name: string) {
  return {
    result: {
      __typename: "User",
      avatar: { image_url: `https://pbs.twimg.com/profile_images/1/${handle}_normal.jpg` },
      core: { name, screen_name: handle },
    },
  }
}

function tweet(id: string, handle: string, text: string, extra: Record<string, unknown> = {}) {
  return {
    __typename: "Tweet",
    rest_id: id,
    core: { user_results: user(handle, handle.toUpperCase()) },
    counts: { favorite_count: 120, retweet_count: 7 },
    details: { created_at_ms: Date.UTC(2026, 9, 18, 9, 0), full_text: text },
    url_entities: [],
    media_entities2: [],
    ...extra,
  }
}

function byId(id: string, result: unknown) {
  return { data: { tweet_result_by_rest_id: { rest_id: id, result } } }
}

function conversation(...entries: unknown[]) {
  return {
    data: {
      threaded_conversation_with_injections_v2: {
        instructions: [{ __typename: "TimelineClearCache" }, { __typename: "TimelineAddEntries", entries }],
      },
    },
  }
}

function module(...tweets: unknown[]) {
  return {
    entry_id: "conversationthread-x",
    content: {
      __typename: "TimelineTimelineModule",
      items: tweets.map((each) => ({
        item: { content: { __typename: "TimelineTweet", tweet_results: { result: each } } },
      })),
    },
  }
}

function replyTo(id: string) {
  return { reply_to_results: { rest_id: id } }
}

describe("unescapeScriptString", () => {
  it("turns a page's escapes back into characters", () => {
    expect(unescapeScriptString(String.raw`a\x3Cb\n\"c\\dé`)).toBe('a<b\n"c\\dé')
  })
})

describe("readPageAnswers", () => {
  it("reads every answer, a post holding </script> included", () => {
    const html = page({ data: { a: "</script>" } }, { data: { b: 2 } })
    expect(readPageAnswers(html)).toEqual([{ data: { a: "</script>" } }, { data: { b: 2 } }])
  })
})

describe("readXPostPage", () => {
  it("reads a post with its author, date, counts and pictures", () => {
    const html = page(
      byId(
        "100",
        tweet("100", "maker", "Ship it &amp; learn https://t.co/pic", {
          media_entities2: [
            { type: "photo", media_url_https: "https://pbs.twimg.com/media/A.jpg", original_info: { width: 800, height: 600 } },
            { type: "photo", media_url_https: "https://evil.example/B.jpg" },
          ],
        })
      )
    )
    const read = readXPostPage(html, "100")
    expect(read.found).toBe(true)
    if (!read.found) return
    expect(read.post).toMatchObject({
      postId: "100",
      authorName: "MAKER",
      authorHandle: "maker",
      authorPictureUrl: "https://pbs.twimg.com/profile_images/1/maker_400x400.jpg",
      text: "Ship it & learn",
      url: "https://x.com/maker/status/100",
      likes: 120,
      reposts: 7,
      pictures: [{ url: "https://pbs.twimg.com/media/A.jpg?name=medium", width: 800, height: 600 }],
      threadStatus: "none",
      video: null,
      articleUrl: null,
    })
    expect(read.post.postedAt?.toISOString()).toBe("2026-10-18T09:00:00.000Z")
  })

  it("reads the long version of a long post, with its links opened", () => {
    const html = page(
      byId(
        "100",
        tweet("100", "maker", "The short version cut off… https://t.co/more", {
          note_tweet: {
            note_tweet_results: {
              result: {
                text: "The whole long post, with a link https://t.co/abc at the end.",
                entity_set: { urls: [{ url: "https://t.co/abc", expanded_url: "https://blog.example/post" }] },
              },
            },
          },
        })
      )
    )
    const read = readXPostPage(html, "100")
    if (!read.found) throw new Error("not found")
    expect(read.post.text).toBe("The whole long post, with a link https://blog.example/post at the end.")
    expect(read.post.articleUrl).toBe("https://blog.example/post")
  })

  it("reads the quoted post and leaves its link out of the words", () => {
    const html = page(
      byId(
        "100",
        tweet("100", "maker", "So true https://t.co/q", {
          url_entities: [{ url: "https://t.co/q", expanded_url: "https://x.com/other/status/50" }],
          quoted_tweet_results: { result: tweet("50", "other", "The original point") },
        })
      )
    )
    const read = readXPostPage(html, "100")
    if (!read.found) throw new Error("not found")
    expect(read.post.text).toBe("So true")
    expect(read.post.quoted).toMatchObject({
      postId: "50",
      authorHandle: "other",
      text: "The original point",
      url: "https://x.com/other/status/50",
    })
    expect(read.post.articleUrl).toBeNull()
  })

  it("picks the sharpest video at 720p or under", () => {
    const html = page(
      byId(
        "100",
        tweet("100", "maker", "Watch", {
          media_entities2: [
            {
              type: "video",
              media_url_https: "https://pbs.twimg.com/thumb.jpg",
              video_info: {
                duration_millis: 78_043,
                variants: [
                  { content_type: "application/x-mpegURL", url: "https://video.twimg.com/a.m3u8" },
                  { content_type: "video/mp4", bitrate: 632_000, url: "https://video.twimg.com/vid/avc1/320x568/a.mp4" },
                  { content_type: "video/mp4", bitrate: 2_176_000, url: "https://video.twimg.com/vid/avc1/720x1280/b.mp4" },
                  { content_type: "video/mp4", bitrate: 10_368_000, url: "https://video.twimg.com/vid/avc1/1080x1920/c.mp4" },
                ],
              },
            },
          ],
        })
      )
    )
    const read = readXPostPage(html, "100")
    if (!read.found) throw new Error("not found")
    expect(read.post.video).toEqual({
      url: "https://video.twimg.com/vid/avc1/720x1280/b.mp4",
      seconds: 78,
      coverUrl: "https://pbs.twimg.com/thumb.jpg",
    })
  })

  it("gathers the author's thread in order and stops at anybody else", () => {
    const html = page(
      byId("100", tweet("100", "maker", "How to start (a thread)")),
      conversation(
        { entry_id: "tweet-100", content: { __typename: "TimelineTimelineItem" } },
        module(tweet("200", "stranger", "@maker nice", replyTo("100"))),
        module(
          tweet("101", "maker", "Step one", replyTo("100")),
          tweet("102", "maker", "Step two", replyTo("101")),
          tweet("103", "stranger", "Interrupting", replyTo("102"))
        )
      )
    )
    const read = readXPostPage(html, "100")
    if (!read.found) throw new Error("not found")
    expect(read.post.thread.map((post) => post.text)).toEqual(["Step one", "Step two"])
    expect(read.post.threadStatus).toBe("whole")
  })

  it("says a thread was cut when X ends it with a show-more marker", () => {
    const html = page(
      byId("100", tweet("100", "maker", "Thread")),
      conversation({
        entry_id: "conversationthread-x",
        content: {
          __typename: "TimelineTimelineModule",
          items: [
            { item: { content: { __typename: "TimelineTweet", tweet_results: { result: tweet("101", "maker", "One", replyTo("100")) } } } },
            { item: { content: { __typename: "TimelineTimelineCursor" } } },
          ],
        },
      })
    )
    const read = readXPostPage(html, "100")
    if (!read.found) throw new Error("not found")
    expect(read.post.thread).toHaveLength(1)
    expect(read.post.threadStatus).toBe("cut")
  })

  it("says a thread was cut when the page had no replies and the post says it is one", () => {
    const read = readXPostPage(page(byId("100", tweet("100", "maker", "Ten lessons 🧵"))), "100")
    if (!read.found) throw new Error("not found")
    expect(read.post.threadStatus).toBe("cut")
  })

  it("tells a deleted post, a private one and a changed page apart", () => {
    expect(readXPostPage(page({ data: { tweet_result_by_rest_id: { rest_id: "100" } } }), "100")).toEqual({
      found: false,
      why: "deleted",
    })
    expect(readXPostPage(page(byId("100", { __typename: "TweetUnavailable" })), "100")).toEqual({
      found: false,
      why: "private",
    })
    expect(readXPostPage("<html>nothing here</html>", "100")).toEqual({ found: false, why: "changed" })
    expect(readXPostPage(page(byId("999", tweet("999", "x", "other"))), "100")).toEqual({
      found: false,
      why: "changed",
    })
  })

  it("unwraps a post X shows with a notice on it", () => {
    const read = readXPostPage(
      page(byId("100", { __typename: "TweetWithVisibilityResults", tweet: tweet("100", "maker", "Hello") })),
      "100"
    )
    expect(read.found && read.post.text).toBe("Hello")
  })
})
