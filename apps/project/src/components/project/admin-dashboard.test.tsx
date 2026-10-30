import type * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { AdminDashboardScreen } from "@/components/project/admin-dashboard"
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
    steps: { done: 0, total: 0 },
    commentCount: 0,
    unread: 0,
    pickedDays: 0,
    labels: [],
    milestoneId: null,
    position: 0,
    completedAt: null,
    notesText: "",
    snoozedUntil: null,
    waitingOn: null,
    priority: "normal",
    dueMoves: 0,
    repeat: null,
    type: null,
    fieldValues: {},
    clock: { seconds: 0, runningSince: null },
    guessMinutes: null,
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
  projectCards: { hidden: [], order: [], people: {}, finished: {} },
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
    } as unknown as AdminDashboard["cards"]["projects"][number],
  ],
  milestones: [{ id: "ms1", name: "Launch", dueDate: "2099-03-20", projectId: "p1", projectName: "Acme · Website", openTasks: 2 }],
  doneToday: [{ userId: "ben", name: "Ben", avatarUrl: "", tasks: [{ taskId: "x1", title: "Done", projectId: "p1", projectName: "Acme · Website" }] }],
}

function dashboard(cards: Partial<AdminDashboard["cards"]> = {}): AdminDashboard {
  return {
    me: { id: "tyler", name: "Tyler", email: "tyler@example.test", avatarUrl: "" },
    savedZone: "UTC",
    zone: "UTC",
    today: "2099-03-02",
    myOrder: [],
    tasks: [
      card("t1", "Send the contract", { projectId: "own", projectName: "Just me" }),
      card("t2", "Review the logo", { projectId: "p2", projectName: "Brand · Logo" }),
    ],
    labels: [],
    taskTypes: [],
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
    ownLines: [],
    ownQuestions: [],
    reminders: { morning: "10:00", afternoon: "15:00", night: "21:00" },
    sections: ["line", "progress", "deepWork", "meeting", "windDown", "routine", "journal"],
  },
  meetings: [],
  clock: { seconds: 0, running: null },
  finishedToday: [],
  dayOff: null,
  admin: {
    habits: [],
    retired: [],
    finished: { current: 0, best: 0 },
    milestone: null,
    today: { day: "2099-03-02", intention: "", rating: null, note: "", win: "", question: "", answer: "", bedAt: null, upAt: null },
    tomorrowIntention: "",
    line: "Start with the task you keep walking around.",
    question: "What gave you energy today?",
    onThisDay: null,
    lookBack: null,
    monthly: null,
    tomorrow: { meetings: [], due: [], moreDue: 0, away: [], holidays: [] },
  },
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
      "Projects",
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
    // The Projects card isn't tinted; its Slowing down project is, amber.
    const cards = (tint: string) => html.match(new RegExp(`group/card[^"]*${tint}`, "g")) ?? []
    expect(cards("bg-red-500/10")).toHaveLength(2)
    expect(cards("bg-amber-500/10")).toHaveLength(3)
    expect(cards("bg-blue-500/10")).toHaveLength(2)
    expect(cards("bg-emerald-500/10")).toHaveLength(1)
    expect(html).toMatch(/group\/block[^"]*border-amber-500\/25/)
  })

  it("draws a Projects card: late projects first and tinted, stuck, due date, lead, faces, idle lines and hidden ones", () => {
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
        ...extra,
      }) as unknown as AdminDashboard["cards"]["projects"][number]
    const html = render(
      dashboard({
        projects: [
          row("p1", "Brochure", {
            dueDate: "2099-03-24",
            lead: { id: "pri", name: "Priya", avatarUrl: "" },
            avatarUrl: "https://example.test/brochure.png",
          }),
          row("p2", "Rebrand", {
            counts: { todo: 3, doing: 0, done: 0, stuck: 2, archived: 0 },
            dated: ["2000-01-01", "2000-01-02", "2000-01-03"].map((dueDate) => ({ dueDate, dueAt: null, status: "todo" })),
          }),
          row("p3", "Archive photos", { counts: { todo: 0, doing: 0, done: 4, stuck: 0, archived: 0 } }),
          row("p4", "Old blog", {}),
        ],
        projectCards: {
          hidden: ["p4"],
          order: [],
          people: { p1: { faces: [{ id: "ben", name: "Ben Tester", avatarUrl: "" }], total: 6 } },
          finished: { p1: [0, 1, 0, 2, 0, 0, 1, 0, 0, 3, 0, 0, 1, 2] },
        },
      })
    )
    expect(html).toContain("Projects<")
    // The project's own picture, or its colour as a dot the same 24px size.
    expect(html).toMatch(/<img src="https:\/\/example.test\/brochure.png" alt="" class="size-9 /)
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
    // Nothing open: a thin line under the blocks. Hidden: behind "Hidden 1" at the heading's right.
    expect(html).toContain(", nothing open. Show it in full.")
    expect(html.indexOf(">Archive photos<")).toBeGreaterThan(html.indexOf(">Brochure<"))
    expect(html).toMatch(/Hidden<span class="text-muted-foreground\/70">1</)
    expect(html).not.toContain(">Old blog<")
    // Each has its own New task, Hide and Open.
    expect(html).toContain('aria-label="New task in Brochure"')
    expect(html).toContain('aria-label="Hide Brochure from this card"')
    expect(html).toContain('aria-label="Open Brochure"')
    expect(html).toContain('aria-pressed="false"')
  })

  it("marks the project My tasks is filtered to, and offers it in Filter", () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <AdminDashboardScreen daily={DAILY} dashboard={dashboard(FULL)} inbox={NO_INBOX} search={{ project: "p1" }} />
      </TooltipProvider>
    )
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
