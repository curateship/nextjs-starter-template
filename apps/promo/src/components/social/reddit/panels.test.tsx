import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"
import type { FindRow } from "@/server/social/keywords"
import type { PostingState } from "@/server/social/posting"

import { AnswerPanel, type FindDetail } from "./answer-panel"
import { FindsPanel } from "./finds-panel"

/**
 * What the Reddit panels draw, rendered from the real components. The clicks
 * themselves are one line each in `workspace.tsx`; this pins what is offered.
 */

const nothing = async () => {}

const find: FindDetail = {
  id: "f1",
  url: "https://www.reddit.com/r/SaaS/comments/one/",
  subreddit: "SaaS",
  title: "What do you use?",
  author: "someone",
  score: 3,
  commentCount: 1,
  postedAt: null,
  body: "A question.",
  linkUrl: "",
  linkPage: null,
  linkReadAt: null,
  linkError: "",
  thread: null,
  rules: { state: "unread", rules: [], readAt: null, error: "", reading: false },
  threadReadAt: null,
}

function answerPanel(
  onBack?: () => void,
  shown: FindDetail = find,
  postingState: PostingState | null = null
) {
  return renderToStaticMarkup(
    <TooltipProvider>
      <AnswerPanel
        find={shown}
        handle="me"
        drafts={[]}
        loading={false}
        working={false}
        disabledReason={null}
        postingState={postingState}
        voiceName={null}
        onRead={nothing}
        onReadRules={nothing}
        onDraft={nothing}
        onPost={nothing}
        onCancelWaiting={nothing}
        onSkip={nothing}
        onBack={onBack}
      />
    </TooltipProvider>
  )
}

describe("the way back to the list on a phone", () => {
  it("puts a back arrow on the post's header when the narrow layout asks for one", () => {
    const html = answerPanel(() => {})
    expect(html).toContain('aria-label="Back to the list"')
    // Skip and the open-on-Reddit button keep their places.
    expect(html).toContain("Skip")
    expect(html).toContain('title="Open this post on Reddit"')
  })

  it("draws no back arrow on the wide layout", () => {
    expect(answerPanel()).not.toContain("Back to the list")
  })
})

describe("a link post in the answer panel", () => {
  const link = { ...find, body: "", linkUrl: "https://example.com/churn" }

  it("shows the linked page, labelled as the page the post links to", () => {
    const html = answerPanel(undefined, {
      ...link,
      linkReadAt: new Date(),
      linkPage: { url: "https://example.com/churn", title: "We cut our churn in half", text: "Last year." },
    })
    expect(html).toContain("The page this post links to")
    expect(html).toContain("example.com")
    expect(html).toContain("We cut our churn in half")
    expect(html).not.toContain("no words of its own")
  })

  it("keeps the honest line, with the reason, when the page could not be read", () => {
    const html = answerPanel(undefined, { ...link, linkReadAt: new Date(), linkError: "The page answered 403." })
    expect(html).toContain("This post has no words of its own. It is a link or a picture.")
    expect(html).toContain("The page it links to could not be read. The page answered 403.")
  })

  it("says the page is being read rather than that it failed, before it has been tried", () => {
    expect(answerPanel(undefined, link)).toContain("Promo is reading the page it links to")
  })
})

describe("the subreddit's rules above the comment box", () => {
  const withRules = (rules: Partial<FindDetail["rules"]>) =>
    answerPanel(undefined, { ...find, rules: { ...find.rules, ...rules } })

  it("folds them to one line naming the self-promotion rule", () => {
    const html = withRules({
      state: "read",
      rules: [
        { title: "Be kind", description: "" },
        { title: "No self-promotion", description: "Never link your product." },
      ],
    })
    expect(html).toContain("r/SaaS has 2 rules, including &quot;No self-promotion&quot;")
  })

  it("says so when the subreddit has posted none, rather than an empty box", () => {
    expect(withRules({ state: "none" })).toContain("r/SaaS has posted no rules of its own.")
  })

  it("says Reddit would not show them, with a way to try again", () => {
    const html = withRules({ state: "failed", error: "Reddit says r/SaaS is private, so its rules cannot be read." })
    expect(html).toContain("Reddit says r/SaaS is private")
    expect(html).toContain("Try again")
  })

  it("tells not read yet apart from no rules", () => {
    const html = withRules({})
    expect(html).toContain("r/SaaS&#x27;s rules have not been read yet.")
    expect(html).toContain("Read them")
    expect(withRules({ reading: true })).toContain("Reading r/SaaS")
  })
})

function row(overrides: Partial<FindRow>): FindRow {
  return {
    id: "r1",
    keywordId: "k1",
    permalink: "/r/nosleep/comments/one/",
    url: "https://www.reddit.com/r/nosleep/comments/one/",
    subreddit: "nosleep",
    title: "A horror story",
    author: "someone",
    score: 314,
    commentCount: 28,
    postedAt: null,
    fit: "strong",
    rankReason: "Reddit's best match",
    status: "new",
    threadRead: false,
    ...overrides,
  }
}

function findsPanel(
  finds: FindRow[],
  tab: "new" | "commented",
  keyword: { term: string; subreddits: string[] } | null = {
    term: "reddit marketing tool",
    subreddits: [],
  }
) {
  return renderToStaticMarkup(
    <TooltipProvider>
      <FindsPanel
        keyword={keyword}
        keywordNames={new Map([["k1", "reddit marketing tool"], ["k2", "r/SaaS"]])}
        hasKeywords
        finds={finds}
        loading={false}
        error={null}
        selectedId={null}
        tab={tab}
        onTabChange={() => {}}
        onSelect={() => {}}
        onSkip={nothing}
        onBlock={nothing}
        onRetry={() => {}}
      />
    </TooltipProvider>
  )
}

describe("blocking a subreddit from a row", () => {
  it("offers a block button naming the row's subreddit", () => {
    expect(findsPanel([row({})], "new")).toContain('aria-label="Block r/nosleep"')
  })

  it("offers none on a post already replied to, which is never hidden", () => {
    const html = findsPanel([row({ status: "commented" })], "commented")
    expect(html).toContain("A horror story")
    expect(html).not.toContain("Block r/nosleep")
  })
})

describe("the search box over the posts", () => {
  it("sits in the panel's controls, beside the status tabs", () => {
    const html = findsPanel([row({})], "new")
    expect(html).toContain('aria-label="Search these posts by title, subreddit or author"')
    expect(html).toContain("To look at")
  })
})

describe("Everything, every keyword's posts in one list", () => {
  it("names the keyword that found each row", () => {
    const html = findsPanel(
      [row({}), row({ id: "r2", keywordId: "k2", title: "Pricing a tool" })],
      "new",
      null
    )
    expect(html).toContain(">Everything<")
    expect(html).toContain(">Keyword<")
    expect(html).toContain(">reddit marketing tool<")
    expect(html).toContain(">r/SaaS<")
  })

  it("keeps the Keyword column off a single keyword's list, where every row would say the same", () => {
    expect(findsPanel([row({})], "new")).not.toContain(">Keyword<")
  })
})

/** The account's pace and a comment held for its morning, as the Post panel shows them. */
describe("the pace line and a waiting comment", () => {
  const quiet: PostingState = {
    timeZone: "UTC",
    awake: true,
    nextWakeAt: null,
    warmUp: { endsAt: null, ageUnknown: false },
    young: false,
    lastHour: 3,
    lastDay: 11,
    warnPerHour: 4,
    youngPerHour: 2,
    youngPerDay: 6,
    limit: null,
    waiting: [],
  }

  it("says the counts in plain figures", () => {
    const html = answerPanel(undefined, find, quiet)
    expect(html).toContain("3 comments in the last hour, 11 today.")
    expect(html).not.toContain("New accounts get banned")
  })

  it("warns in words past the per-hour number, and Post is not refused for it", () => {
    const html = answerPanel(undefined, find, { ...quiet, lastHour: 4 })
    expect(html).toContain("That would be the 5th comment this hour. New accounts get banned for less.")
    expect(html).not.toContain("already waiting")
  })

  it("shows when a waiting comment goes, with a way to cancel it", () => {
    const runAfter = new Date(Date.now() + 3 * 3_600_000)
    const html = answerPanel(undefined, find, { ...quiet, waiting: [{ findId: find.id, runAfter }] })
    expect(html).toContain("Your comment is waiting for u/me&#x27;s waking hours and goes")
    expect(html).toContain("Cancel comment")
  })

  it("says nothing about a comment waiting on another post", () => {
    const html = answerPanel(undefined, find, {
      ...quiet,
      waiting: [{ findId: "another", runAfter: new Date(Date.now() + 3_600_000) }],
    })
    expect(html).not.toContain("Cancel comment")
  })
})
