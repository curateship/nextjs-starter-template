import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"
import type { FindRow } from "@/server/social/keywords"

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
  thread: null,
  rules: { state: "unread", rules: [], readAt: null, error: "", reading: false },
  threadReadAt: null,
}

function answerPanel(onBack?: () => void, shown: FindDetail = find) {
  return renderToStaticMarkup(
    <TooltipProvider>
      <AnswerPanel
        find={shown}
        handle="me"
        drafts={[]}
        loading={false}
        working={false}
        disabledReason={null}
        voiceName={null}
        onRead={nothing}
        onReadRules={nothing}
        onDraft={nothing}
        onPost={nothing}
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

function findsPanel(finds: FindRow[], tab: "new" | "commented") {
  return renderToStaticMarkup(
    <TooltipProvider>
      <FindsPanel
        keyword={{ term: "reddit marketing tool", subreddits: [] }}
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
