import { readContactsSearch, type ContactsSearch } from "@/lib/contacts/contacts-search"
import {
  CRM_INBOX_SORTS,
  CRM_STAGES,
  CRM_THREAD_STATUSES,
  type CrmInboxSort,
  type CrmStage,
  type CrmThreadStatus,
} from "@/lib/crm/crm"
import { readOpenSearch } from "@/lib/hooks/use-open-from-link"
import { readOneOf, readSearchText } from "@/lib/nav/list-search"
import { isSystemEmailKind, type SystemEmailKind } from "@/lib/system-emails/kinds"

/**
 * The CRM dashboard's address (Part C of the CRM task, 7 Nov 2026: one screen
 * for all the app's email). `?tab=` picks what the middle panel holds,
 * `?view=` the pill under it, and the rest belongs to that tab alone.
 *
 * **Each tab reads only its own keys.** The inbox and the people list both use
 * `open`, `q` and `sort`, and they mean different things: a contact's id is
 * not a conversation. So picking a tab starts the address again with the new
 * tab alone, and the reader below drops every key the tab showing does not own.
 */
export const CRM_TABS = ["broadcasts", "inbox", "people"] as const
export type CrmTab = (typeof CRM_TABS)[number]

/**
 * What the inbox shows when nobody has chosen: the open conversations. Named
 * once because the loader and the filter control both use it.
 */
export const CRM_DEFAULT_STATUS = "open" as const

/** Inbox's views. Outbox is the local development outbox, shown only where it exists. */
export const CRM_INBOX_VIEWS = ["all", "unread", "saved", "waiting", "outbox"] as const
export type CrmInboxView = (typeof CRM_INBOX_VIEWS)[number]

/**
 * People's one pill that is not a set of rules. All is no rules at all,
 * Subscribers and Opted out are the status rules Filter writes (so the pill
 * lights when the rules match it), and a segment is `?segment=`.
 */
export const CRM_PEOPLE_VIEWS = ["leads"] as const
export type CrmPeopleView = (typeof CRM_PEOPLE_VIEWS)[number]

/**
 * Broadcasts' views. All first and the default, every newsletter under a
 * folding heading per state (Tyler, 7 Nov 2026: "broacast table needs to have
 * an 'all' view with section toggle").
 */
export const CRM_BROADCAST_VIEWS = ["all", "drafts", "scheduled", "sent", "templates"] as const
export type CrmBroadcastView = (typeof CRM_BROADCAST_VIEWS)[number]

export type CrmPeopleSearch = ContactsSearch & { view?: CrmPeopleView }

export type CrmBroadcastSearch = {
  /** The newsletter, or the template, open on the right. */
  open?: string
  q?: string
  view?: Exclude<CrmBroadcastView, "all">
  /**
   * One of the app's own emails, open on the right in place of a newsletter.
   * Picked in the CRM settings ⋮'s System emails tab.
   */
  system?: SystemEmailKind
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
  view?: CrmInboxView | CrmPeopleView | CrmBroadcastView
  sort?: CrmInboxSort | NonNullable<ContactsSearch["sort"]>
  // Inbox
  status?: CrmThreadStatus | "all"
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
  // Broadcasts
  system?: SystemEmailKind
}

export function readCrmSearch(search: Record<string, unknown>): CrmSearch {
  const tab = readOneOf(search.tab, CRM_TABS)
  if (tab === "people") {
    return { tab, ...readContactsSearch(search), view: readOneOf(search.view, CRM_PEOPLE_VIEWS) }
  }
  if (tab === "broadcasts") {
    return {
      tab,
      ...readOpenSearch(search),
      q: readSearchText(search.q),
      view: readOneOf(search.view, CRM_BROADCAST_VIEWS.filter((view) => view !== "all")),
      system: typeof search.system === "string" && isSystemEmailKind(search.system) ? search.system : undefined,
    }
  }
  return {
    tab,
    ...readOpenSearch(search),
    q: readSearchText(search.q),
    status: readOneOf(search.status, [...CRM_THREAD_STATUSES, "all"] as const),
    stage: readOneOf(search.stage, [...CRM_STAGES, "all"] as const),
    view: readOneOf(search.view, CRM_INBOX_VIEWS.filter((entry) => entry !== "all")),
    to: readSearchText(search.to),
    tag: readSearchText(search.tag),
    due: search.due === true || search.due === "true" ? true : undefined,
    sort: readOneOf(search.sort, CRM_INBOX_SORTS),
  }
}


/** The tab showing, Inbox when the address does not say. */
export function crmTabOf(search: CrmSearch): CrmTab {
  return search.tab ?? "inbox"
}

/**
 * The whole address for a tab picked in the header: the tab and nothing else.
 * Inbox is written out too, because a bare `/admin/crm` is what sends the
 * dashboard back to where it last was, and picking Inbox must not do that.
 */
export function crmTabSearch(tab: CrmTab, extra: Partial<CrmSearch> = {}): CrmSearch {
  return { tab, ...extra }
}
