import { describe, expect, it } from "vitest"

import type { SocialPost } from "@/lib/viral/promo-link"
import { cleanWatchValue, watchKinds, watchLabel } from "@/lib/viral/socials"
import {
  describeTextPostsView,
  filterTextPosts,
  postAuthor,
  readTextPostSort,
  sortTextPosts,
  textPostSorts,
  textPostsViewFilters,
} from "@/lib/viral/text-posts"

const post = (id: string, figures: Partial<SocialPost>): SocialPost => ({
  id,
  projectId: "p",
  network: "x",
  postId: id,
  url: `https://x.com/a/status/${id}`,
  title: "",
  text: "",
  authorHandle: "",
  authorName: "",
  authorFollowers: null,
  postedAt: null,
  views: null,
  likes: null,
  replies: null,
  reposts: null,
  link: "",
  community: "",
  topReplies: [],
  repliesReadAt: null,
  firstSeenAt: "2099-01-01T00:00:00.000Z",
  ...figures,
})

describe("the posts list", () => {
  it("offers only the figures a social shows, in its words", () => {
    expect(textPostSorts("reddit").map((sort) => sort.label)).toEqual(["Newest", "Upvotes", "Comments"])
    expect(textPostSorts("x").map((sort) => sort.label)).toEqual(["Newest", "Views", "Likes", "Replies", "Reposts"])
  })

  it("falls back to the social's biggest figure for a sort it doesn't offer", () => {
    expect(readTextPostSort("reddit", "views")).toBe("likes")
    expect(readTextPostSort("x", undefined)).toBe("views")
    expect(readTextPostSort("x", "replies")).toBe("replies")
  })

  it("sorts biggest first, a missing number last, ties to the newest", () => {
    const posts = [
      post("hidden", { views: null }),
      post("small", { views: 10 }),
      post("big-old", { views: 500, postedAt: "2099-01-01T00:00:00.000Z" }),
      post("big-new", { views: 500, postedAt: "2099-01-02T00:00:00.000Z" }),
    ]
    expect(sortTextPosts(posts, "views").map((one) => one.id)).toEqual(["big-new", "big-old", "small", "hidden"])
  })

  it("names the writer once", () => {
    expect(postAuthor({ network: "x", authorName: "Dad Cooks", authorHandle: "dad" })).toBe("Dad Cooks @dad")
    expect(postAuthor({ network: "reddit", authorName: "", authorHandle: "u/quiet" })).toBe("u/quiet")
  })
})

describe("what a project reads", () => {
  it("never offers a single post as something to keep reading", () => {
    expect(watchKinds("x")).toEqual(["search", "hashtag", "account"])
    expect(watchKinds("reddit")).toEqual(["search", "subreddit"])
  })

  it("keeps r/, @ and # off the value, and puts them back on screen", () => {
    expect(cleanWatchValue("subreddit", " r/Fitness ")).toBe("Fitness")
    expect(cleanWatchValue("account", "@dad")).toBe("dad")
    expect(cleanWatchValue("hashtag", "#mealprep")).toBe("mealprep")
    expect(cleanWatchValue("search", "   ")).toBeNull()
    expect(watchLabel("subreddit", "Fitness")).toBe("r/Fitness")
  })
})

describe("the posts list's search, filter, order and views", () => {
  const posts = [
    post("a", { text: "Meal prep for the week", likes: 50, authorName: "Ann" }),
    post("b", { text: "Gym day", likes: 5_000, community: "mealprep", network: "reddit" }),
    post("c", { text: "Lunch ideas", likes: 2_000, authorHandle: "mealprepdad" }),
    post("d", { text: "Hidden likes, meal prep", likes: null }),
  ]

  it("searches the words, writer and subreddit of one social's posts", () => {
    expect(filterTextPosts(posts, { social: "x", q: "MEAL" }).map((one) => one.id)).toEqual(["a", "c", "d"])
    expect(filterTextPosts(posts, { social: "reddit", q: "mealprep" }).map((one) => one.id)).toEqual(["b"])
  })

  it("keeps only posts with at least the likes asked for, leaving hidden ones out", () => {
    expect(filterTextPosts(posts, { social: "x", minLikes: 100 }).map((one) => one.id)).toEqual(["c"])
  })

  it("turns the order round, with a missing figure still last", () => {
    const x = posts.filter((one) => one.network === "x")
    expect(sortTextPosts(x, "likes").map((one) => one.id)).toEqual(["c", "a", "d"])
    expect(sortTextPosts(x, "likes", "asc").map((one) => one.id)).toEqual(["a", "c", "d"])
  })

  it("keeps a view's social, search, sort, order and minimum, and drops the rest", () => {
    const kept = textPostsViewFilters({ social: "reddit", q: " prep ", psort: "likes", pdir: "asc", pmin: "1000", from: "keyword", pmin2: 3 })
    expect(kept).toEqual({ social: "reddit", q: "prep", psort: "likes", pdir: "asc", pmin: 1_000 })
    expect(textPostsViewFilters({ social: "tiktok", pmin: 7, pdir: "desc" })).toEqual({})
    expect(describeTextPostsView(kept, (one) => one.toUpperCase())).toBe('REDDIT · "prep" · Sort: Upvotes, lowest first · 1,000+ upvotes')
  })
})
