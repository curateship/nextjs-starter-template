import type { NoteVideoDetail, TranscriptLine } from "@/lib/note/videos"

/**
 * A made-up two-minute talk, shown with a Sample badge until the first real
 * video is saved, so the right panel can be looked at full the moment the app
 * opens. It is never saved, never sent and never fetched: it lives in this
 * file and nowhere else, and a tick or a note on it stays on the screen.
 */

export const SAMPLE_VIDEO_ID = "sample-video"

const lines: [number, string][] = [
  [0, "Most people price their first product by guessing, and then they never touch the number again."],
  [6000, "I did exactly that. I charged nineteen dollars because it felt safe."],
  [12000, "The problem is that a safe price tells you nothing about what people will pay."],
  [18000, "So here is what I do now, in four steps."],
  [23000, "Step one. Write down the one result your product gets for someone."],
  [29000, "Not the features. The result. Saved four hours a week, or won two more clients."],
  [35500, "Step two. Put a dollar figure on that result for your best customer."],
  [42000, "If it saves a freelancer four hours a week, that is worth hundreds a month to them."],
  [48500, "Step three. Charge about a tenth of that figure, and say the figure out loud on the page."],
  [55000, "People compare your price to the result, not to the cheapest tool they have seen."],
  [61000, "Step four. Raise the price for every tenth customer until somebody says no."],
  [67500, "A few people saying no is how you find the ceiling. Nobody saying no means you are too cheap."],
  [74000, "When I did this, the price went from nineteen to sixty-nine dollars."],
  [80000, "Sales went down for one week and then came back to where they were."],
  [86000, "So the same number of customers paid more than three times as much."],
  [92000, "The other thing that changed was the kind of customer."],
  [97500, "People who pay more ask fewer questions and stay longer."],
  [103000, "If you take one thing from this, write the result first and price second."],
  [109000, "And put a date in your calendar to look at the price again in a month."],
  [115000, "That is it. Go and raise your price."],
]

const transcript: TranscriptLine[] = lines.map(([startMs, text], index) => ({
  startMs,
  endMs: lines[index + 1]?.[0] ?? 120_000,
  text,
}))

export const SAMPLE_VIDEO: NoteVideoDetail = {
  id: SAMPLE_VIDEO_ID,
  sample: true,
  folderId: null,
  source: "youtube",
  sourceUrl: null,
  kind: "video",
  status: "ready",
  error: null,
  coverUrl: "/note/sample-cover.jpg",
  hasFile: false,
  title: "How to price your first product",
  channelName: "Sample channel",
  durationSeconds: 120,
  firstSummaryLine: "A safe, guessed price tells you nothing about what people will really pay.",
  tags: ["pricing", "product launch", "customers", "revenue"],
  done: false,
  noteFirstLine: null,
  createdAt: "2026-10-17T12:00:00.000Z",
  playbackUrl: null,
  postedAt: "2026-10-01T12:00:00.000Z",
  language: "en",
  transcript,
  summary: [
    "A safe, guessed price tells you nothing about what people will really pay.",
    "Start from the one result the product gets for a customer, not its features.",
    "Put a dollar figure on that result and charge about a tenth of it.",
    "Raise the price for every tenth customer until some of them say no.",
    "A higher price brought the same number of customers and better ones.",
  ],
  actionPlan: [
    { text: "Write down the one result your product gets for a customer.", done: false },
    { text: "Put a dollar figure on that result for your best customer.", done: false },
    { text: "Set the price at about a tenth of that figure.", done: false },
    { text: "Say the dollar figure of the result on your pricing page.", done: false },
    { text: "Raise the price for every tenth new customer.", done: false },
    { text: "Put a date in your calendar to look at the price again in a month.", done: false },
  ],
  quotes: [
    { text: "A safe price tells you nothing about what people will pay.", startMs: 12000 },
    { text: "Nobody saying no means you are too cheap.", startMs: 67500 },
    { text: "Write the result first and price second.", startMs: 103000 },
  ],
  note: "",
  analysedAt: "2026-10-17T12:00:00.000Z",
}
