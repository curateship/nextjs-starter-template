import type * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { AdminDashboardScreen } from "@/components/project/admin-dashboard"
import { ProjectsCard } from "@/components/project/admin-project-cards"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { InboxPage } from "@/components/project/inbox-card"
import type { NotificationItem } from "@/lib/api/notification"
import type { AdminDashboard } from "@/lib/api/project/admin-dashboard"
import type { DailyCard } from "@/lib/api/project/daily-card"
import type { TaskCard } from "@/lib/api/project/tasks"

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className, "aria-label": label }: { children: React.ReactNode; className?: string; "aria-label"?: string }) => (
    <a className={className} aria-label={label}>
      {children}
    </a>
  ),
  useRouter: () => ({ invalidate: vi.fn(), state: { location: { search: {} } }, history: { back: vi.fn() } }),
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
  useRouterState: () => ({}),
  getRouteApi: () => ({ useLoaderData: () => ({ user: { id: "tyler", name: "Tyler", role: "admin" } }) }),
}))
// The real check reads the incoming request, which a render to HTML doesn't have.
vi.mock("@/lib/layout/wide-screen", () => ({ useWideScreen: () => true }))
vi.mock("@/components/shell/shell-layout", () => ({
  useShellRuntime: () => ({ config: { dashboardRowsPerPage: 25 }, onOpenFeedbackThread: vi.fn() }),
  useOptionalShellRuntime: () => null,
}))

function card(id: string, title: string, overrides: Partial<TaskCard> = {}): TaskCard {
  return {
    id,
    projectId: "p1",
    projectName: "Acme · Website",
    projectClient: null,
    title,
    status: "todo",
    stuckReason: null,
    dueDate: null,
    dueAt: null,
    startDate: null,
    assignee: { id: "tyler", name: "Tyler", avatarUrl: "" },
    assignedBy: null,
    createdByUserId: "tyler",
    waiting: false,
    handoverNote: null,
    review: { needed: false, waiting: false, reviewer: null },
    formerAssigneeName: null,
    handedBack: null,
    commentCount: 0,
    unread: 0,
    pickedDays: 0,
    milestoneId: null,
    position: 0,
    completedAt: null,
    notesText: "",
    snoozedUntil: null,
    waitingOn: null,
    priority: "normal",
    dueMoves: 0,
    repeat: null,
    ...overrides,
  }
}

const empty: AdminDashboard["cards"] = {
  waiting: [],
  attention: [],
  unassigned: [],
  invites: [],
  meetings: [],
  dueThisWeek: [],
  projects: [],
  projectCards: { order: [], people: {}, finished: {} },
  milestones: [],
  doneToday: [],
}

/** One row in every card, so each one draws. */
const FULL: AdminDashboard["cards"] = {
  waiting: [
    { taskId: "w1", projectId: "p1", projectName: "Acme · Website", title: "Ask", askedByName: "Ben", day: "2099-03-06", dueDate: null, reason: null },
  ],
  attention: [{ teamId: "acme", teamName: "Acme", stuck: 1, overdue: 0, untouched: 0 }],
  unassigned: [{ taskId: "u1", projectId: "p1", projectName: "Acme · Website", title: "Loose", dueDate: null, people: [] }],
  invites: [{ userId: "cara", name: "Cara", email: "cara@example.test", teamId: "acme", teamName: "Acme" }],
  meetings: [
    { meetingId: "m1", title: "Standup", color: "blue", teamId: "acme", teamName: "Acme", startsAt: "2099-03-02T09:00:00Z", endsAt: "2099-03-02T09:15:00Z" },
  ],
  dueThisWeek: [card("d1", "Due task", { dueDate: "2099-03-04" })],
  projects: [
    {
      id: "p1",
      name: "Website",
      color: "blue",
      team: { name: "Acme" },
      counts: { todo: 2, doing: 0, done: 1, stuck: 0, archived: 0 },
      dated: [{ dueDate: "2000-01-01", status: "todo" }],
      slowingAt: 1,
      behindAt: 3,
      lead: null,
      dueDate: null,
      starred: true,
    } as unknown as AdminDashboard["cards"]["projects"][number],
  ],
  milestones: [{ id: "ms1", name: "Launch", dueDate: "2099-03-20", projectId: "p1", projectName: "Acme · Website", openTasks: 2 }],
  doneToday: [{ userId: "ben", name: "Ben", avatarUrl: "", tasks: [{ taskId: "x1", title: "Done", projectId: "p1", projectName: "Acme · Website" }] }],
}

function dashboard(cards: Partial<AdminDashboard["cards"]> = {}): AdminDashboard {
  return {
    me: { id: "tyler", name: "Tyler", email: "tyler@example.test", avatarUrl: "" },
    page: "",
    savedZone: "UTC",
    zone: "UTC",
    today: "2099-03-02",
    myOrder: [],
    tasks: [
      card("t1", "Send the contract", { projectId: "own", projectName: "Just me" }),
      card("t2", "Review the logo", { projectId: "p2", projectName: "Brand · Logo" }),
    ],
    views: [],
    viewScreen: "admin-tasks:tyler",
    noticesOff: [],
    statusOrder: ["todo", "doing", "done", "stuck"],
    people: [{ id: "ben", name: "Ben", avatarUrl: "" }],
    projectTeams: { p1: "acme", p2: "brand", own: "space" },
    projectInfo: {
      p1: { name: "Website", color: "blue", teamName: "Acme", movable: true },
      p2: { name: "Logo", color: "red", teamName: "Brand", movable: true },
      p3: { name: "Brand book", color: "green", teamName: "Brand", movable: true },
      own: { name: "Just me", color: "slate", teamName: null, movable: false },
    },
    cards: { ...empty, ...cards },
  }
}

const NO_INBOX = { notifications: [], nextCursor: null }

/** The Daily card at 9 AM on a Monday, with nothing on it yet. */
const DAILY: DailyCard = {
  loadedAt: "2099-03-02T09:00:00.000Z",
  firstName: "Tyler",
  siteAdmin: true,
  zone: "UTC",
  today: "2099-03-02",
  cardDay: "2099-03-02",
  settings: {
    hours: { morning: "05:00", afternoon: "12:00", night: "18:00" },
    city: null,
    sky: "drawn",
    ownSkies: { morning: "", afternoon: "", night: "" },
    reminders: { morning: "10:00", afternoon: "15:00", night: "21:00" },
    sections: ["meeting", "routine", "tomorrow"],
    hidden: [],
  },
  meetings: [],
  dayOff: null,
  admin: {
    habits: [],
    retired: [],
    finished: { current: 0, best: 0 },
    milestone: null,
    today: { day: "2099-03-02", rating: null, note: "", win: "", bedAt: null, upAt: null },
    lookBack: null,
    monthly: null,
    tomorrow: { meetings: [], due: [], moreDue: 0, away: [], holidays: [] },
  },
}

/** The Pinned projects card as the footer's button opens it. */
function cardOf(data: AdminDashboard, picked?: string) {
  return renderToStaticMarkup(
    <TooltipProvider>
      <ProjectsCard projects={data.cards.projects} extras={data.cards.projectCards} today={data.today} picked={picked} onPick={() => undefined} />
    </TooltipProvider>
  )
}

function render(data: AdminDashboard, inbox: InboxPage = NO_INBOX) {
  return renderToStaticMarkup(
    <TooltipProvider>
      <AdminDashboardScreen daily={DAILY} dashboard={data} inbox={inbox} search={{}} />
    </TooltipProvider>
  )
}

/** An announcement, which a row names by its title. */
function notice(n: number): NotificationItem {
  return {
    id: `n${n}`,
    type: "announcement",
    actor_name: null,
    actor_avatar_url: null,
    recipient_name: "Tyler",
    feedback_id: null,
    feedback_message: null,
    changelog_entry_id: null,
    changelog_title: null,
    announcement_id: `a${n}`,
    announcement_title: `Notice ${n}`,
    announcement_body: null,
    automation_run_id: null,
    automation_id: null,
    automation_name: null,
    automation_approval_summary: null,
    automation_approval_state: null,
    automation_failure_node_id: null,
    automation_failure_node_name: null,
    automation_failure_error: null,
    crm_thread_id: null,
    message: null,
    detail: null,
    read_at: null,
    created_at: new Date(Date.UTC(2099, 2, 2, 12, 0, n)).toISOString(),
  }
}

describe("the site admin's My dashboard", () => {
  it("has no check-in, names them Site admin, and mixes their own list with every team's", () => {
    const html = render(dashboard())
    expect(html).toContain(">Site admin<")
    expect(html).toContain(`aria-label="My settings"`)
    expect(html).not.toContain("Check in")
    expect(html).not.toContain("Time off")
    expect(html).toContain("Send the contract")
    expect(html).toContain("Review the logo")
    expect(html).toContain("New task")
  })

  it("opens My settings from a ⋮ in the header, with no cog and no Daily card pencil", () => {
    const html = render(dashboard())
    const header = html.slice(0, html.indexOf("data-notes-editor"))
    // Tyler, 6 Nov 2026: "it needs to be replaced with a 3 vertical icon".
    expect(header).toMatch(/aria-label="My settings"[^>]*>(?:(?!<\/button>).)*lucide-ellipsis-vertical/)
    expect(header).not.toContain("lucide-settings")
    expect(header).not.toContain("Edit the Daily card")
  })

  it("puts Search and Mass select behind a ⋮ after New task in My tasks' header", () => {
    const html = render(dashboard())
    const middle = html.slice(html.indexOf('id="middle"'), html.indexOf('id="right"'))
    expect(middle.indexOf('aria-label="More for My tasks"')).toBeGreaterThan(middle.indexOf('aria-label="New task"'))
    // Tyler, 6 Nov 2026: "move mass select and search under its dropdown".
    expect(middle).not.toContain('aria-label="Mass select"')
    expect(middle).not.toContain('aria-label="Search tasks"')
  })

  it("draws the List as the project page's table: Task, Project, Status, Priority, Due and Actions", () => {
    const html = render(dashboard())
    const headings = ["Task", "Project", "Status", "Priority", "Due", "Actions"]
    const at = headings.map((heading) => html.indexOf(`>${heading}<`))
    expect(at.every((index) => index >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    // Tyler, 23 Oct 2026: "remove the assigned to, steps and my team col".
    expect(html).not.toContain(">Assigned to<")
    expect(html).not.toContain(">Steps<")
    expect(html).not.toContain(">Team<")
    // The project is a chip that moves the task.
    expect(html).toContain(`aria-label="Project: Logo. Move it"`)
    expect(html).toContain(`aria-label="Project: Just me. Move it"`)
    expect(html).toContain(`aria-label="Delete Send the contract"`)
    // Each row says which task it is, for a right-click's Duplicate and Delete.
    expect(html).toContain(`data-task-id="t1"`)
  })

  it("puts a + on the List's headings a new task can start in, as on a project's List", () => {
    const data = dashboard()
    data.tasks.push(card("t3", "Late one", { dueDate: "2000-01-01" }))
    const html = render(data)
    expect(html).toContain('aria-label="Add a task to No date"')
    // A new task can't start overdue.
    expect(html).toContain("Overdue<")
    expect(html).not.toContain('aria-label="Add a task to Overdue"')
  })

  it("shows 6 notices in the Inbox, with Load more for the rest", () => {
    const notices = Array.from({ length: 8 }, (_, n) => notice(n))
    const html = render(dashboard(), { notifications: notices, nextCursor: null })
    expect(html).toContain("Notice 5")
    expect(html).not.toContain("Notice 6")
    expect(html).toContain(">Load more<")
    const few = render(dashboard(), { notifications: notices.slice(0, 3), nextCursor: null })
    expect(few).not.toContain(">Load more<")
    // More on the server: Load more fetches them.
    expect(render(dashboard(), { notifications: notices.slice(0, 3), nextCursor: "c1" })).toContain(">Load more<")
  })

  it("draws no card when every card is empty", () => {
    const html = render(dashboard())
    expect(html).not.toContain("All clear")
    for (const title of ["Waiting on you", "No one on it", "Due this week", "Done today"]) {
      expect(html).not.toContain(`${title}<`)
    }
  })

  it("puts the inbox behind a header icon with a red bubble, and shows the cards first", () => {
    const notices = Array.from({ length: 12 }, (_, n) => notice(n))
    const html = render(dashboard(), { notifications: notices, nextCursor: null })
    expect(html).toContain('aria-label="Inbox, 12 unread"')
    expect(html).toContain('aria-pressed="false"')
    expect(html).toMatch(/bg-destructive[^>]*>9\+</)
    // The inbox waits hidden in the panel, with no card around it, its tabs underlined.
    expect(html).toMatch(/hidden"><section[^>]*aria-label="Inbox"/)
    expect(html).toMatch(/aria-label="Inbox"(?:(?!<\/section>).)*data-slot="dashboard-tab"/)
    expect(html).not.toContain("project-my-inbox")
    expect(render(dashboard())).toContain('aria-label="Inbox"')
  })

  it("leaves out empty cards when one card has rows", () => {
    const html = render(dashboard({ dueThisWeek: [card("d1", "Due task", { dueDate: "2099-03-04" })] }))
    expect(html).toContain("Due this week<")
    expect(html).not.toContain("No one on it<")
  })

  it("draws the cards in Tyler's order", () => {
    const html = render(dashboard(FULL))
    const order = [
      "Waiting on you",
      "Urgent",
      "No one on it",
      "Invites not taken",
      "Due this week",
      "Meetings today",
      "Milestones this month",
      "Done today",
    ]
    const at = order.map((title) => html.indexOf(`${title}<`))
    expect(at.every((index) => index >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    // Tinted by how much each matters: two red, three amber, two blue, Done today green.
    const cards = (tint: string) => html.match(new RegExp(`group/card[^"]*${tint}`, "g")) ?? []
    expect(cards("bg-red-500/10")).toHaveLength(2)
    expect(cards("bg-amber-500/10")).toHaveLength(3)
    expect(cards("bg-blue-500/10")).toHaveLength(2)
    expect(cards("bg-emerald-500/10")).toHaveLength(1)
  })

  it("puts my page under the sky, then a footer of Pinned projects, Need your attention and the Daily card, each its own rounded grey box", () => {
    const html = render(dashboard(FULL))
    const left = html.slice(0, html.indexOf('id="middle"'))
    const footerAt = left.indexOf("<footer")
    const footer = left.slice(footerAt, left.indexOf("</footer>"))
    expect(left.indexOf("data-notes-editor")).toBeGreaterThan(-1)
    expect(left.indexOf("data-notes-editor")).toBeLessThan(footerAt)
    // Nothing but the page above the footer.
    expect(left.slice(0, footerAt)).not.toContain("Need your attention")
    const at = [footer.indexOf(">Pinned projects<"), footer.indexOf(">Need your attention<"), footer.indexOf('aria-label="Daily card"')]
    expect(at.every((index) => index >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    // Three rounded light grey boxes, 10px apart and from the edges, with no lines between them.
    expect(footer.match(/rounded-2xl bg-muted\/50/g)).toHaveLength(3)
    expect(footer).not.toContain("divide-y")
    // The projects are in the footer, and no phone tab of their own any more.
    expect(footer).toContain("group/block")
    expect(html).not.toContain(">Pinned<")
  })

  it("puts Start day in the footer until the day starts, then the habits, and Rate your day under them at night", () => {
    const footerOf = (daily: DailyCard) => {
      const html = renderToStaticMarkup(
        <TooltipProvider>
          <AdminDashboardScreen daily={daily} dashboard={dashboard()} inbox={NO_INBOX} search={{}} />
        </TooltipProvider>
      )
      return { html, footer: html.slice(html.indexOf("<footer"), html.indexOf("</footer>")) }
    }
    const morning = footerOf(DAILY)
    expect(morning.footer).toContain("Good morning Tyler")
    expect(morning.footer).toContain(">Start day<")
    expect(morning.html.split(">Start day<")).toHaveLength(2)
    // Off the sky, the greeting needs no room above it.
    expect(morning.footer).not.toMatch(/group\/fold[^"]*mt-6/)
    // The date is inside the card, so it folds away with it, leaving the greeting.
    expect(morning.footer).toMatch(/<\/h2>(?:(?!<\/h2>).)*Mar 2, 2099/)

    const started = { ...DAILY, admin: { ...DAILY.admin!, today: { ...DAILY.admin!.today, upAt: "2099-03-02T08:00:00.000Z" } } }
    const day = footerOf(started)
    expect(day.footer).not.toContain(">Start day<")
    expect(day.footer).not.toContain("Rate your day")
    const night = footerOf({ ...started, loadedAt: "2099-03-02T20:00:00.000Z" })
    expect(night.footer).toContain("Rate your day")
    expect(night.footer).toContain("No meetings, due dates or days off tomorrow.")
  })

  it("marks the open task's row in the cards, and puts its project's dot before every task row", () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <AdminDashboardScreen daily={DAILY} dashboard={dashboard(FULL)} inbox={NO_INBOX} search={{ task: "d1" }} />
      </TooltipProvider>
    )
    const left = html.slice(0, html.indexOf('id="middle"'))
    expect(left).toMatch(/<button[^>]*aria-current="true"[^>]*>(?:(?!<\/button>).)*>Due task</)
    expect(left).not.toMatch(/<button[^>]*aria-current="true"[^>]*>(?:(?!<\/button>).)*>Loose</)
    // Website is blue: its dot sits before each task row's title, as on a meeting's row.
    for (const title of ["Due task", "Loose"]) {
      expect(left).toMatch(new RegExp(`bg-blue-500[^"]*"></span><span class="truncate">${title}<`))
    }
  })

  it("puts the meeting on now first with Now beside it, and fades one that has finished", () => {
    const meetings = [
      { meetingId: "m1", title: "Standup", color: "blue" as const, teamId: "acme", teamName: "Acme", startsAt: "2099-03-02T08:00:00Z", endsAt: "2099-03-02T08:15:00Z" },
      { meetingId: "m2", title: "Client call", color: "green" as const, teamId: "acme", teamName: "Acme", startsAt: "2099-03-02T09:00:00Z", endsAt: "2099-03-02T09:30:00Z" },
    ]
    // The Daily card loaded at 9 AM, so the client call is on and standup is over.
    const html = render(dashboard({ meetings }))
    expect(html.indexOf(">Client call<")).toBeLessThan(html.indexOf(">Standup<"))
    expect(html).toMatch(/>Client call<\/span><span[^>]*data-slot="badge"[^>]*>Now</)
    expect(html).toMatch(/opacity-60[^>]*>(?:(?!<\/a>).)*>Standup</)
  })

  it("offers Clear filters in the message when a search hides every task", () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <AdminDashboardScreen daily={DAILY} dashboard={dashboard()} inbox={NO_INBOX} search={{ q: "zzz" }} />
      </TooltipProvider>
    )
    expect(html).toContain("No tasks match &quot;zzz&quot;.")
    expect(html).toMatch(/<button[^>]*>Clear filters<\/button>/)
    expect(html).not.toContain("Clear the filters to see them all")
  })

  it("gives the site admin a page they can write in, empty or not", () => {
    // The editor itself draws in the browser; here only its writing box is in the page.
    const body = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Ship the redesign" }] }] })
    expect(render({ ...dashboard(), page: body })).toContain("data-notes-editor")
    expect(render(dashboard())).toContain("data-notes-editor")
  })

  it("draws a Pinned projects card: only pinned ones, late first and tinted, stuck, due date, lead, faces, idle lines", () => {
    const row = (id: string, name: string, extra: object) =>
      ({
        id,
        name,
        color: "blue",
        team: { id: "acme", name: "Acme" },
        counts: { todo: 2, doing: 1, done: 3, stuck: 0, archived: 0 },
        dated: [],
        slowingAt: 1,
        behindAt: 3,
        lead: null,
        dueDate: null,
        starred: true,
        ...extra,
      }) as unknown as AdminDashboard["cards"]["projects"][number]
    const data = dashboard({
        projects: [
          row("p1", "Brochure", {
            dueDate: "2099-03-24",
            lead: { id: "pri", name: "Priya", avatarUrl: "" },
          }),
          row("p2", "Rebrand", {
            counts: { todo: 3, doing: 0, done: 0, stuck: 2, archived: 0 },
            dated: ["2000-01-01", "2000-01-02", "2000-01-03"].map((dueDate) => ({ dueDate, dueAt: null, status: "todo" })),
          }),
          row("p3", "Archive photos", { counts: { todo: 0, doing: 0, done: 4, stuck: 0, archived: 0 } }),
          row("p4", "Old blog", { starred: false }),
        ],
        projectCards: {
          order: [],
          people: { p1: { faces: [{ id: "ben", name: "Ben Tester", avatarUrl: "" }], total: 6 } },
          finished: { p1: [0, 1, 0, 2, 0, 0, 1, 0, 0, 3, 0, 0, 1, 2] },
        },
      })
    const html = cardOf(data)
    expect(html).toContain("Pinned projects<")
    // Projects have no avatar (Tyler, 5 Nov 2026): each card shows its colour as a full 36px dot.
    expect(html).toMatch(/size-9"><\/span><span class="grid[^>]*><span class="truncate[^>]*>Brochure</)
    expect(html).toMatch(/rounded-full bg-blue-500 size-9"><\/span><span class="grid[^>]*><span class="truncate[^>]*>Rebrand</)
    // Behind first, in red, with its stuck count; On track after it, untinted.
    expect(html.indexOf(">Rebrand<")).toBeLessThan(html.indexOf(">Brochure<"))
    expect(html).toMatch(/border-red-500\/20[^"]*"[^>]*>(?:(?!<li).)*>Rebrand</)
    expect(html).toContain("2 stuck")
    expect(html).toContain("3 late")
    expect(html).toContain("0/5 done")
    expect(html).toContain("Due Mar 24, 2099 · 22 days left")
    expect(html).toContain("Lead: Priya.")
    expect(html).toContain("+5")
    expect(html).toContain("10 tasks finished in the last two weeks.")
    // Nothing open: a thin line under the blocks. Not pinned: not on the card, and no Hidden list.
    expect(html).toContain(", nothing open. Show it in full.")
    expect(html.indexOf(">Archive photos<")).toBeGreaterThan(html.indexOf(">Brochure<"))
    expect(html).not.toContain(">Old blog<")
    expect(html).not.toContain("Hidden<")
    // Three pinned, counted beside the heading on a light grey patch.
    expect(html).toMatch(/>Pinned projects<span class="[^"]*bg-background[^"]*">3</)
    // Each has its own New task, the pin that unpins it, and Open.
    expect(html).toContain('aria-label="New task in Brochure"')
    expect(html).toContain('aria-label="Unpin Brochure"')
    expect(html).not.toContain("from this card")
    expect(html).toContain('aria-label="Open Brochure"')
    expect(html).toContain('aria-pressed="false"')
    // Under the projects, the way to every project (Tyler, 6 Nov 2026: "move the all
    // projects link to the bottom"), always shown.
    expect(html).toMatch(/<a [^>]*>All projects<svg/)
    expect(html.indexOf(">All projects<")).toBeGreaterThan(html.indexOf(">Archive photos<"))
  })

  it("says how to pin one, and still links to every project, when nothing is pinned", () => {
    const data = dashboard({ projects: FULL.projects.map((project) => ({ ...project, starred: false })) })
    const html = cardOf(data)
    expect(html).toContain("Pin a project on the Projects page to see it here.")
    expect(html).toMatch(/<a [^>]*>All projects<svg/)
    expect(html).toMatch(/>Pinned projects<span class="[^"]*bg-background[^"]*">0</)
  })

  it("has no Pinned projects card, and no empty strip for it, when there are no open projects at all", () => {
    const footer = render(dashboard()).split("<footer")[1]
    expect(footer).not.toContain(">Pinned projects<")
    expect(footer).toMatch(/<div class="[^"]*rounded-2xl[^"]*empty:hidden[^"]*"><\/div>/)
  })

  it("leaves a section hidden with the eye off the Daily card", () => {
    const started = { ...DAILY, admin: { ...DAILY.admin!, today: { ...DAILY.admin!.today, upAt: "2099-03-02T08:00:00.000Z" } } }
    const draw = (daily: DailyCard) =>
      renderToStaticMarkup(
        <TooltipProvider>
          <AdminDashboardScreen daily={daily} dashboard={dashboard()} inbox={NO_INBOX} search={{}} />
        </TooltipProvider>
      )
    const night = { ...started, loadedAt: "2099-03-02T20:00:00.000Z" }
    expect(draw(night)).toContain("No meetings, due dates or days off tomorrow.")
    expect(draw({ ...night, settings: { ...night.settings, hidden: ["tomorrow"] } })).not.toContain("No meetings, due dates or days off tomorrow.")
  })

  it("labels afternoon's and night's habits, not morning's, ticks counted ones too with no minus, names the section after its first part with each part's starting hour, and drops the finished days line", () => {
    const habit = (id: string, part: "morning" | "afternoon" | "night", position: number) => ({
      ...({} as NonNullable<DailyCard["admin"]>["habits"][number]),
      id,
      name: `Habit ${id}`,
      icon: null,
      part,
      target: 1,
      position,
      atTime: null,
      setToday: true,
      count: 0,
      streak: { current: 0, best: 0 },
    })
    const daily = {
      ...DAILY,
      admin: {
        ...DAILY.admin!,
        today: { ...DAILY.admin!.today, upAt: "2099-03-02T08:00:00.000Z" },
        finished: { current: 3, best: 5 },
        habits: [habit("a", "morning", 0), habit("b", "afternoon", 0), habit("c", "night", 0), { ...habit("d", "night", 1), target: 8, count: 3 }],
      },
    }
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <AdminDashboardScreen daily={daily} dashboard={dashboard()} inbox={NO_INBOX} search={{}} />
      </TooltipProvider>
    )
    const labels = [...html.matchAll(/<li class="pt-3[^"]*">([^<]+)<\/li>/g)].map((m) => m[1])
    expect(labels).toEqual(["Afternoon - 12:00 PM", "Night - 6:00 PM"])
    expect(html).toContain("Morning - 5:00 AM")
    expect(html).not.toContain("Today&#x27;s habits")
    expect(html.match(/role="checkbox"/g)?.length).toBe(4)
    expect(html).toContain("One more Habit d")
    expect(html).not.toContain("One less")
    expect(html).not.toContain("Finished days")
  })

  it("marks the project My tasks is filtered to, and offers it in Filter", () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <AdminDashboardScreen daily={DAILY} dashboard={dashboard(FULL)} inbox={NO_INBOX} search={{ project: "p1" }} />
      </TooltipProvider>
    )
    // The line under the heading names the project, so the filter shows with the card folded too.
    expect(html).toMatch(/>Pinned projects<(?:(?!<\/h2>).)*>Showing only Website</)
    expect(html).toContain("Showing only this project&#x27;s tasks. Press to show them all.")
    expect(html).toContain('aria-pressed="true"')
    // Both of the site admin's tasks are in other projects, so the List is empty.
    // The Daily card on the left still names them: deep work follows no filter.
    const middle = html.slice(html.indexOf('id="middle"'), html.indexOf('id="right"'))
    expect(middle).not.toContain("Send the contract")
    expect(html).toContain('aria-label="Filter, 1 set"')
  })

  it("shows five rows and Show all for the rest, with Yes and No on an ask and Hand to on a loose task", () => {
    const due = Array.from({ length: 7 }, (_, n) => card(`d${n}`, `Due task ${n}`, { dueDate: "2099-03-04" }))
    const html = render(
      dashboard({
        dueThisWeek: due,
        waiting: [
          {
            taskId: "w1",
            projectId: "p1",
            projectName: "Acme · Website",
            title: "Homepage copy",
            askedByName: "Ben",
            day: "2099-03-06",
            dueDate: "2099-03-04",
            reason: "Waiting on photos",
          },
        ],
        unassigned: [
          {
            taskId: "u1",
            projectId: "p1",
            projectName: "Acme · Website",
            title: "Fix the footer",
            dueDate: null,
            people: [{ userId: "ben", name: "Ben", avatarUrl: "" }],
          },
        ],
      })
    )
    expect(html).toContain("Due task 4")
    expect(html).not.toContain("Due task 5")
    expect(html).toContain("Show all 7")
    expect(html).toContain("Ben asks for")
    expect(html).toContain("Waiting on photos")
    expect(html).toContain(">Yes<")
    expect(html).toContain(">No<")
    expect(html).toContain(`aria-label="Hand &quot;Fix the footer&quot; to"`)
  })

  it("opens a task with no cross on the right", () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <AdminDashboardScreen daily={DAILY} dashboard={dashboard()} inbox={NO_INBOX} search={{ task: "t1" }} />
      </TooltipProvider>
    )
    expect(html).not.toContain("Close the task")
  })
})
