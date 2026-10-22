import type { CardSource, ChatTrend, MatchFlag, SwipeDecision } from "@/lib/dating/options"
import { isLike } from "@/lib/dating/options"
import { readOneOf, readSearchText } from "@/lib/nav/list-search"

/**
 * Leads: the Dating dashboard's middle list (task "features/05-dashboard-layout",
 * Tyler, 20 Oct 2026: "middle is a list of all the leads and its status"). A
 * lead is one person: the card the phone read, and the chat once they match.
 * A chat whose card Date never read is a lead of its own.
 *
 * Everything here is worked out from the rows the dashboard already reads, so
 * the browser filters and sorts without asking the server again.
 */

/** One status per lead, in the order a lead goes through them. */
export const LEAD_STATUSES = ["new", "liked", "passed", "matched", "chatting", "date", "over"] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]

export const LEAD_STATUS_WORDS: Record<LeadStatus, string> = {
  new: "New",
  liked: "Liked",
  passed: "Passed",
  matched: "Matched",
  chatting: "Chatting",
  date: "Date set",
  over: "Over",
}

/** Why an over lead is over, said in its grey line. */
export type LeadOverWhy = "ended" | "moved" | "unmatched-them" | "unmatched-you"

export const LEAD_OVER_WORDS: Record<LeadOverWhy, string> = {
  ended: "The AI read it as over",
  moved: "Moved to text",
  "unmatched-them": "They unmatched",
  "unmatched-you": "You unmatched",
}

/**
 * What a lead waits on the member for: a draft to send, a flag to look at,
 * the AI's question, or a card the member decides because they met this
 * person on another profile and matched or chatted there (part 15 of
 * "facebook/01", "Matched or chatted there means Tyler decides").
 */
export type LeadWaiting = "draft" | "flag" | "question" | "decide"

export type LeadListItem = {
  /** The card's id, or the chat's when Date never read the card. `?open=` holds it. */
  id: string
  profileId: string | null
  matchId: string | null
  name: string
  age: number | null
  photoId: string | null
  score: number | null
  swipe: SwipeDecision
  swipedBy: "member" | "ai" | null
  status: LeadStatus
  overWhy: LeadOverWhy | null
  waiting: LeadWaiting | null
  /** The chat's last line, empty for a card with no chat. */
  lastLine: string
  /** When the lead last moved: its newest message, the match, the swipe, or the read. */
  changedAt: Date
  unreadCount: number
  trend: ChatTrend
  /** They said yes to a date. */
  dateAccepted: boolean
  dateAt: Date | null
  datePlace: string
  sample: boolean
  /** Where its card came from: the cards in front, Facebook's Likes you list or its weekly match. Null for a chat with no card. */
  source: CardSource | null
}

/** A card as the dashboard reads it, for `buildLeads`. */
export type LeadCard = {
  id: string
  name: string
  age: number | null
  photoId: string | null
  score: number | null
  swipe: SwipeDecision
  swipedBy: "member" | "ai" | null
  swipedAt: Date | null
  readAt: Date
  sample: boolean
  source?: CardSource
  /** Met on another profile and matched or chatted there: the member likes or passes it. */
  yourCall?: boolean
}

/** A chat as the dashboard reads it, for `buildLeads`. */
export type LeadChat = {
  id: string
  profileId: string | null
  theirName: string
  photoId: string | null
  lastLine: string
  lastMessageAt: Date | null
  matchedAt: Date
  unreadCount: number
  hasDraft: boolean
  draftSendsItself: boolean
  flagged: MatchFlag | null
  messagesFromThem: number
  messagesFromUs: number
  unmatchedBy: "member" | "them" | null
  ended: boolean
  movedToText: boolean
  aiOff: boolean
  dateAccepted: boolean
  dateAt: Date | null
  datePlace: string
  trend: ChatTrend
  sample: boolean
}

function chatStatus(chat: LeadChat): { status: LeadStatus; overWhy: LeadOverWhy | null } {
  if (chat.unmatchedBy) return { status: "over", overWhy: chat.unmatchedBy === "them" ? "unmatched-them" : "unmatched-you" }
  if (chat.movedToText) return { status: "over", overWhy: "moved" }
  if (chat.ended) return { status: "over", overWhy: "ended" }
  if (chat.dateAccepted) return { status: "date", overWhy: null }
  if (chat.messagesFromThem + chat.messagesFromUs > 0) return { status: "chatting", overWhy: null }
  return { status: "matched", overWhy: null }
}

function cardStatus(card: LeadCard): LeadStatus {
  if (card.swipe === "none") return "new"
  return isLike(card.swipe) ? "liked" : "passed"
}

/**
 * What the chat waits on the member for. A draft the AI sends by itself at its
 * time is not waiting on anybody, and an over chat waits on nothing.
 */
function chatWaiting(chat: LeadChat, over: boolean): LeadWaiting | null {
  if (over) return null
  if (chat.flagged === "missing_fact") return "question"
  if (chat.flagged) return "flag"
  if (chat.hasDraft && !chat.draftSendsItself && !chat.aiOff) return "draft"
  return null
}

/**
 * One lead per person: each chat joined to the card it came from, then every
 * card with no chat. Newest change first.
 */
export function buildLeads(cards: LeadCard[], chats: LeadChat[]): LeadListItem[] {
  const cardsById = new Map(cards.map((card) => [card.id, card]))
  const chatted = new Set<string>()
  const leads: LeadListItem[] = []
  for (const chat of chats) {
    // A second chat tied to a card that already has one is a lead of its own,
    // so no two leads share an id. A card outside the ones read in here still
    // opens on the right by its id, with its details left out of the row.
    const cardId = chat.profileId && !chatted.has(chat.profileId) ? chat.profileId : null
    const card = cardId ? cardsById.get(cardId) : undefined
    if (cardId) chatted.add(cardId)
    const { status, overWhy } = chatStatus(chat)
    leads.push({
      id: cardId ?? chat.id,
      profileId: cardId,
      matchId: chat.id,
      name: chat.theirName || card?.name || "",
      age: card?.age ?? null,
      photoId: chat.photoId ?? card?.photoId ?? null,
      score: card?.score ?? null,
      swipe: card?.swipe ?? "like",
      swipedBy: card?.swipedBy ?? null,
      status,
      overWhy,
      waiting: chatWaiting(chat, status === "over"),
      lastLine: chat.lastLine,
      changedAt: chat.lastMessageAt ?? chat.matchedAt,
      unreadCount: chat.unreadCount,
      trend: chat.trend,
      dateAccepted: chat.dateAccepted && !chat.unmatchedBy,
      dateAt: chat.dateAt,
      datePlace: chat.datePlace,
      sample: chat.sample,
      source: card?.source ?? null,
    })
  }
  for (const card of cards) {
    if (chatted.has(card.id)) continue
    leads.push({
      id: card.id,
      profileId: card.id,
      matchId: null,
      name: card.name,
      age: card.age,
      photoId: card.photoId,
      score: card.score,
      swipe: card.swipe,
      swipedBy: card.swipedBy,
      status: cardStatus(card),
      overWhy: null,
      waiting: card.yourCall && card.swipe === "none" ? "decide" : null,
      lastLine: "",
      changedAt: card.swipedAt ?? card.readAt,
      unreadCount: 0,
      trend: "too_early",
      dateAccepted: false,
      dateAt: null,
      datePlace: "",
      sample: card.sample,
      source: card.source ?? "card",
    })
  }
  return leads.sort((a, b) => b.changedAt.getTime() - a.changedAt.getTime())
}

// ------------------------------------------------------------- The view --

/** The middle header's tabs: every lead, those who matched, those who said yes to a date. */
export const LEAD_TABS = ["all", "matches", "dates"] as const
export type LeadTab = (typeof LEAD_TABS)[number]

/** A left-panel group, which is also the Filter's Status row: a status, or waiting on the member. */
export const LEAD_GROUPS = ["waiting", ...LEAD_STATUSES] as const
export type LeadGroup = (typeof LEAD_GROUPS)[number]

export const LEAD_GROUP_WORDS: Record<LeadGroup, string> = { waiting: "Waiting on you", ...LEAD_STATUS_WORDS }

export const LEAD_SORTS = ["changed", "score", "name"] as const
export type LeadSort = (typeof LEAD_SORTS)[number]

export const LEAD_SORT_WORDS: Record<LeadSort, string> = { changed: "Last change", score: "Score", name: "Name" }

/** The lowest scores the Filter offers. */
export const LEAD_SCORE_FLOORS = [50, 60, 70, 80, 90] as const

/** What the address can hold about the list, every one optional. The defaults stay out. */
export type LeadView = {
  tab?: Exclude<LeadTab, "all">
  q?: string
  group?: LeadGroup
  /** Who swiped. */
  by?: "member" | "ai"
  /** The lowest score shown. */
  score?: number
  /** Over leads are hidden unless this is on, or the Over group is picked. */
  over?: boolean
  /** Sample leads are hidden when this is on. */
  real?: boolean
  sort?: Exclude<LeadSort, "changed">
  /** Only when it is not the sort's own: newest, highest and A to Z come first. */
  direction?: "asc" | "desc"
}

/** Each sort's own order: the newest change and the highest score first, names A to Z. */
export function defaultLeadDirection(sort: LeadSort): "asc" | "desc" {
  return sort === "name" ? "asc" : "desc"
}

/** How many of the Filter's own rows are set, for its button. */
export function leadFilterCount(view: LeadView): number {
  return [view.group, view.by, view.score, view.over, view.real].filter((value) => value !== undefined && value !== false).length
}

function matchesSearch(lead: LeadListItem, words: string): boolean {
  const text = `${lead.name} ${lead.lastLine}`.toLowerCase()
  return words
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => text.includes(word))
}

/** Whether a lead belongs in a group. */
function inGroup(lead: LeadListItem, group: LeadGroup): boolean {
  return group === "waiting" ? lead.waiting !== null : lead.status === group
}

/**
 * The leads the middle list shows, in its order. Over leads stay out until
 * Show over is on or the Over group is picked. With no sort picked, leads
 * waiting on the member come first, then the newest change.
 */
export function shownLeads(leads: LeadListItem[], view: LeadView): LeadListItem[] {
  const shown = leads.filter((lead) => {
    if (view.tab === "matches" && !lead.matchId) return false
    if (view.tab === "dates" && !lead.dateAccepted) return false
    if (lead.status === "over" && !view.over && view.group !== "over") return false
    if (view.group && !inGroup(lead, view.group)) return false
    if (view.by && lead.swipedBy !== view.by) return false
    if (view.score !== undefined && (lead.score === null || lead.score < view.score)) return false
    if (view.real && lead.sample) return false
    if (view.q?.trim() && !matchesSearch(lead, view.q)) return false
    return true
  })
  const sort = view.sort ?? "changed"
  const up = (view.direction ?? defaultLeadDirection(sort)) === "asc" ? 1 : -1
  if (sort === "name") return shown.sort((a, b) => a.name.localeCompare(b.name) * up)
  // A card the AI has not scored goes last either way.
  if (sort === "score") return shown.sort((a, b) => (a.score === null ? 1 : 0) - (b.score === null ? 1 : 0) || ((a.score ?? 0) - (b.score ?? 0)) * up)
  return shown.sort((a, b) => Number(b.waiting !== null) - Number(a.waiting !== null) || (a.changedAt.getTime() - b.changedAt.getTime()) * up)
}

/** The counts on the left panel's groups card, over every lead that is not hidden as over. */
export function leadGroupCounts(leads: LeadListItem[]): Record<LeadGroup, number> {
  const counts = Object.fromEntries(LEAD_GROUPS.map((group) => [group, 0])) as Record<LeadGroup, number>
  for (const lead of leads) {
    for (const group of LEAD_GROUPS) if (inGroup(lead, group)) counts[group] += 1
  }
  return counts
}

function readFlag(value: unknown): true | undefined {
  return value === true || value === "true" ? true : undefined
}

/**
 * The list's view out of an address or a saved view, each value checked and
 * the defaults left out, so the same view is always the same address.
 */
export function readLeadView(values: Record<string, unknown>): LeadView {
  const view: LeadView = {}
  const tab = readOneOf(values.tab, LEAD_TABS)
  if (tab && tab !== "all") view.tab = tab
  const q = readSearchText(values.q)?.trim()
  if (q) view.q = q
  const group = readOneOf(values.group, LEAD_GROUPS)
  if (group) view.group = group
  const by = readOneOf(values.by, ["member", "ai"] as const)
  if (by) view.by = by
  const score = Number(values.score)
  if ((LEAD_SCORE_FLOORS as readonly number[]).includes(score)) view.score = score
  if (readFlag(values.over)) view.over = true
  if (readFlag(values.real)) view.real = true
  const sort = readOneOf(values.sort, LEAD_SORTS)
  if (sort && sort !== "changed") view.sort = sort
  const direction = readOneOf(values.direction, ["asc", "desc"] as const)
  if (direction && direction !== defaultLeadDirection(sort ?? "changed")) view.direction = direction
  return view
}
