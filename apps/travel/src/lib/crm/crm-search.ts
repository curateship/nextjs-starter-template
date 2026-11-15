import { readContactsSearch, type ContactsSearch } from "@/lib/contacts/contacts-search"
import {
  CRM_INBOX_SORTS,
  CRM_STAGES,
  type CrmInboxSort,
  type CrmStage,
} from "@/lib/crm/crm"
import { readOpenSearch } from "@/lib/hooks/use-open-from-link"
import { readDirection, readOneOf, readPage, readSearchText } from "@/lib/nav/list-search"
import { isSystemEmailKind, type SystemEmailKind } from "@/lib/system-emails/kinds"

/**
 * The CRM dashboard's address (Part C of the CRM task, 7 Nov 2026: one screen
 * for all the app's email). `?tab=` picks the section, from the left page's
 * Dashboards block, `?view=` the pill under it, and the rest belongs to that
 * section alone. Overview owns no keys.
 *
 * **Each tab reads only its own keys.** The inbox and the people list both use
 * `open`, `q` and `sort`, and they mean different things: a contact's id is
 * not a conversation. So picking a tab starts the address again with the new
 * tab alone, and the reader below drops every key the tab showing does not own.
 */
export const CRM_TABS = ["overview", "inbox", "leads", "subscribers", "broadcasts", "system"] as const
export type CrmTab = (typeof CRM_TABS)[number]

/**
 * Each section's name in the Dashboards block, in its order (Tyler, 8 Nov
 * 2026: picked "Overview, Inbox, People, Broadcasts"). Contacts are named
 * People because the list holds leads too.
 */
export const CRM_TAB_LABELS: Record<CrmTab, string> = {
  overview: "Overview",
  inbox: "Inbox",
  // Leads and Subscribers are two lists since 9 Nov 2026 (Tyler: "leads are
  // completely seperate from people ... people should be renamed to
  // subscribers"); before, People held both.
  leads: "Leads",
  subscribers: "Subscribers",
  broadcasts: "Broadcasts",
  // A section of its own since 9 Nov 2026 (Tyler: "for CRM dashboard. Bring
  // the systems email to its own dashboard"), a tab of the CRM settings ⋮
  // before.
  system: "System emails",
}

/**
 * What the inbox shows when nobody has chosen: the open conversations. Named
 * once because the loader and the filter control both use it.
 */

/** Inbox's views. Outbox is the local development outbox, shown only where it exists. */
export const CRM_INBOX_VIEWS = ["all", "unread", "saved", "waiting", "outbox"] as const
export type CrmInboxView = (typeof CRM_INBOX_VIEWS)[number]


/**
 * Broadcasts' views. All first and the default, every newsletter under a
 * folding heading per state (Tyler, 7 Nov 2026: "broacast table needs to have
 * an 'all' view with section toggle").
 */
export const CRM_BROADCAST_VIEWS = ["all", "drafts", "scheduled", "sent", "templates"] as const
export type CrmBroadcastView = (typeof CRM_BROADCAST_VIEWS)[number]

/** Subscribers' keys: the list's own (search, rules, segment, sort, page). */
export type CrmPeopleSearch = ContactsSearch

/** Leads' keys: the lead open on the right, then the list state. */
/**
 * What the Leads list sorts by: every column (Tyler, 9 Nov 2026: "missing
 * sorting"). Stage goes in the pipeline's order, New to Lost.
 */
export const CRM_LEAD_SORTS = ["created", "name", "email", "company", "stage", "value"] as const
export type CrmLeadSort = (typeof CRM_LEAD_SORTS)[number]

export type CrmLeadsSearch = {
  open?: string
  q?: string
  /** One stage only, from the Leads card or Filter; absent is every lead. */
  stage?: CrmStage
  sort?: CrmLeadSort
  direction?: "asc" | "desc"
  page?: number
}

export type CrmBroadcastSearch = {
  /** The newsletter, or the template, open on the right. */
  open?: string
  q?: string
  view?: Exclude<CrmBroadcastView, "all">
}

/** System emails' keys: the one open on the right (its kind), and the search. */
export type CrmSystemEmailsSearch = {
  open?: SystemEmailKind
  q?: string
}

/**
 * One flat type for the router, because TanStack's search has one shape per
 * route. What is in it at any moment is one tab's keys, as `readCrmSearch`
 * leaves them.
 */
export type CrmSearch = {
  /** Inbox when absent; written out once somebody picks a tab. */
  tab?: CrmTab
  open?: string
  q?: string
  view?: CrmInboxView | CrmBroadcastView
  sort?: CrmInboxSort | NonNullable<ContactsSearch["sort"]> | NonNullable<CrmLeadsSearch["sort"]>
  // Inbox
  stage?: CrmStage | "all"
  to?: string
  tag?: string
  due?: boolean
  // People
  segment?: string
  direction?: "asc" | "desc"
  page?: number
  size?: number
  filter?: ContactsSearch["filter"]
}

export function readCrmSearch(search: Record<string, unknown>): CrmSearch {
  const tab = readOneOf(search.tab, CRM_TABS)
  if (tab === "overview") return { tab }
  if (tab === "subscribers") {
    return { tab, ...readContactsSearch(search) }
  }
  if (tab === "leads") {
    return {
      tab,
      ...readOpenSearch(search),
      q: readSearchText(search.q),
      stage: readOneOf(search.stage, CRM_STAGES),
      sort: readOneOf(search.sort, CRM_LEAD_SORTS),
      direction: readDirection(search.direction),
      page: readPage(search.page),
    }
  }
  if (tab === "system") {
    return {
      tab,
      open: typeof search.open === "string" && isSystemEmailKind(search.open) ? search.open : undefined,
      q: readSearchText(search.q),
    }
  }
  if (tab === "broadcasts") {
    return {
      tab,
      ...readOpenSearch(search),
      q: readSearchText(search.q),
      view: readOneOf(search.view, CRM_BROADCAST_VIEWS.filter((view) => view !== "all")),
    }
  }
  return {
    tab,
    ...readOpenSearch(search),
    q: readSearchText(search.q),
    stage: readOneOf(search.stage, [...CRM_STAGES, "all"] as const),
    view: readOneOf(search.view, CRM_INBOX_VIEWS.filter((entry) => entry !== "all")),
    to: readSearchText(search.to),
    tag: readSearchText(search.tag),
    due: search.due === true || search.due === "true" ? true : undefined,
    sort: readOneOf(search.sort, CRM_INBOX_SORTS),
  }
}


/**
 * The section showing, Inbox when the address does not say: an Overview with
 * no widgets is no place to land.
 */
export function crmTabOf(search: CrmSearch): CrmTab {
  return search.tab ?? "inbox"
}

/**
 * The whole address for a section picked in the Dashboards block: the section
 * and nothing else.
 * Inbox is written out too, because a bare `/admin/crm` is what sends the
 * dashboard back to where it last was, and picking Inbox must not do that.
 */
export function crmTabSearch(tab: CrmTab, extra: Partial<CrmSearch> = {}): CrmSearch {
  return { tab, ...extra }
}
